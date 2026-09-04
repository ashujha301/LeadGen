import type { SearchIntent } from "@/shared/contracts";
import type { Db } from "@/server/infrastructure/db";
import {
  businessSignals,
  companies,
  employments,
  leadCandidates,
  people,
} from "@/server/infrastructure/db";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

export type StructuredSearchResult = {
  leadId: string;
  personName: string;
  companyName: string;
  score: number;
  confidence: number;
};

export type CompiledSearchQuery = {
  where: SQL | undefined;
  orderBy: SQL[];
};

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

function buildSortExpressions(intent: SearchIntent): SQL[] {
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

/**
 * Compile a validated SearchIntent into parameterized Drizzle conditions.
 * No AI-generated SQL is accepted.
 */
export function compileSearchIntent(intent: SearchIntent, runId?: string): CompiledSearchQuery {
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
    conditions.push(ilike(companies.normalizedName, `%${intent.company.toLowerCase()}%`));
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

  if (intent.previousCompany) {
    conditions.push(
      sql`exists (
        select 1
        from ${employments} prev_emp
        inner join ${companies} prev_co on prev_co.id = prev_emp.company_id
        where prev_emp.person_id = ${people.id}
          and prev_emp.is_current = false
          and prev_co.normalized_name ilike ${`%${intent.previousCompany.toLowerCase()}%`}
      )`,
    );
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

export async function executeStructuredSearch(
  db: Db,
  intent: SearchIntent,
  options: { runId?: string; limit?: number } = {},
): Promise<StructuredSearchResult[]> {
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

export function sanitizeSearchIntent(intent: SearchIntent): SearchIntent {
  const sanitized: SearchIntent = {};

  if (intent.roles?.length) {
    sanitized.roles = intent.roles.map((role) => role.trim().toLowerCase()).filter(Boolean);
  }

  if (intent.seniority?.length) {
    sanitized.seniority = intent.seniority.map((value) => value.trim().toLowerCase()).filter(Boolean);
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

  if (intent.previousCompany?.trim()) {
    sanitized.previousCompany = intent.previousCompany.trim();
  }

  if (intent.signalType?.trim()) {
    sanitized.signalType = intent.signalType.trim();
  }

  if (intent.employmentOverlap) {
    sanitized.employmentOverlap = {
      companyA: intent.employmentOverlap.companyA.trim(),
      companyB: intent.employmentOverlap.companyB?.trim(),
      minOverlapDays: intent.employmentOverlap.minOverlapDays,
    };
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

export function hasEmploymentOverlapIntent(intent: SearchIntent): boolean {
  return Boolean(intent.employmentOverlap?.companyA);
}

export function getAllowedSortFields(): Array<NonNullable<SearchIntent["sortBy"]>> {
  return ["score", "confidence", "freshness", "name"];
}

export function getAllowedSortOrders(): Array<NonNullable<SearchIntent["sortOrder"]>> {
  return ["asc", "desc"];
}

export function getRoleFilterValues(roles: string[]): string[] {
  return [...new Set(roles.map((role) => role.trim().toLowerCase()).filter(Boolean))];
}

export function usesCompanyJoin(intent: SearchIntent): boolean {
  return Boolean(intent.company || intent.previousCompany || intent.signalType);
}

export function usesEmploymentJoin(intent: SearchIntent): boolean {
  return Boolean(intent.roles?.length || intent.seniority?.length || intent.previousCompany);
}

export function usesSignalJoin(intent: SearchIntent): boolean {
  return Boolean(intent.signalType);
}

export function buildSearchIntentSummary(intent: SearchIntent): string {
  const parts: string[] = [];

  if (intent.roles?.length) {
    parts.push(`roles=${intent.roles.join(",")}`);
  }
  if (intent.company) {
    parts.push(`company=${intent.company}`);
  }
  if (intent.previousCompany) {
    parts.push(`previousCompany=${intent.previousCompany}`);
  }
  if (intent.scoreThreshold !== undefined) {
    parts.push(`score>=${intent.scoreThreshold}`);
  }
  if (intent.confidenceThreshold !== undefined) {
    parts.push(`confidence>=${intent.confidenceThreshold}`);
  }

  return parts.join("; ") || "default";
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
  return sanitizeSearchIntent({ ...base, ...override });
}

export function intentRequiresRunScope(intent: SearchIntent): boolean {
  return !intent.employmentOverlap && !intent.previousCompany;
}

export function buildInArrayCondition<T extends string>(column: SQL, values: T[]): SQL | undefined {
  return values.length > 0 ? inArray(column as never, values as never) : undefined;
}
