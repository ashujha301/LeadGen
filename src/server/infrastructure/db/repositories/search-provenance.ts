import { and, desc, eq } from "drizzle-orm";

import type { Db } from "../client";
import { employments } from "../schema/employments";
import { searchRuns } from "../schema/search-runs";
import {
  employmentRunProvenance,
  personEnrichmentRuns,
  type NewPersonEnrichmentRun,
} from "../schema/search-provenance";

export async function upsertEmploymentRunProvenance(
  db: Db,
  input: {
    employmentId: string;
    runId: string;
    sourceDocumentId?: string | null;
    observedAt?: Date;
  },
): Promise<void> {
  const observedAt = input.observedAt ?? new Date();
  await db
    .insert(employmentRunProvenance)
    .values({
      employmentId: input.employmentId,
      runId: input.runId,
      sourceDocumentId: input.sourceDocumentId ?? null,
      firstObservedAt: observedAt,
      lastObservedAt: observedAt,
    })
    .onConflictDoUpdate({
      target: [employmentRunProvenance.employmentId, employmentRunProvenance.runId],
      set: {
        lastObservedAt: observedAt,
        ...(input.sourceDocumentId ? { sourceDocumentId: input.sourceDocumentId } : {}),
        updatedAt: new Date(),
      },
    });
}

export async function upsertPersonEnrichmentRun(
  db: Db,
  input: NewPersonEnrichmentRun,
): Promise<void> {
  await db
    .insert(personEnrichmentRuns)
    .values(input)
    .onConflictDoUpdate({
      target: [personEnrichmentRuns.personId, personEnrichmentRuns.runId],
      set: {
        enrichmentStatus: input.enrichmentStatus,
        providerExperienceYears: input.providerExperienceYears,
        sourceDocumentId: input.sourceDocumentId,
        fetchedAt: input.fetchedAt ?? new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function listProvenanceEmploymentsForUser(
  db: Db,
  input: { personId: string; userId: string; runId?: string },
) {
  const conditions = [
    eq(employments.personId, input.personId),
    eq(searchRuns.userId, input.userId),
  ];
  if (input.runId) {
    conditions.push(eq(employmentRunProvenance.runId, input.runId));
  }

  return db
    .select({
      id: employments.id,
      companyId: employments.companyId,
      employerName: employments.employerName,
      employerDomain: employments.employerDomain,
      rawTitle: employments.rawTitle,
      startDate: employments.startDate,
      endDate: employments.endDate,
      isCurrent: employments.isCurrent,
      seniority: employments.seniority,
    })
    .from(employments)
    .innerJoin(employmentRunProvenance, eq(employmentRunProvenance.employmentId, employments.id))
    .innerJoin(searchRuns, eq(searchRuns.id, employmentRunProvenance.runId))
    .where(and(...conditions));
}

export async function getLatestOwnedPersonEnrichmentRun(
  db: Db,
  input: { personId: string; userId: string; runId?: string },
) {
  const conditions = [
    eq(personEnrichmentRuns.personId, input.personId),
    eq(searchRuns.userId, input.userId),
  ];
  if (input.runId) {
    conditions.push(eq(personEnrichmentRuns.runId, input.runId));
  }

  const [row] = await db
    .select({
      enrichmentStatus: personEnrichmentRuns.enrichmentStatus,
      providerExperienceYears: personEnrichmentRuns.providerExperienceYears,
      fetchedAt: personEnrichmentRuns.fetchedAt,
    })
    .from(personEnrichmentRuns)
    .innerJoin(searchRuns, eq(searchRuns.id, personEnrichmentRuns.runId))
    .where(and(...conditions))
    .orderBy(desc(personEnrichmentRuns.fetchedAt))
    .limit(1);

  return row;
}
