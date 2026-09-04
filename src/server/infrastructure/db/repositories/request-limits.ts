import { and, eq, gte, sql } from "drizzle-orm";

import type { Db } from "../client";
import { requestLimits, type NewRequestLimit, type RequestLimit } from "../schema/request-limits";

function startOfUtcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function getOrCreateRequestLimit(
  db: Db,
  hashedIp: string,
  quotaWindowStart: Date = startOfUtcDay(),
): Promise<RequestLimit> {
  const existing = await db.query.requestLimits.findFirst({
    where: and(
      eq(requestLimits.hashedIp, hashedIp),
      eq(requestLimits.quotaWindowStart, quotaWindowStart),
    ),
  });

  if (existing) {
    return existing;
  }

  const values: NewRequestLimit = {
    hashedIp,
    quotaWindowStart,
    runCount: 0,
    activeRunCount: 0,
  };

  const [created] = await db.insert(requestLimits).values(values).returning();
  if (!created) {
    throw new Error("Failed to create request limit record");
  }
  return created;
}

export async function incrementRunCount(
  db: Db,
  hashedIp: string,
  quotaWindowStart: Date = startOfUtcDay(),
): Promise<RequestLimit> {
  const limit = await getOrCreateRequestLimit(db, hashedIp, quotaWindowStart);

  const [updated] = await db
    .update(requestLimits)
    .set({ runCount: sql`${requestLimits.runCount} + 1` })
    .where(eq(requestLimits.id, limit.id))
    .returning();

  if (!updated) {
    throw new Error("Failed to increment run count");
  }
  return updated;
}

export async function incrementActiveRunCount(
  db: Db,
  hashedIp: string,
  quotaWindowStart: Date = startOfUtcDay(),
): Promise<RequestLimit> {
  const limit = await getOrCreateRequestLimit(db, hashedIp, quotaWindowStart);

  const [updated] = await db
    .update(requestLimits)
    .set({ activeRunCount: sql`${requestLimits.activeRunCount} + 1` })
    .where(eq(requestLimits.id, limit.id))
    .returning();

  if (!updated) {
    throw new Error("Failed to increment active run count");
  }
  return updated;
}

export async function decrementActiveRunCount(
  db: Db,
  hashedIp: string,
  quotaWindowStart: Date = startOfUtcDay(),
): Promise<RequestLimit | undefined> {
  const limit = await getOrCreateRequestLimit(db, hashedIp, quotaWindowStart);

  const [updated] = await db
    .update(requestLimits)
    .set({
      activeRunCount: sql`GREATEST(${requestLimits.activeRunCount} - 1, 0)`,
    })
    .where(eq(requestLimits.id, limit.id))
    .returning();

  return updated;
}

export async function getGlobalRunCountSince(db: Db, since: Date): Promise<number> {
  const rows = await db
    .select({ runCount: requestLimits.runCount })
    .from(requestLimits)
    .where(gte(requestLimits.quotaWindowStart, since));

  return rows.reduce((total, row) => total + row.runCount, 0);
}

export async function getRequestLimitByIp(
  db: Db,
  hashedIp: string,
  quotaWindowStart: Date = startOfUtcDay(),
): Promise<RequestLimit | undefined> {
  return db.query.requestLimits.findFirst({
    where: and(
      eq(requestLimits.hashedIp, hashedIp),
      eq(requestLimits.quotaWindowStart, quotaWindowStart),
    ),
  });
}

export { startOfUtcDay };
