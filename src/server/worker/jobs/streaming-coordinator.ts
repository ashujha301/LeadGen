import { getEnv } from "@/shared/config/server";
import {
  enrichCompany,
  isCrustdataEnabled,
  lookupDomain,
  searchPeopleByCompany,
} from "@/server/infrastructure/connectors";
import {
  getDb,
  requestLimitsRepo,
  runEventsRepo,
  runsRepo,
  startOfUtcDay,
} from "@/server/infrastructure/db";

import { discover } from "../stages/discover";
import { extract } from "../stages/extract";
import { normalize } from "../stages/normalize";
import { resolve } from "../stages/resolve";
import { enrich } from "../stages/enrich";
import { enrichPersons } from "../stages/enrich-persons";
import { persistInitialProviderResults } from "../stages/persist-initial-providers";
import { calculateConfidence } from "../stages/calculate-confidence";
import { scoreLeadsIncremental } from "../stages/score-leads-incremental";

import type { ProcessRunPayload, StageContext } from "./process-run";

type ProviderResults = {
  rdap: Awaited<ReturnType<typeof lookupDomain>> | null;
  crustdataCompany: Awaited<ReturnType<typeof enrichCompany>> | null;
  crustdataPersonSearch: Awaited<ReturnType<typeof searchPeopleByCompany>> | null;
};

export async function runStreamingPipeline(payload: ProcessRunPayload): Promise<void> {
  const db = getDb();
  const run = await runsRepo.getRunById(db, payload.runId);

  if (!run) {
    throw new Error(`Run ${payload.runId} not found`);
  }

  if (run.status === "completed" || run.status === "failed") {
    console.log(`[streaming] Skipping terminal run ${payload.runId} (${run.status})`);
    return;
  }

  const claimed = await runsRepo.claimRunForProcessing(db, payload.runId);
  if (!claimed) {
    console.log(`[streaming] Run ${payload.runId} is not claimable`);
    return;
  }

  const ctx: StageContext = {
    runId: run.id,
    domain: run.inputDomain,
    normalizedDomain: run.normalizedDomain,
  };

  console.log(`[streaming] Starting run ${ctx.runId} for ${ctx.normalizedDomain}`);

  const providerResults: ProviderResults = {
    rdap: null,
    crustdataCompany: null,
    crustdataPersonSearch: null,
  };

  const timings = {
    rdapStarted: Date.now(),
    crustdataCompanyStarted: Date.now(),
    crustdataPersonSearchStarted: Date.now(),
  };

  let quotaReleased = false;

  try {
    await runEventsRepo.createRunEvent(db, {
      runId: ctx.runId,
      eventType: "run.progress",
      payload: { stage: "discovering", message: "Pipeline started" },
    });

    const env = getEnv();

    const providerTasks = Promise.allSettled([
      (async () => {
        timings.rdapStarted = Date.now();
        providerResults.rdap = await lookupDomain(ctx.normalizedDomain, { timeoutMs: 5_000 });
      })(),
      (async () => {
        if (!isCrustdataEnabled()) {
          return;
        }
        timings.crustdataCompanyStarted = Date.now();
        providerResults.crustdataCompany = await enrichCompany(ctx.normalizedDomain, {
          timeoutMs: env.CRUSTDATA_TIMEOUT_MS,
        });
      })(),
      (async () => {
        if (!isCrustdataEnabled()) {
          return;
        }
        timings.crustdataPersonSearchStarted = Date.now();
        providerResults.crustdataPersonSearch = await searchPeopleByCompany(ctx.normalizedDomain, {
          timeoutMs: env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
          limit: env.CRUSTDATA_MAX_PEOPLE_PER_RUN,
        });
      })(),
    ]);

    const discoverResult = await discover(ctx);
    if (!discoverResult.success) {
      throw new Error(discoverResult.error ?? "Discovery failed");
    }

    const extractResult = await extract(ctx);
    if (!extractResult.success) {
      throw new Error(extractResult.error ?? "Extraction failed");
    }

    const normalizeResult = await normalize(ctx);
    if (!normalizeResult.success) {
      throw new Error(normalizeResult.error ?? "Normalization failed");
    }

    await providerTasks;
    await persistInitialProviderResults(ctx, providerResults, timings);

    const resolveResult = await resolve(ctx);
    if (!resolveResult.success) {
      throw new Error(resolveResult.error ?? "Resolution failed");
    }

    const scored = await scoreLeadsIncremental(ctx, { scoreVersion: 2, emitEvents: true });

    await enrichPersons(ctx);

    const enrichResult = await enrich(ctx);
    if (!enrichResult.success) {
      console.warn(`[streaming] Enrichment degraded: ${enrichResult.error ?? "unknown"}`);
    }

    await calculateConfidence(ctx);

    const rescored = await scoreLeadsIncremental(ctx, {
      scoreVersion: 2,
      emitEvents: true,
      updateExisting: true,
    });

    await runEventsRepo.createRunEvent(db, {
      runId: ctx.runId,
      eventType: "run.completed",
      payload: {
        leadsCreated: scored.leadsScored,
        leadsUpdated: rescored.leadsScored,
      },
    });

    await runsRepo.completeRun(db, ctx.runId);
    await requestLimitsRepo.decrementActiveRunCount(
      db,
      run.hashedClientIp,
      startOfUtcDay(),
    );
    quotaReleased = true;

    console.log(
      `[streaming] Completed run ${ctx.runId} (${scored.leadsScored} created, ${rescored.leadsScored} updated)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker failure";
    console.error(`[streaming] Failed run ${ctx.runId}:`, message);

    const failed = await runsRepo.failRunIfActive(db, ctx.runId, {
      code: "PIPELINE_FAILED",
      message,
      recoverable: false,
    });

    if (failed) {
      await runEventsRepo.createRunEvent(db, {
        runId: ctx.runId,
        eventType: "run.failed",
        payload: { message },
      });
    }

    if (!quotaReleased) {
      await requestLimitsRepo.decrementActiveRunCount(
        db,
        run.hashedClientIp,
        startOfUtcDay(),
      );
    }

    throw error;
  }
}
