import { and, desc, eq, lt, or, sql } from "drizzle-orm";

import type { Db } from "../client";
import {
  companies,
  leadCandidates,
  people,
  scoreComponents,
  type LeadCandidate,
  type NewLeadCandidate,
  type NewScoreComponentRow,
  type ScoreComponentRow,
} from "../schema/index";

export type LeadWithRelations = LeadCandidate & {
  person: typeof people.$inferSelect;
  company: typeof companies.$inferSelect;
  scoreComponents: ScoreComponentRow[];
};

export type LeadsScope = "matched" | "all";

function hasLinkedinProfileFilter() {
  // Use unqualified inner-table names. Interpolating contactPoints.type inside a
  // leadCandidates relational query makes Drizzle emit leadCandidates.type.
  return or(
    sql`exists (
      select 1 from contact_points
      where contact_points.person_id = ${leadCandidates.personId}
      and contact_points.type = 'linkedin'
    )`,
    sql`exists (
      select 1 from person_external_profiles
      where person_external_profiles.person_id = ${leadCandidates.personId}
      and person_external_profiles.profile_url is not null
    )`,
  );
}

export async function createLeadCandidate(db: Db, input: NewLeadCandidate): Promise<LeadCandidate> {
  const [lead] = await db
    .insert(leadCandidates)
    .values(input)
    .onConflictDoUpdate({
      target: [leadCandidates.runId, leadCandidates.personId, leadCandidates.companyId],
      set: {
        icpFitScore: input.icpFitScore,
        decisionAuthorityScore: input.decisionAuthorityScore,
        businessSignalsScore: input.businessSignalsScore,
        contactabilityScore: input.contactabilityScore,
        evidenceQualityScore: input.evidenceQualityScore,
        finalScore: input.finalScore,
        contactability: input.contactability,
        confidence: input.confidence,
        explanation: input.explanation,
        roleMatch: input.roleMatch,
        roleMatchReasons: input.roleMatchReasons,
        scoreVersion: input.scoreVersion,
        experienceScore: input.experienceScore,
        roleMatchTier: input.roleMatchTier,
        roleSimilarity: input.roleSimilarity,
        roleMatchFinal: input.roleMatchFinal,
        enrichmentStatus: input.enrichmentStatus,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!lead) {
    throw new Error("Failed to create lead candidate");
  }
  return lead;
}

export async function markOtherLeadsStaleForPersonCompany(
  db: Db,
  input: { personId: string; companyId: string; keepLeadId: string },
): Promise<number> {
  const updated = await db
    .update(leadCandidates)
    .set({ isStale: true, updatedAt: new Date() })
    .where(
      and(
        eq(leadCandidates.personId, input.personId),
        eq(leadCandidates.companyId, input.companyId),
        eq(leadCandidates.isStale, false),
        sql`${leadCandidates.id} <> ${input.keepLeadId}`,
      ),
    )
    .returning({ id: leadCandidates.id });
  return updated.length;
}

export async function createScoreComponents(
  db: Db,
  inputs: NewScoreComponentRow[],
): Promise<ScoreComponentRow[]> {
  if (inputs.length === 0) {
    return [];
  }

  return db.insert(scoreComponents).values(inputs).returning();
}

export async function updateLeadCandidate(
  db: Db,
  leadId: string,
  input: Partial<NewLeadCandidate>,
): Promise<LeadCandidate | undefined> {
  const [lead] = await db
    .update(leadCandidates)
    .set(input)
    .where(eq(leadCandidates.id, leadId))
    .returning();
  return lead;
}

export async function getLeadById(db: Db, leadId: string): Promise<LeadWithRelations | undefined> {
  return db.query.leadCandidates.findFirst({
    where: eq(leadCandidates.id, leadId),
    with: {
      person: true,
      company: true,
      scoreComponents: true,
    },
  });
}

export type LeadsPage = {
  leads: LeadWithRelations[];
  nextCursor: string | null;
};

export async function getLeadsByRunId(
  db: Db,
  runId: string,
  options: { limit?: number; cursor?: string; scope?: LeadsScope } = {},
): Promise<LeadsPage> {
  const limit = options.limit ?? 20;
  const cursor = options.cursor;
  const scope = options.scope ?? "matched";

  const conditions = [eq(leadCandidates.runId, runId), hasLinkedinProfileFilter()!];

  if (scope === "matched") {
    conditions.push(eq(leadCandidates.roleMatch, true));
  }

  if (cursor) {
    const cursorLead = await db.query.leadCandidates.findFirst({
      where: eq(leadCandidates.id, cursor),
      columns: {
        finalScore: true,
        id: true,
        roleMatch: true,
      },
    });

    if (cursorLead) {
      if (scope === "all") {
        conditions.push(lt(leadCandidates.finalScore, cursorLead.finalScore));
      } else {
        conditions.push(lt(leadCandidates.finalScore, cursorLead.finalScore));
      }
    }
  }

  const orderBy =
    scope === "all"
      ? [desc(leadCandidates.roleMatch), desc(leadCandidates.finalScore), desc(leadCandidates.id)]
      : [desc(leadCandidates.finalScore), desc(leadCandidates.id)];

  const leads = await db.query.leadCandidates.findMany({
    where: and(...conditions),
    orderBy,
    limit: limit + 1,
    with: {
      person: true,
      company: true,
      scoreComponents: true,
    },
  });

  const hasMore = leads.length > limit;
  const page = hasMore ? leads.slice(0, limit) : leads;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  return { leads: page, nextCursor };
}

export async function deleteScoreComponentsByLeadId(
  db: Db,
  leadCandidateId: string,
): Promise<void> {
  await db.delete(scoreComponents).where(eq(scoreComponents.leadCandidateId, leadCandidateId));
}

export async function countLeadsByRunId(
  db: Db,
  runId: string,
  options: { scope?: LeadsScope } = {},
): Promise<number> {
  const scope = options.scope ?? "matched";
  const conditions = [eq(leadCandidates.runId, runId), hasLinkedinProfileFilter()!];

  if (scope === "matched") {
    conditions.push(eq(leadCandidates.roleMatch, true));
  }

  const rows = await db
    .select({ id: leadCandidates.id })
    .from(leadCandidates)
    .where(and(...conditions));

  return rows.length;
}
