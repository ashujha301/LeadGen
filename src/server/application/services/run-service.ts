import { randomUUID } from "node:crypto";

import type {
  CreateRunRequest,
  RunProgress,
  RunResponse,
  RunRefreshMetadata,
  RunStatus,
} from "@/shared/contracts";
import { getEnv } from "@/shared/config/server";
import {
  getDb,
  requestLimitsRepo,
  runsRepo,
  startOfUtcDay,
  type SearchRun,
} from "@/server/infrastructure/db";

import { enqueueRun, cancelQueuedRun } from "@/server/infrastructure/queue/web-queue";
import { abortRunProcessing } from "@/server/infrastructure/run-abort";

export class RunQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunQuotaError";
  }
}

export type RunCreationPlan =
  | { kind: "return_existing_idempotency"; reusedActiveRun: false }
  | { kind: "return_active_run"; reusedActiveRun: true }
  | { kind: "create_new" };

export function planRunCreation(input: {
  clientIdempotencyKey?: string;
  existingByIdempotencyKey: boolean;
  activeRunForDomainAndIp: boolean;
}): RunCreationPlan {
  if (input.clientIdempotencyKey && input.existingByIdempotencyKey) {
    return { kind: "return_existing_idempotency", reusedActiveRun: false };
  }

  if (input.activeRunForDomainAndIp) {
    return { kind: "return_active_run", reusedActiveRun: true };
  }

  return { kind: "create_new" };
}

export function buildRefreshMetadata(run: SearchRun, reusedActiveRun: boolean): RunRefreshMetadata {
  return {
    reusedActiveRun,
    refreshOfRunId: run.refreshOfRunId ?? null,
  };
}

function toIso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function toRunResponse(run: SearchRun, refresh?: RunRefreshMetadata): RunResponse {
  const progress = run.progress as RunProgress | null | undefined;

  return {
    id: run.id,
    domain: run.inputDomain,
    normalizedDomain: run.normalizedDomain,
    status: run.status as RunStatus,
    progress: progress ?? { stage: run.status as RunStatus },
    refresh,
    error:
      run.errorCode && run.errorMessage
        ? {
            code: run.errorCode,
            message: run.errorMessage,
            recoverable: run.errorRecoverable ?? false,
          }
        : undefined,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    completedAt: toIso(run.completedAt),
  };
}

export const runService = {
  async createRun(
    input: CreateRunRequest,
    hashedClientIp: string,
    clientIdempotencyKey?: string,
  ): Promise<RunResponse> {
    const db = getDb();
    const env = getEnv();
    const { input: inputDomain, normalizedDomain } = input.domain;

    const idempotencyKey = clientIdempotencyKey?.trim() || randomUUID();

    const existingByKey = await runsRepo.getRunByIdempotencyKey(db, idempotencyKey);
    const activeRun = await runsRepo.getActiveRunByDomainAndIp(
      db,
      normalizedDomain,
      hashedClientIp,
    );

    const plan = planRunCreation({
      clientIdempotencyKey,
      existingByIdempotencyKey: Boolean(existingByKey),
      activeRunForDomainAndIp: Boolean(activeRun),
    });

    if (plan.kind === "return_existing_idempotency" && existingByKey) {
      return toRunResponse(existingByKey, buildRefreshMetadata(existingByKey, false));
    }

    if (plan.kind === "return_active_run" && activeRun) {
      return toRunResponse(activeRun, buildRefreshMetadata(activeRun, true));
    }

    const activeCount = await runsRepo.countActiveRunsByIp(db, hashedClientIp);
    if (activeCount >= env.PUBLIC_ACTIVE_RUNS_PER_IP) {
      throw new RunQuotaError("Only one active run is allowed per client at a time.");
    }

    const quota = await requestLimitsRepo.getOrCreateRequestLimit(db, hashedClientIp);
    if (quota.runCount >= env.PUBLIC_RUN_LIMIT_PER_IP_DAY) {
      throw new RunQuotaError("Daily run limit reached for this client.");
    }

    const globalRuns = await runsRepo.countRunsCreatedSince(db, startOfUtcDay());
    if (globalRuns >= env.PUBLIC_GLOBAL_RUN_LIMIT_DAY) {
      throw new RunQuotaError("Global daily run limit reached.");
    }

    const latestCompleted = await runsRepo.getLatestCompletedRunByDomain(db, normalizedDomain);

    const run = await runsRepo.createRun(db, {
      inputDomain,
      normalizedDomain,
      icp: input.icp,
      targetRoles: input.targetRoles,
      roleCriteria: input.roleCriteria,
      refreshOfRunId: latestCompleted?.id,
      idempotencyKey,
      hashedClientIp,
    });

    await requestLimitsRepo.incrementRunCount(db, hashedClientIp);
    await requestLimitsRepo.incrementActiveRunCount(db, hashedClientIp);
    await enqueueRun(run.id);

    return toRunResponse(run, buildRefreshMetadata(run, false));
  },

  async getRun(runId: string): Promise<RunResponse | null> {
    const db = getDb();
    const run = await runsRepo.getRunById(db, runId);
    return run ? toRunResponse(run) : null;
  },

  async listRecent(limit = 10): Promise<RunResponse[]> {
    const db = getDb();
    const runs = await runsRepo.listRecentRuns(db, limit);
    return runs.map((run) => toRunResponse(run));
  },

  async cancelRun(runId: string): Promise<RunResponse | null> {
    const db = getDb();
    const existing = await runsRepo.getRunById(db, runId);
    if (!existing) {
      return null;
    }

    if (existing.status === "canceled") {
      return toRunResponse(existing);
    }

    if (existing.status === "completed" || existing.status === "failed") {
      throw new Error("Run is already terminal");
    }

    if (existing.status === "queued") {
      await cancelQueuedRun(runId);
    }

    abortRunProcessing(runId);

    const canceled = await runsRepo.cancelRunIfActive(db, runId);
    if (!canceled) {
      const latest = await runsRepo.getRunById(db, runId);
      if (latest?.status === "canceled") {
        return toRunResponse(latest);
      }
      throw new Error("Run is already terminal");
    }

    await requestLimitsRepo.decrementActiveRunCount(db, existing.hashedClientIp, startOfUtcDay());

    return toRunResponse(canceled);
  },
};
