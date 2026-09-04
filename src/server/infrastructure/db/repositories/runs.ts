import type { IcpFilter, RunProgress, RunStatus } from "@/shared/contracts";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import type { Db } from "../client";
import { isUniqueViolation } from "../errors";
import {
  searchRuns,
  type NewSearchRun,
  type RoleCriteria,
  type SearchRun,
} from "../schema/search-runs";

export type CreateRunInput = {
  inputDomain: string;
  normalizedDomain: string;
  icp?: IcpFilter;
  targetRoles?: string[];
  roleCriteria?: RoleCriteria;
  refreshOfRunId?: string;
  idempotencyKey: string;
  hashedClientIp: string;
};

const ACTIVE_STATUSES: RunStatus[] = [
  "queued",
  "discovering",
  "extracting",
  "resolving",
  "enriching",
  "scoring",
];

function resolveRoleCriteria(input: CreateRunInput): RoleCriteria | null {
  if (input.roleCriteria) {
    return input.roleCriteria;
  }

  if (input.targetRoles && input.targetRoles.length > 0) {
    return {
      seniorities: [],
      functions: [],
      customTitles: input.targetRoles,
    };
  }

  return null;
}

export async function createRun(db: Db, input: CreateRunInput): Promise<SearchRun> {
  const values: NewSearchRun = {
    inputDomain: input.inputDomain,
    normalizedDomain: input.normalizedDomain,
    icp: input.icp ?? null,
    targetRoles: input.targetRoles ?? null,
    roleCriteria: resolveRoleCriteria(input),
    refreshOfRunId: input.refreshOfRunId ?? null,
    idempotencyKey: input.idempotencyKey,
    hashedClientIp: input.hashedClientIp,
    status: "queued",
  };

  try {
    const [run] = await db.insert(searchRuns).values(values).returning();
    if (!run) {
      throw new Error("Failed to create search run");
    }
    return run;
  } catch (error) {
    if (!isUniqueViolation(error, "search_runs_idempotency_key_idx")) {
      throw error;
    }
    const existing = await getRunByIdempotencyKey(db, input.idempotencyKey);
    if (existing) {
      return existing;
    }
    throw error;
  }
}

export async function getRunById(db: Db, runId: string): Promise<SearchRun | undefined> {
  return db.query.searchRuns.findFirst({
    where: eq(searchRuns.id, runId),
  });
}

export async function getRunByIdempotencyKey(
  db: Db,
  idempotencyKey: string,
): Promise<SearchRun | undefined> {
  return db.query.searchRuns.findFirst({
    where: eq(searchRuns.idempotencyKey, idempotencyKey),
  });
}

export async function getActiveRunByDomainAndIp(
  db: Db,
  normalizedDomain: string,
  hashedClientIp: string,
): Promise<SearchRun | undefined> {
  return db.query.searchRuns.findFirst({
    where: and(
      eq(searchRuns.normalizedDomain, normalizedDomain),
      eq(searchRuns.hashedClientIp, hashedClientIp),
      inArray(searchRuns.status, ACTIVE_STATUSES),
    ),
    orderBy: [desc(searchRuns.createdAt)],
  });
}

export async function getActiveRunByDomain(
  db: Db,
  normalizedDomain: string,
): Promise<SearchRun | undefined> {
  return db.query.searchRuns.findFirst({
    where: and(
      eq(searchRuns.normalizedDomain, normalizedDomain),
      inArray(searchRuns.status, ACTIVE_STATUSES),
    ),
    orderBy: [desc(searchRuns.createdAt)],
  });
}

export async function getLatestCompletedRunByDomain(
  db: Db,
  normalizedDomain: string,
): Promise<SearchRun | undefined> {
  return db.query.searchRuns.findFirst({
    where: and(
      eq(searchRuns.normalizedDomain, normalizedDomain),
      eq(searchRuns.status, "completed"),
    ),
    orderBy: [desc(searchRuns.completedAt), desc(searchRuns.createdAt)],
  });
}

export async function listRecentRuns(db: Db, limit = 20): Promise<SearchRun[]> {
  return db.query.searchRuns.findMany({
    orderBy: [desc(searchRuns.createdAt)],
    limit,
  });
}

export async function countActiveRunsByIp(db: Db, hashedClientIp: string): Promise<number> {
  const rows = await db
    .select({ id: searchRuns.id })
    .from(searchRuns)
    .where(
      and(
        eq(searchRuns.hashedClientIp, hashedClientIp),
        inArray(searchRuns.status, ACTIVE_STATUSES),
      ),
    );

  return rows.length;
}

export async function updateRunStatus(
  db: Db,
  runId: string,
  status: RunStatus,
): Promise<SearchRun | undefined> {
  const [run] = await db
    .update(searchRuns)
    .set({ status })
    .where(eq(searchRuns.id, runId))
    .returning();
  return run;
}

export async function updateRunProgress(
  db: Db,
  runId: string,
  progress: RunProgress,
): Promise<SearchRun | undefined> {
  const [run] = await db
    .update(searchRuns)
    .set({ progress, status: progress.stage })
    .where(eq(searchRuns.id, runId))
    .returning();
  return run;
}

export async function claimRunForProcessing(
  db: Db,
  runId: string,
): Promise<SearchRun | undefined> {
  const [run] = await db
    .update(searchRuns)
    .set({
      status: "discovering",
      errorCode: null,
      errorMessage: null,
      errorRecoverable: null,
      completedAt: null,
    })
    .where(and(eq(searchRuns.id, runId), eq(searchRuns.status, "queued")))
    .returning();
  return run;
}

export async function completeRun(db: Db, runId: string): Promise<SearchRun | undefined> {
  const [run] = await db
    .update(searchRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      errorRecoverable: null,
      progress: {
        stage: "completed",
      },
    })
    .where(
      and(eq(searchRuns.id, runId), inArray(searchRuns.status, ACTIVE_STATUSES)),
    )
    .returning();
  return run;
}

export async function failRunIfActive(
  db: Db,
  runId: string,
  error: { code: string; message: string; recoverable: boolean },
): Promise<SearchRun | undefined> {
  const [run] = await db
    .update(searchRuns)
    .set({
      status: "failed",
      errorCode: error.code,
      errorMessage: error.message,
      errorRecoverable: error.recoverable,
      completedAt: new Date(),
    })
    .where(and(eq(searchRuns.id, runId), inArray(searchRuns.status, ACTIVE_STATUSES)))
    .returning();
  return run;
}

export async function cancelRunIfActive(
  db: Db,
  runId: string,
): Promise<SearchRun | undefined> {
  const [run] = await db
    .update(searchRuns)
    .set({
      status: "canceled",
      completedAt: new Date(),
      errorCode: "RUN_CANCELED",
      errorMessage: "Run canceled by user",
      errorRecoverable: false,
      progress: {
        stage: "canceled",
      },
    })
    .where(and(eq(searchRuns.id, runId), inArray(searchRuns.status, ACTIVE_STATUSES)))
    .returning();
  return run;
}

export async function isRunCanceled(db: Db, runId: string): Promise<boolean> {
  const run = await getRunById(db, runId);
  return run?.status === "canceled";
}

export async function failRun(
  db: Db,
  runId: string,
  error: { code: string; message: string; recoverable: boolean },
): Promise<SearchRun | undefined> {
  const [run] = await db
    .update(searchRuns)
    .set({
      status: "failed",
      errorCode: error.code,
      errorMessage: error.message,
      errorRecoverable: error.recoverable,
      completedAt: new Date(),
    })
    .where(eq(searchRuns.id, runId))
    .returning();
  return run;
}

export async function countRunsCreatedSince(db: Db, since: Date): Promise<number> {
  const rows = await db
    .select({ id: searchRuns.id })
    .from(searchRuns)
    .where(gte(searchRuns.createdAt, since));

  return rows.length;
}
