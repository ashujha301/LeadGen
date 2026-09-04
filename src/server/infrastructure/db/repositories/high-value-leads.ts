import { and, desc, eq, lt, or, sql } from "drizzle-orm";

import { HIGH_VALUE_LEAD_THRESHOLDS } from "@/shared/config";

import type { Db } from "../client";
import {
  companies,
  contactPoints,
  leadCandidates,
  people,
  personExternalProfiles,
  searchRuns,
  type Company,
  type LeadCandidate,
} from "../schema/index";

export type HighValueCompanySummary = Company & {
  qualifyingLeadCount: number;
  topScore: number | null;
  hasActiveRun: boolean;
  lastEnrichmentAt: Date | null;
};

export type HighValueLeadRow = LeadCandidate & {
  person: typeof people.$inferSelect;
  company: typeof companies.$inferSelect;
};

const hasLinkedinProfileFilter = or(
  sql`exists (
    select 1 from ${contactPoints}
    where ${contactPoints.personId} = ${leadCandidates.personId}
    and ${contactPoints.type} = 'linkedin'
  )`,
  sql`exists (
    select 1 from ${personExternalProfiles}
    where ${personExternalProfiles.personId} = ${leadCandidates.personId}
    and ${personExternalProfiles.profileUrl} is not null
  )`,
);

const qualificationFilter = and(
  eq(leadCandidates.scoreVersion, HIGH_VALUE_LEAD_THRESHOLDS.scoreVersion),
  eq(leadCandidates.roleMatchFinal, true),
  eq(leadCandidates.roleMatch, true),
  sql`${leadCandidates.finalScore} >= ${HIGH_VALUE_LEAD_THRESHOLDS.minScore}`,
  sql`${leadCandidates.confidence} >= ${HIGH_VALUE_LEAD_THRESHOLDS.minConfidence}`,
  eq(leadCandidates.isStale, false),
  hasLinkedinProfileFilter,
);

export async function listHighValueCompanies(db: Db): Promise<HighValueCompanySummary[]> {
  const allCompanies = await db.select().from(companies).orderBy(companies.name);

  const qualifyingCounts = await db
    .select({
      companyId: leadCandidates.companyId,
      count: sql<number>`count(*)::int`,
      topScore: sql<number>`max(${leadCandidates.finalScore})`,
    })
    .from(leadCandidates)
    .where(qualificationFilter)
    .groupBy(leadCandidates.companyId);

  const countByCompany = new Map(
    qualifyingCounts.map((row) => [
      row.companyId,
      { count: row.count, topScore: row.topScore ?? null },
    ]),
  );

  const activeRuns = await db
    .select({ normalizedDomain: searchRuns.normalizedDomain })
    .from(searchRuns)
    .where(
      sql`${searchRuns.status} NOT IN ('completed', 'failed', 'canceled')`,
    );

  const activeDomains = new Set(activeRuns.map((row) => row.normalizedDomain));

  return allCompanies.map((company) => {
    const stats = countByCompany.get(company.id);
    return {
      ...company,
      qualifyingLeadCount: stats?.count ?? 0,
      topScore: stats?.topScore ?? null,
      hasActiveRun: activeDomains.has(company.normalizedDomain),
      lastEnrichmentAt: company.providerUpdatedAt ?? company.lastObservedAt ?? null,
    };
  });
}

export type HighValueLeadsPage = {
  leads: HighValueLeadRow[];
  nextCursor: string | null;
};

export async function getHighValueLeadsByCompanyId(
  db: Db,
  companyId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<HighValueLeadsPage> {
  const limit = options.limit ?? 20;
  const conditions = [eq(leadCandidates.companyId, companyId), qualificationFilter];

  if (options.cursor) {
    const cursorLead = await db.query.leadCandidates.findFirst({
      where: eq(leadCandidates.id, options.cursor),
      columns: { finalScore: true, id: true },
    });
    if (cursorLead) {
      conditions.push(lt(leadCandidates.finalScore, cursorLead.finalScore));
    }
  }

  const leads = await db.query.leadCandidates.findMany({
    where: and(...conditions),
    orderBy: [desc(leadCandidates.finalScore), desc(leadCandidates.id)],
    limit: limit + 1,
    with: {
      person: true,
      company: true,
    },
  });

  const hasMore = leads.length > limit;
  const page = hasMore ? leads.slice(0, limit) : leads;
  return {
    leads: page as HighValueLeadRow[],
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function getHighValueCompanyById(
  db: Db,
  companyId: string,
): Promise<HighValueCompanySummary | undefined> {
  const companiesList = await listHighValueCompanies(db);
  return companiesList.find((company) => company.id === companyId);
}
