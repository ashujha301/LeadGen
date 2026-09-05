import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { pickCanonicalLeadPerPerson } from "@/server/domain/leads/hvl-person-dedupe";
import {
  computeLeadNeighbors,
  sortHighValueLeadsByScoreThenId,
  type HighValueLeadNavigation,
} from "@/server/domain/leads/hvl-navigation";
import { HIGH_VALUE_LEAD_THRESHOLDS } from "@/shared/config";

import type { Db } from "../client";
import {
  companies,
  leadCandidates,
  people,
  searchRuns,
  type Company,
  type LeadCandidate,
} from "../schema/index";

export type { HighValueLeadNavigation };

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
  // Use unqualified inner-table names. Interpolating contactPoints.type inside a
  // leadCandidates relational query makes Drizzle emit leadCandidates.type.
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

const qualificationFilter = and(
  eq(leadCandidates.scoreVersion, HIGH_VALUE_LEAD_THRESHOLDS.scoreVersion),
  sql`${leadCandidates.finalScore} >= ${HIGH_VALUE_LEAD_THRESHOLDS.minScore}`,
  sql`${leadCandidates.confidence} >= ${HIGH_VALUE_LEAD_THRESHOLDS.minConfidence}`,
  eq(leadCandidates.isStale, false),
  hasLinkedinProfileFilter,
);

function userScopedLeadFilter(userId: string) {
  return and(
    qualificationFilter,
    sql`exists (
      select 1 from search_runs
      where search_runs.id = ${leadCandidates.runId}
      and search_runs.user_id = ${userId}
    )`,
  );
}

export async function listHighValueCompanies(
  db: Db,
  userId: string,
): Promise<HighValueCompanySummary[]> {
  const qualifyingCounts = await db
    .select({
      companyId: leadCandidates.companyId,
      count: sql<number>`count(distinct ${leadCandidates.personId})::int`,
      topScore: sql<number>`max(${leadCandidates.finalScore})`,
    })
    .from(leadCandidates)
    .innerJoin(searchRuns, eq(leadCandidates.runId, searchRuns.id))
    .where(and(qualificationFilter, eq(searchRuns.userId, userId)))
    .groupBy(leadCandidates.companyId);

  if (qualifyingCounts.length === 0) {
    return [];
  }

  const companyIds = qualifyingCounts.map((row) => row.companyId);
  const countByCompany = new Map(
    qualifyingCounts.map((row) => [
      row.companyId,
      { count: row.count, topScore: row.topScore ?? null },
    ]),
  );

  const [ownedCompanies, activeRuns] = await Promise.all([
    db.select().from(companies).where(inArray(companies.id, companyIds)).orderBy(companies.name),
    db
      .select({ normalizedDomain: searchRuns.normalizedDomain })
      .from(searchRuns)
      .where(
        and(
          eq(searchRuns.userId, userId),
          sql`${searchRuns.status} NOT IN ('completed', 'failed', 'canceled')`,
        ),
      ),
  ]);

  const activeDomains = new Set(activeRuns.map((row) => row.normalizedDomain));

  return ownedCompanies.map((company) => {
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
  options: { limit?: number; cursor?: string; userId: string },
): Promise<HighValueLeadsPage> {
  const limit = options.limit ?? 20;

  const leads = await db.query.leadCandidates.findMany({
    where: and(eq(leadCandidates.companyId, companyId), userScopedLeadFilter(options.userId)),
    orderBy: [desc(leadCandidates.finalScore), desc(leadCandidates.id)],
    with: {
      person: true,
      company: true,
    },
  });

  let deduped = sortHighValueLeadsByScoreThenId(
    pickCanonicalLeadPerPerson(leads as HighValueLeadRow[]),
  );

  if (options.cursor) {
    const cursorIndex = deduped.findIndex((lead) => lead.id === options.cursor);
    if (cursorIndex >= 0) {
      deduped = deduped.slice(cursorIndex + 1);
    } else {
      const cursorLead = leads.find((lead) => lead.id === options.cursor);
      if (cursorLead) {
        const cursorScore = Number(cursorLead.finalScore);
        deduped = deduped.filter(
          (lead) =>
            Number(lead.finalScore) < cursorScore ||
            (Number(lead.finalScore) === cursorScore && lead.id < cursorLead.id),
        );
      }
    }
  }

  const hasMore = deduped.length > limit;
  const page = hasMore ? deduped.slice(0, limit) : deduped;
  return {
    leads: page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function getHighValueLeadNavigation(
  db: Db,
  companyId: string,
  leadId: string,
  userId: string,
): Promise<HighValueLeadNavigation | null> {
  const { leads } = await getHighValueLeadsByCompanyId(db, companyId, {
    limit: 10_000,
    userId,
  });
  return computeLeadNeighbors(
    leads.map((lead) => lead.id),
    leadId,
  );
}

export async function getHighValueCompanyById(
  db: Db,
  companyId: string,
  userId: string,
): Promise<HighValueCompanySummary | undefined> {
  const companiesList = await listHighValueCompanies(db, userId);
  return companiesList.find((company) => company.id === companyId);
}
