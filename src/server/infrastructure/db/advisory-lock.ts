import { sql } from "drizzle-orm";

import type { Db } from "./client";

export function hashLockKey(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export async function withAdvisoryLock<T>(
  db: Db,
  lockKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockId = hashLockKey(lockKey);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockId})`);
    return fn();
  });
}

export function buildPersonLockKey(input: {
  providerPersonId?: string | null;
  normalizedProfileUrl?: string | null;
  verifiedEmail?: string | null;
  companyId?: string;
  normalizedName?: string;
}): string {
  if (input.providerPersonId) {
    return `provider:crustdata:${input.providerPersonId}`;
  }
  if (input.normalizedProfileUrl) {
    return `profile:${input.normalizedProfileUrl}`;
  }
  if (input.verifiedEmail) {
    return `email:${input.verifiedEmail}`;
  }
  return `name:${input.companyId ?? "unknown"}:${input.normalizedName ?? "unknown"}`;
}
