import type {
  ConnectionsSearchIntent,
  LeadSearchResult,
  LeadsSearchIntent,
  SearchIntent,
  TimelineSearchIntent,
} from "@/shared/contracts";
import type { Db } from "@/server/infrastructure/db";
import {
  businessSignals,
  companies,
  employments,
  leadCandidates,
  people,
  personExperienceMetrics,
} from "@/server/infrastructure/db";
import { findEmploymentOverlaps } from "@/server/domain/search/connection-search";
import { normalizeDomain } from "@/server/domain/normalization/domain";
import { deriveTimelineStatus } from "@/server/application/services/persist-person-enrichment";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

export type StructuredSearchResult = LeadSearchResult;

export type CompiledSearchQuery = {
  where: SQL | undefined;
  orderBy: SQL[];
};

export class NaturalSearchError extends Error {
  constructor(
    public readonly code:
      | "AI_UNAVAILABLE"
      | "SEARCH_NOT_UNDERSTOOD"
      | "UPSTREAM_TIMEOUT"
      | "AMBIGUOUS_PERSON"
      | "VALIDATION_ERROR"
      | "NOT_FOUND",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NaturalSearchError";
  }
}

function buildRoleConditions(roles: string[]): SQL | undefined {
  const patterns = roles.map((role) => `%${role.toLowerCase()}%`);
  const roleMatches = patterns.map((pattern) =>
    or(
      ilike(employments.normalizedRole, pattern),
      ilike(employments.normalizedTitle, pattern),
      ilike(employments.seniority, pattern),
    ),
  );

  return roleMatches.length > 0 ? or(...roleMatches) : undefined;
}

function buildSeniorityConditions(seniority: string[]): SQL | undefined {
  const patterns = seniority.map((value) => `%${value.toLowerCase()}%`);
  const matches = patterns.map((pattern) => ilike(employments.seniority, pattern));
  return matches.length > 0 ? or(...matches) : undefined;
}

function buildSortExpressions(intent: LeadsSearchIntent): SQL[] {
  const sortOrder = intent.sortOrder === "asc" ? asc : desc;

  switch (intent.sortBy) {
    case "confidence":
      return [sortOrder(leadCandidates.confidence), desc(leadCandidates.id)];
    case "freshness":
      return [sortOrder(leadCandidates.updatedAt), desc(leadCandidates.id)];
    case "name":
      return [sortOrder(people.normalizedName), desc(leadCandidates.id)];
    case "score":
    default:
      return [sortOrder(leadCandidates.finalScore), desc(leadCandidates.id)];
  }
}

function companyLookupCondition(company: string): SQL {
  const normalized = company.toLowerCase();
  const domain = normalizeDomain(company);
  return or(
    ilike(companies.normalizedName, `%${normalized}%`),
    ilike(companies.websiteUrl, `%${normalized}%`),
    domain ? eq(companies.normalizedDomain, domain) : sql`false`,
    sql`exists (
      select 1 from company_aliases ca
      where ca.company_id = ${companies.id}
        and ca.normalized_value ilike ${`%${normalized}%`}
    )`,
  )!;
}

/**
 * Compile a validated leads SearchIntent into parameterized Drizzle conditions.
 * No AI-generated SQL is accepted.
 */
export function compileSearchIntent(
  intent: LeadsSearchIntent,
  runId?: string,
): CompiledSearchQuery {
  const conditions: SQL[] = [];

  if (runId) {
    conditions.push(eq(leadCandidates.runId, runId));
  }

  if (intent.scoreThreshold !== undefined) {
    conditions.push(gte(leadCandidates.finalScore, String(intent.scoreThreshold)));
  }

  if (intent.confidenceThreshold !== undefined) {
    conditions.push(gte(leadCandidates.confidence, String(intent.confidenceThreshold)));
  }

  if (intent.company) {
    conditions.push(companyLookupCondition(intent.company));
  }

  if (intent.roles?.length) {
    const roleCondition = buildRoleConditions(intent.roles);
    if (roleCondition) {
      conditions.push(roleCondition);
    }
  }

  if (intent.seniority?.length) {
    const seniorityCondition = buildSeniorityConditions(intent.seniority);
    if (seniorityCondition) {
      conditions.push(seniorityCondition);
    }
  }

  if (intent.signalType) {
    conditions.push(eq(businessSignals.signalType, intent.signalType));
  }

  if (intent.dateRange?.from) {
    conditions.push(gte(leadCandidates.updatedAt, new Date(intent.dateRange.from)));
  }

  if (intent.dateRange?.to) {
    conditions.push(sql`${leadCandidates.updatedAt} <= ${new Date(intent.dateRange.to)}`);
  }

  return {
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: buildSortExpressions(intent),
  };
}

export function intentHasMeaningfulConstraint(intent: SearchIntent): boolean {
  if (intent.mode === "leads") {
    return Boolean(
      intent.roles?.length ||
      intent.seniority?.length ||
      intent.company ||
      intent.scoreThreshold !== undefined ||
      intent.confidenceThreshold !== undefined ||
      intent.signalType ||
      intent.dateRange?.from ||
      intent.dateRange?.to,
    );
  }
  if (intent.mode === "timeline") {
    return Boolean(intent.personName || intent.currentCompany || intent.previousCompany);
  }
  return Boolean(intent.companyA);
}

export async function executeStructuredSearch(
  db: Db,
  intent: LeadsSearchIntent,
  options: { runId?: string; limit?: number } = {},
): Promise<LeadSearchResult[]> {
  const limit = options.limit ?? 50;
  const compiled = compileSearchIntent(intent, options.runId);

  const rows = await db
    .select({
      leadId: leadCandidates.id,
      personName: people.name,
      companyName: companies.name,
      score: leadCandidates.finalScore,
      confidence: leadCandidates.confidence,
    })
    .from(leadCandidates)
    .innerJoin(people, eq(people.id, leadCandidates.personId))
    .innerJoin(companies, eq(companies.id, leadCandidates.companyId))
    .leftJoin(
      employments,
      and(eq(employments.personId, people.id), eq(employments.companyId, companies.id)),
    )
    .leftJoin(businessSignals, eq(businessSignals.companyId, companies.id))
    .where(compiled.where)
    .groupBy(
      leadCandidates.id,
      people.name,
      companies.name,
      leadCandidates.finalScore,
      leadCandidates.confidence,
    )
    .orderBy(...compiled.orderBy)
    .limit(limit);

  return rows.map((row) => ({
    leadId: row.leadId,
    personName: row.personName,
    companyName: row.companyName,
    score: Number(row.score),
    confidence: Number(row.confidence),
  }));
}

function sortEmploymentRows<T extends { isCurrent: boolean; startDate: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) => {
    if (left.isCurrent !== right.isCurrent) {
      return left.isCurrent ? -1 : 1;
    }
    const leftStart = left.startDate ?? "";
    const rightStart = right.startDate ?? "";
    return rightStart.localeCompare(leftStart);
  });
}

async function resolveCompanyIdsByQuery(
  db: Db,
  query: string,
  options: { runId?: string } = {},
): Promise<string[]> {
  const normalized = query.toLowerCase();
  const domain = normalizeDomain(query);
  const conditions: SQL[] = [
    or(
      ilike(companies.normalizedName, `%${normalized}%`),
      domain ? eq(companies.normalizedDomain, domain) : sql`false`,
    )!,
  ];

  if (options.runId) {
    conditions.push(
      sql`exists (
        select 1 from lead_candidates lc
        where lc.company_id = ${companies.id}
          and lc.run_id = ${options.runId}
      )`,
    );
  }

  const rows = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(...conditions))
    .limit(5);
  return rows.map((row) => row.id);
}

export async function executeTimelineSearch(
  db: Db,
  intent: TimelineSearchIntent,
  options: { runId?: string; limit?: number } = {},
) {
  const limit = options.limit ?? 20;
  const conditions: SQL[] = [];

  if (intent.personName?.trim()) {
    conditions.push(ilike(people.normalizedName, `%${intent.personName.trim().toLowerCase()}%`));
  }

  if (options.runId) {
    conditions.push(
      sql`exists (
        select 1 from lead_candidates lc
        where lc.person_id = ${people.id}
          and lc.run_id = ${options.runId}
      )`,
    );
  }

  if (intent.currentCompany?.trim()) {
    const company = intent.currentCompany.trim().toLowerCase();
    conditions.push(
      sql`exists (
        select 1
        from ${employments} cur_emp
        left join ${companies} cur_co on cur_co.id = cur_emp.company_id
        where cur_emp.person_id = ${people.id}
          and cur_emp.is_current = true
          and (
            cur_co.normalized_name ilike ${`%${company}%`}
            or coalesce(cur_emp.employer_name, '') ilike ${`%${company}%`}
            or coalesce(cur_emp.employer_domain, '') ilike ${`%${company}%`}
          )
      )`,
    );
  }

  if (intent.previousCompany?.trim()) {
    const company = intent.previousCompany.trim().toLowerCase();
    conditions.push(
      sql`exists (
        select 1
        from ${employments} prev_emp
        left join ${companies} prev_co on prev_co.id = prev_emp.company_id
        where prev_emp.person_id = ${people.id}
          and prev_emp.is_current = false
          and (
            prev_co.normalized_name ilike ${`%${company}%`}
            or coalesce(prev_emp.employer_name, '') ilike ${`%${company}%`}
            or coalesce(prev_emp.employer_domain, '') ilike ${`%${company}%`}
          )
      )`,
    );
  }

  const personRows = await db
    .select({
      personId: people.id,
      personName: people.name,
    })
    .from(people)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit + 1);

  if (intent.personName?.trim() && personRows.length > 1) {
    throw new NaturalSearchError("AMBIGUOUS_PERSON", "Multiple people matched that name", {
      matches: personRows.slice(0, 5).map((row) => ({
        personId: row.personId,
        personName: row.personName,
      })),
    });
  }

  const items = [];
  for (const person of personRows.slice(0, limit)) {
    const employmentRows = await db.query.employments.findMany({
      where: eq(employments.personId, person.personId),
    });
    const sorted = sortEmploymentRows(employmentRows);
    const mapped = await Promise.all(
      sorted.map(async (employment) => {
        const company = employment.companyId
          ? await db.query.companies.findFirst({ where: eq(companies.id, employment.companyId) })
          : null;
        return {
          companyId: employment.companyId,
          companyName: company?.name ?? employment.employerName ?? "Unknown company",
          title: employment.rawTitle,
          startDate: employment.startDate,
          endDate: employment.endDate,
          isCurrent: employment.isCurrent,
          employerDomain: employment.employerDomain ?? null,
        };
      }),
    );

    const [metrics] = await db
      .select()
      .from(personExperienceMetrics)
      .where(eq(personExperienceMetrics.personId, person.personId))
      .limit(1);

    const [lead] = await db
      .select({
        id: leadCandidates.id,
        enrichmentStatus: leadCandidates.enrichmentStatus,
      })
      .from(leadCandidates)
      .where(
        options.runId
          ? and(
              eq(leadCandidates.personId, person.personId),
              eq(leadCandidates.runId, options.runId),
            )
          : eq(leadCandidates.personId, person.personId),
      )
      .limit(1);

    const calculatedMonths = metrics?.calculatedTotalMonths ?? null;
    const providerYears = metrics?.providerExperienceYears
      ? Number(metrics.providerExperienceYears)
      : null;

    items.push({
      personId: person.personId,
      personName: person.personName,
      leadId: lead?.id ?? null,
      timelineStatus: deriveTimelineStatus({
        enrichmentStatus: lead?.enrichmentStatus,
        employmentCount: mapped.length,
      }),
      totalExperienceYears: calculatedMonths != null ? calculatedMonths / 12 : providerYears,
      providerExperienceYears: providerYears,
      calculatedExperienceMonths: calculatedMonths,
      employments: mapped,
    });
  }

  return items;
}

export async function executeConnectionsSearch(
  db: Db,
  intent: ConnectionsSearchIntent,
  options: { runId?: string } = {},
) {
  const companyIds = await resolveCompanyIdsByQuery(db, intent.companyA, {
    runId: options.runId,
  });
  if (companyIds.length === 0) {
    return [];
  }

  let personId: string | undefined;
  if (intent.personName?.trim()) {
    const matches = await db
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(ilike(people.normalizedName, `%${intent.personName.trim().toLowerCase()}%`))
      .limit(5);
    if (matches.length > 1) {
      throw new NaturalSearchError("AMBIGUOUS_PERSON", "Multiple people matched that name", {
        matches,
      });
    }
    personId = matches[0]?.id;
  }

  const allResults = [];
  for (const companyId of companyIds) {
    const overlaps = await findEmploymentOverlaps(db, {
      companyId,
      personId,
      minOverlapDays: intent.minOverlapDays ?? 30,
    });
    allResults.push(...overlaps);
  }

  if (intent.companyB?.trim()) {
    const companyB = intent.companyB.trim().toLowerCase();
    return allResults.filter((result) => result.company.name.toLowerCase().includes(companyB));
  }

  return allResults;
}

export function sanitizeSearchIntent(intent: SearchIntent): SearchIntent {
  if (intent.mode === "leads") {
    const sanitized: LeadsSearchIntent = { mode: "leads" };
    if (intent.roles?.length) {
      sanitized.roles = intent.roles.map((role) => role.trim().toLowerCase()).filter(Boolean);
    }
    if (intent.seniority?.length) {
      sanitized.seniority = intent.seniority
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    }
    if (intent.scoreThreshold !== undefined) {
      sanitized.scoreThreshold = Math.min(100, Math.max(0, intent.scoreThreshold));
    }
    if (intent.confidenceThreshold !== undefined) {
      sanitized.confidenceThreshold = Math.min(1, Math.max(0, intent.confidenceThreshold));
    }
    if (intent.company?.trim()) {
      sanitized.company = intent.company.trim();
    }
    if (intent.signalType?.trim()) {
      sanitized.signalType = intent.signalType.trim();
    }
    if (intent.dateRange) {
      sanitized.dateRange = {
        from: intent.dateRange.from,
        to: intent.dateRange.to,
      };
    }
    if (intent.sortBy) {
      sanitized.sortBy = intent.sortBy;
    }
    if (intent.sortOrder) {
      sanitized.sortOrder = intent.sortOrder;
    }
    return sanitized;
  }

  if (intent.mode === "timeline") {
    return {
      mode: "timeline",
      personName: intent.personName?.trim() || undefined,
      currentCompany: intent.currentCompany?.trim() || undefined,
      previousCompany: intent.previousCompany?.trim() || undefined,
    };
  }

  return {
    mode: "connections",
    companyA: intent.companyA.trim(),
    companyB: intent.companyB?.trim() || undefined,
    personName: intent.personName?.trim() || undefined,
    minOverlapDays: intent.minOverlapDays,
  };
}

export function buildSearchIntentSummary(intent: SearchIntent): string {
  if (intent.mode === "leads") {
    const parts: string[] = ["mode=leads"];
    if (intent.roles?.length) {
      parts.push(`roles=${intent.roles.join(",")}`);
    }
    if (intent.company) {
      parts.push(`company=${intent.company}`);
    }
    if (intent.scoreThreshold !== undefined) {
      parts.push(`score>=${intent.scoreThreshold}`);
    }
    if (intent.confidenceThreshold !== undefined) {
      parts.push(`confidence>=${intent.confidenceThreshold}`);
    }
    return parts.join("; ");
  }

  if (intent.mode === "timeline") {
    const parts = ["mode=timeline"];
    if (intent.personName) {
      parts.push(`person=${intent.personName}`);
    }
    if (intent.previousCompany) {
      parts.push(`previousCompany=${intent.previousCompany}`);
    }
    if (intent.currentCompany) {
      parts.push(`currentCompany=${intent.currentCompany}`);
    }
    return parts.join("; ");
  }

  const parts = [`mode=connections`, `companyA=${intent.companyA}`];
  if (intent.companyB) {
    parts.push(`companyB=${intent.companyB}`);
  }
  if (intent.minOverlapDays) {
    parts.push(`minOverlapDays=${intent.minOverlapDays}`);
  }
  return parts.join("; ");
}

export function hasEmploymentOverlapIntent(intent: SearchIntent): boolean {
  return intent.mode === "connections";
}

export function getAllowedSortFields(): Array<NonNullable<LeadsSearchIntent["sortBy"]>> {
  return ["score", "confidence", "freshness", "name"];
}

export function getAllowedSortOrders(): Array<NonNullable<LeadsSearchIntent["sortOrder"]>> {
  return ["asc", "desc"];
}

export function getRoleFilterValues(roles: string[]): string[] {
  return [...new Set(roles.map((role) => role.trim().toLowerCase()).filter(Boolean))];
}

export function usesCompanyJoin(intent: SearchIntent): boolean {
  return intent.mode === "leads" && Boolean(intent.company || intent.signalType);
}

export function usesEmploymentJoin(intent: SearchIntent): boolean {
  return intent.mode === "leads" && Boolean(intent.roles?.length || intent.seniority?.length);
}

export function usesSignalJoin(intent: SearchIntent): boolean {
  return intent.mode === "leads" && Boolean(intent.signalType);
}

export function filterResultsByLeadIds(
  results: StructuredSearchResult[],
  leadIds: string[],
): StructuredSearchResult[] {
  if (leadIds.length === 0) {
    return results;
  }

  const allowed = new Set(leadIds);
  return results.filter((result) => allowed.has(result.leadId));
}

export function mergeSearchIntents(base: SearchIntent, override: SearchIntent): SearchIntent {
  if (base.mode !== override.mode) {
    return sanitizeSearchIntent(override);
  }
  return sanitizeSearchIntent({ ...base, ...override } as SearchIntent);
}

export function intentRequiresRunScope(intent: SearchIntent): boolean {
  return intent.mode === "leads";
}

export function buildInArrayCondition<T extends string>(column: SQL, values: T[]): SQL | undefined {
  return values.length > 0 ? inArray(column as never, values as never) : undefined;
}
