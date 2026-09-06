import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { pickCanonicalLeadPerPerson } from "@/server/domain/leads/hvl-person-dedupe";
import {
  discoverPotentialConnections,
  type ConnectionEmploymentRow,
  type ConnectionLeadAnchor,
  type PotentialConnectionItem,
} from "@/server/domain/connections/engine";
import type { StrengthBand } from "@/server/domain/connections/scoring";
import { HIGH_VALUE_LEAD_THRESHOLDS } from "@/shared/config";
import {
  companies,
  employmentRunProvenance,
  employments,
  getDb,
  leadCandidates,
  people,
  searchRuns,
} from "@/server/infrastructure/db";

const hasLinkedinProfileFilter = or(
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

export type PotentialConnectionsQuery = {
  currentCompanyId?: string;
  sharedEmployer?: string;
  strengthBand?: StrengthBand;
  minOverlapDays?: number;
  includeLimited?: boolean;
  limit?: number;
};

export type PotentialConnectionsResponse = {
  items: PotentialConnectionItem[];
  summary: {
    total: number;
    strong: number;
    moderate: number;
    weak: number;
  };
  facets: {
    currentCompanies: Array<{ id: string; name: string; count: number }>;
    sharedEmployers: Array<{ key: string; name: string; count: number }>;
  };
  hasActiveRuns: boolean;
  revision: string;
  generatedAt: string;
};

async function listCanonicalHvlAnchors(userId: string): Promise<ConnectionLeadAnchor[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: leadCandidates.id,
      personId: leadCandidates.personId,
      companyId: leadCandidates.companyId,
      finalScore: leadCandidates.finalScore,
      confidence: leadCandidates.confidence,
      updatedAt: leadCandidates.updatedAt,
      personName: people.name,
      companyName: companies.name,
    })
    .from(leadCandidates)
    .innerJoin(searchRuns, eq(leadCandidates.runId, searchRuns.id))
    .innerJoin(people, eq(people.id, leadCandidates.personId))
    .innerJoin(companies, eq(companies.id, leadCandidates.companyId))
    .where(
      and(
        eq(searchRuns.userId, userId),
        eq(searchRuns.status, "completed"),
        isNull(people.mergedIntoPersonId),
        eq(leadCandidates.scoreVersion, HIGH_VALUE_LEAD_THRESHOLDS.scoreVersion),
        sql`${leadCandidates.finalScore} >= ${HIGH_VALUE_LEAD_THRESHOLDS.minScore}`,
        sql`${leadCandidates.confidence} >= ${HIGH_VALUE_LEAD_THRESHOLDS.minConfidence}`,
        eq(leadCandidates.isStale, false),
        hasLinkedinProfileFilter,
      ),
    )
    .orderBy(desc(leadCandidates.finalScore), desc(leadCandidates.id));

  const canonical = pickCanonicalLeadPerPerson(
    rows.map((row) => ({
      id: row.id,
      personId: row.personId,
      finalScore: Number(row.finalScore),
      updatedAt: row.updatedAt,
      companyId: row.companyId,
      personName: row.personName,
      companyName: row.companyName,
      confidence: Number(row.confidence),
    })),
  );

  return canonical.map((row) => ({
    leadId: row.id,
    personId: row.personId,
    personName: row.personName,
    currentCompanyId: row.companyId,
    currentCompanyName: row.companyName,
    title: null,
    finalScore: Number(row.finalScore),
    confidence: Number(row.confidence),
  }));
}

async function listScopedEmployments(
  userId: string,
  personIds: string[],
): Promise<ConnectionEmploymentRow[]> {
  if (personIds.length === 0) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select({
      personId: employments.personId,
      companyId: employments.companyId,
      employerName: employments.employerName,
      employerDomain: employments.employerDomain,
      employerLinkedinUrl: employments.employerProfessionalNetworkUrl,
      providerCompanyId: employments.providerCompanyId,
      title: employments.rawTitle,
      startDate: employments.startDate,
      endDate: employments.endDate,
      isCurrent: employments.isCurrent,
      companyDomain: companies.normalizedDomain,
      lastObservedAt: employmentRunProvenance.lastObservedAt,
    })
    .from(employments)
    .innerJoin(employmentRunProvenance, eq(employmentRunProvenance.employmentId, employments.id))
    .innerJoin(searchRuns, eq(searchRuns.id, employmentRunProvenance.runId))
    .leftJoin(companies, eq(companies.id, employments.companyId))
    .where(
      and(
        inArray(employments.personId, personIds),
        eq(searchRuns.userId, userId),
        eq(searchRuns.status, "completed"),
      ),
    );

  const freshnessCutoff = Date.now() - 1000 * 60 * 60 * 24 * 180;
  return rows.map((row) => ({
    personId: row.personId,
    companyId: row.companyId,
    companyDomain: row.companyDomain,
    employerName: row.employerName,
    employerDomain: row.employerDomain,
    employerLinkedinUrl: row.employerLinkedinUrl,
    providerCompanyId: row.providerCompanyId,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    isCurrent: row.isCurrent,
    hasProviderMatch: Boolean(row.providerCompanyId),
    provenanceFresh: row.lastObservedAt.getTime() >= freshnessCutoff,
  }));
}

async function userHasActiveRuns(userId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: searchRuns.id })
    .from(searchRuns)
    .where(
      and(
        eq(searchRuns.userId, userId),
        sql`${searchRuns.status} NOT IN ('completed', 'failed', 'canceled')`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export const potentialConnectionsService = {
  async listForUser(
    userId: string,
    query: PotentialConnectionsQuery = {},
  ): Promise<PotentialConnectionsResponse> {
    const leads = await listCanonicalHvlAnchors(userId);
    const employmentsForPeople = await listScopedEmployments(
      userId,
      leads.map((lead) => lead.personId),
    );
    const titleByPerson = new Map<string, string | null>();
    for (const lead of leads) {
      const current = employmentsForPeople.find(
        (row) =>
          row.personId === lead.personId &&
          row.companyId === lead.currentCompanyId &&
          row.isCurrent,
      );
      titleByPerson.set(lead.personId, current?.title ?? null);
    }
    const leadsWithTitles = leads.map((lead) => ({
      ...lead,
      title: titleByPerson.get(lead.personId) ?? null,
    }));
    const items = discoverPotentialConnections({
      leads: leadsWithTitles,
      employments: employmentsForPeople,
      minOverlapDays: query.minOverlapDays,
      includeLimited: query.includeLimited,
      currentCompanyId: query.currentCompanyId,
      sharedEmployer: query.sharedEmployer,
      strengthBand: query.strengthBand,
      limit: query.limit,
    });

    const companyCounts = new Map<string, { id: string; name: string; count: number }>();
    const employerCounts = new Map<string, { key: string; name: string; count: number }>();
    for (const item of items) {
      for (const person of [item.personA, item.personB]) {
        const existing = companyCounts.get(person.currentCompanyId) ?? {
          id: person.currentCompanyId,
          name: person.currentCompanyName,
          count: 0,
        };
        existing.count += 1;
        companyCounts.set(person.currentCompanyId, existing);
      }
      const employer = employerCounts.get(item.sharedEmployer.key) ?? {
        key: item.sharedEmployer.key,
        name: item.sharedEmployer.name,
        count: 0,
      };
      employer.count += 1;
      employerCounts.set(item.sharedEmployer.key, employer);
    }

    const generatedAt = new Date().toISOString();
    const hasActiveRuns = await userHasActiveRuns(userId);
    const revision = `${items.length}:${items[0]?.id ?? "empty"}:${generatedAt.slice(0, 16)}`;

    return {
      items,
      summary: {
        total: items.length,
        strong: items.filter((item) => item.strengthBand === "strong").length,
        moderate: items.filter((item) => item.strengthBand === "moderate").length,
        weak: items.filter((item) => item.strengthBand === "weak").length,
      },
      facets: {
        currentCompanies: [...companyCounts.values()].sort((a, b) => b.count - a.count),
        sharedEmployers: [...employerCounts.values()].sort((a, b) => b.count - a.count),
      },
      hasActiveRuns,
      revision,
      generatedAt,
    };
  },
};
