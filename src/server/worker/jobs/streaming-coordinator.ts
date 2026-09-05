import { getEnv } from "@/shared/config/server";
import {
  enrichCompany,
  isCrustdataEnabled,
  lookupDomain,
  searchPeopleByCompany,
  buildTitleConditions,
} from "@/server/infrastructure/connectors";
import { roleCriteriaToTitleSearchTerms } from "@/server/domain/roles/title-search-terms";
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
import { resolveMissingLinkedInProfiles } from "../stages/resolve-missing-linkedin";
import { enrich } from "../stages/enrich";
import { enrichPersons } from "../stages/enrich-persons";
import { persistInitialProviderResults } from "../stages/persist-initial-providers";
import { calculateConfidence } from "../stages/calculate-confidence";
import { scoreLeadsIncremental } from "../stages/score-leads-incremental";
import {
  assertRunNotCanceled,
  clearRunAbort,
  getRunAbortSignal,
  registerRunAbort,
  RunCanceledError,
} from "../run-abort";

import type { ProcessRunPayload, StageContext } from "./process-run";

type ProviderResults = {
  rdap: Awaited<ReturnType<typeof lookupDomain>> | null;
  crustdataCompany: Awaited<ReturnType<typeof enrichCompany>> | null;
  crustdataPersonSearch: Awaited<ReturnType<typeof searchPeopleByCompany>> | null;
};

async function runStage<T>(ctx: StageContext, fn: () => Promise<T>): Promise<T> {
  await assertRunNotCanceled(ctx.runId);
  return fn();
}

export async function runStreamingPipeline(payload: ProcessRunPayload): Promise<void> {
  const db = getDb();
  const run = await runsRepo.getRunById(db, payload.runId);

  if (!run) {
    throw new Error(`Run ${payload.runId} not found`);
  }

  if (run.status === "completed" || run.status === "failed" || run.status === "canceled") {
    console.log(`[streaming] Skipping terminal run ${payload.runId} (${run.status})`);
    return;
  }

  const claimed = await runsRepo.claimRunForProcessing(db, payload.runId);
  if (!claimed) {
    const latest = await runsRepo.getRunById(db, payload.runId);
    if (latest?.status === "canceled") {
      console.log(`[streaming] Skipping canceled run ${payload.runId}`);
    } else {
      console.log(`[streaming] Run ${payload.runId} is not claimable`);
    }
    return;
  }

  registerRunAbort(payload.runId);

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
    await assertRunNotCanceled(ctx.runId);

    await runEventsRepo.createRunEvent(db, {
      runId: ctx.runId,
      eventType: "run.progress",
      payload: { stage: "discovering", message: "Pipeline started" },
    });

    const env = getEnv();
    const abortSignal = getRunAbortSignal(ctx.runId);

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
          signal: abortSignal,
        });
      })(),
      (async () => {
        if (!isCrustdataEnabled()) {
          return;
        }
        timings.crustdataPersonSearchStarted = Date.now();
        const titleTerms = roleCriteriaToTitleSearchTerms(run.roleCriteria);
        const titleConditions = titleTerms.length ? buildTitleConditions(titleTerms) : undefined;
        providerResults.crustdataPersonSearch = await searchPeopleByCompany(ctx.normalizedDomain, {
          timeoutMs: env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
          limit: env.CRUSTDATA_MAX_PEOPLE_PER_RUN,
          titleConditions,
          signal: abortSignal,
        });
      })(),
    ]);

    const discoverResult = await runStage(ctx, () => discover(ctx));
    if (!discoverResult.success) {
      throw new Error(discoverResult.error ?? "Discovery failed");
    }

    const extractResult = await runStage(ctx, () => extract(ctx));
    if (!extractResult.success) {
      throw new Error(extractResult.error ?? "Extraction failed");
    }

    const normalizeResult = await runStage(ctx, () => normalize(ctx));
    if (!normalizeResult.success) {
      throw new Error(normalizeResult.error ?? "Normalization failed");
    }

    await providerTasks;
    await runStage(ctx, () => persistInitialProviderResults(ctx, providerResults, timings));

    const resolveResult = await runStage(ctx, () => resolve(ctx));
    if (!resolveResult.success) {
      throw new Error(resolveResult.error ?? "Resolution failed");
    }

    await runStage(ctx, () => resolveMissingLinkedInProfiles(ctx));

    const scored = await runStage(ctx, () =>
      scoreLeadsIncremental(ctx, { scoreVersion: 2, emitEvents: true }),
    );

    await runStage(ctx, () => enrichPersons(ctx));

    const enrichResult = await runStage(ctx, () => enrich(ctx));
    if (!enrichResult.success) {
      console.warn(`[streaming] Enrichment degraded: ${enrichResult.error ?? "unknown"}`);
    }

    await runStage(ctx, () => calculateConfidence(ctx));

    const rescored = await runStage(ctx, () =>
      scoreLeadsIncremental(ctx, {
        scoreVersion: 2,
        emitEvents: true,
        updateExisting: true,
        personIds: ctx.enrichedPersonIds,
      }),
    );

    await runEventsRepo.createRunEvent(db, {
      runId: ctx.runId,
      eventType: "run.completed",
      payload: {
        leadsCreated: scored.leadsScored,
        leadsUpdated: rescored.leadsScored,
      },
    });

    await runsRepo.completeRun(db, ctx.runId);
    await requestLimitsRepo.decrementActiveRunCount(db, run.hashedClientIp, startOfUtcDay());
    quotaReleased = true;

    console.log(
      `[streaming] Completed run ${ctx.runId} (${scored.leadsScored} created, ${rescored.leadsScored} updated)`,
    );
  } catch (error) {
    if (error instanceof RunCanceledError) {
      console.log(`[streaming] Run ${ctx.runId} canceled`);
      const current = await runsRepo.getRunById(db, ctx.runId);
      // Only release active quota when this worker transitions the run to
      // canceled. The cancel API releases quota when it wins the race.
      if (current?.status !== "canceled") {
        const canceled = await runsRepo.cancelRunIfActive(db, ctx.runId);
        if (canceled && !quotaReleased) {
          await requestLimitsRepo.decrementActiveRunCount(db, run.hashedClientIp, startOfUtcDay());
          quotaReleased = true;
        }
      }
      await runEventsRepo.createRunEvent(db, {
        runId: ctx.runId,
        eventType: "run.canceled",
        payload: { message: "Run canceled" },
      });
      return;
    }

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
      await requestLimitsRepo.decrementActiveRunCount(db, run.hashedClientIp, startOfUtcDay());
    }

    throw error;
  } finally {
    clearRunAbort(ctx.runId);
  }
}
