import { and, eq } from "drizzle-orm";

import type { Db } from "../client";
import { leadCandidates, searchRuns } from "../schema/index";

/** True if the user has at least one lead_candidate for this person on their runs. */
export async function userOwnsPerson(
  db: Db,
  personId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: leadCandidates.id })
    .from(leadCandidates)
    .innerJoin(searchRuns, eq(leadCandidates.runId, searchRuns.id))
    .where(and(eq(leadCandidates.personId, personId), eq(searchRuns.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** True if the user has at least one lead_candidate for this company on their runs. */
export async function userOwnsCompany(
  db: Db,
  companyId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: leadCandidates.id })
    .from(leadCandidates)
    .innerJoin(searchRuns, eq(leadCandidates.runId, searchRuns.id))
    .where(and(eq(leadCandidates.companyId, companyId), eq(searchRuns.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** Person IDs the user has as lead candidates at this company. */
export async function listOwnedPersonIdsForCompany(
  db: Db,
  companyId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ personId: leadCandidates.personId })
    .from(leadCandidates)
    .innerJoin(searchRuns, eq(leadCandidates.runId, searchRuns.id))
    .where(and(eq(leadCandidates.companyId, companyId), eq(searchRuns.userId, userId)));
  return rows.map((row) => row.personId);
}

/** Company IDs the user has as lead candidates for this person. */
export async function listOwnedCompanyIdsForPerson(
  db: Db,
  personId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ companyId: leadCandidates.companyId })
    .from(leadCandidates)
    .innerJoin(searchRuns, eq(leadCandidates.runId, searchRuns.id))
    .where(and(eq(leadCandidates.personId, personId), eq(searchRuns.userId, userId)));
  return rows.map((row) => row.companyId);
}
