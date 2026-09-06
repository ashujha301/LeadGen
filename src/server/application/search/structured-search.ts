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
  searchRuns,
} from "@/server/infrastructure/db";
import { normalizeDomain } from "@/server/domain/normalization/domain";
import { deriveTimelineStatus } from "@/server/application/services/persist-person-enrichment";
import { userOwnsCompany } from "@/server/infrastructure/db/repositories/ownership";
import {
  getLatestOwnedPersonEnrichmentRun,
  listProvenanceEmploymentsForUser,
} from "@/server/infrastructure/db/repositories/search-provenance";
import { calculateExperienceMetrics } from "@/server/domain/timeline/experience-calculation";
import { classifyTitle } from "@/server/domain/roles/classification";
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";

import { NaturalSearchError } from "./natural-search-error";

export { NaturalSearchError };
export type StructuredSearchResult = LeadSearchResult;

export type CompiledSearchQuery = {
  where: SQL | undefined;
  orderBy: SQL[];
};

export const MAX_NATURAL_SEARCH_RESULTS = 50;

export function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function requireSearchUserId(userId: string | undefined): string {
  if (!userId) {
    throw new NaturalSearchError(
      "VALIDATION_ERROR",
      "Authenticated userId is required for natural search",
    );
  }
  return userId;
}

function clampSearchLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit) || limit <= 0) {
    return MAX_NATURAL_SEARCH_RESULTS;
  }
  return Math.min(Math.floor(limit), MAX_NATURAL_SEARCH_RESULTS);
}

function ilikeContains(column: SQL | object, rawValue: string): SQL {
  const pattern = `%${escapeIlikePattern(rawValue.toLowerCase())}%`;
  return sql`${column} ILIKE ${pattern} ESCAPE '\\'`;
}

async function withReadOnlySearchTransaction<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    await tx.execute(sql`SET LOCAL statement_timeout = '5000ms'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '1000ms'`);
    return fn(tx as unknown as Db);
  });
}

function buildRoleConditions(roles: string[]): SQL | undefined {
  const roleMatches = roles.map((role) =>
    or(
      ilikeContains(employments.normalizedRole, role),
      ilikeContains(employments.normalizedTitle, role),
      ilikeContains(employments.seniority, role),
    ),
  );

  return roleMatches.length > 0 ? or(...roleMatches) : undefined;
}

function buildSeniorityConditions(seniority: string[]): SQL | undefined {
  const matches = seniority.map((value) => ilikeContains(employments.seniority, value));
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
  const namePattern = `%${escapeIlikePattern(normalized)}%`;
  return or(
    sql`${companies.normalizedName} ILIKE ${namePattern} ESCAPE '\\'`,
    sql`${companies.websiteUrl} ILIKE ${namePattern} ESCAPE '\\'`,
    domain ? eq(companies.normalizedDomain, domain) : sql`false`,
    sql`exists (
      select 1 from company_aliases ca
      where ca.company_id = ${companies.id}
        and ca.normalized_value ILIKE ${namePattern} ESCAPE '\\'
    )`,
  )!;
}

/**
 * Compile a validated leads SearchIntent into parameterized Drizzle conditions.
 * No AI-generated SQL is accepted.
 */
export function compileSearchIntent(
  intent: LeadsSearchIntent,
  options: { runId?: string; userId: string },
): CompiledSearchQuery {
  const userId = requireSearchUserId(options.userId);
  const conditions: SQL[] = [];

  if (options.runId) {
    conditions.push(eq(leadCandidates.runId, options.runId));
  }

  conditions.push(
    sql`exists (
      select 1 from search_runs
      where search_runs.id = ${leadCandidates.runId}
        and search_runs.user_id = ${userId}
    )`,
  );

  if (intent.scoreThreshold !== undefined) {
    const scoreValue = String(intent.scoreThreshold);
    const op = intent.scoreOperator ?? "gte";
    if (op === "gt") conditions.push(gt(leadCandidates.finalScore, scoreValue));
    else if (op === "lt") conditions.push(lt(leadCandidates.finalScore, scoreValue));
    else if (op === "lte") conditions.push(lte(leadCandidates.finalScore, scoreValue));
    else conditions.push(gte(leadCandidates.finalScore, scoreValue));
  }

  if (intent.confidenceThreshold !== undefined) {
    conditions.push(gte(leadCandidates.confidence, String(intent.confidenceThreshold)));
  }

  if (intent.resolvedCompanyIds?.length) {
    conditions.push(inArray(leadCandidates.companyId, intent.resolvedCompanyIds));
  } else if (intent.company) {
    conditions.push(companyLookupCondition(intent.company));
  }

  const roleTerms = [...(intent.roles ?? []), ...(intent.roleAliases ?? [])].filter(Boolean);
  if (roleTerms.length) {
    const roleCondition = buildRoleConditions([...new Set(roleTerms.map((r) => r.toLowerCase()))]);
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

  if (intent.semanticLeadIds?.length) {
    conditions.push(inArray(leadCandidates.id, intent.semanticLeadIds));
  }

  return {
    where: and(...conditions),
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
  options: { runId?: string; userId: string; limit?: number },
): Promise<LeadSearchResult[]> {
  const userId = requireSearchUserId(options.userId);
  const limit = clampSearchLimit(options.limit);
  const compiled = compileSearchIntent(intent, {
    runId: options.runId,
    userId,
  });

  return withReadOnlySearchTransaction(db, async (tx) => {
    const rows = await tx
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
  });
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
  options: { runId?: string; userId: string },
): Promise<string[]> {
  const userId = requireSearchUserId(options.userId);
  const normalized = query.toLowerCase();
  const domain = normalizeDomain(query);
  const namePattern = `%${escapeIlikePattern(normalized)}%`;
  const conditions: SQL[] = [
    or(
      sql`${companies.normalizedName} ILIKE ${namePattern} ESCAPE '\\'`,
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

  conditions.push(
    sql`exists (
      select 1 from lead_candidates lc
      inner join search_runs sr on sr.id = lc.run_id
      where lc.company_id = ${companies.id}
        and sr.user_id = ${userId}
    )`,
  );

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
  options: { runId?: string; userId: string; limit?: number },
) {
  const userId = requireSearchUserId(options.userId);
  const limit = clampSearchLimit(options.limit ?? 20);

  return withReadOnlySearchTransaction(db, async (tx) => {
    const conditions: SQL[] = [];

    if (intent.personName?.trim()) {
      conditions.push(ilikeContains(people.normalizedName, intent.personName.trim()));
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

    conditions.push(
      sql`exists (
        select 1 from lead_candidates lc
        inner join search_runs sr on sr.id = lc.run_id
        where lc.person_id = ${people.id}
          and sr.user_id = ${userId}
      )`,
    );

    if (intent.currentCompany?.trim()) {
      const companyPattern = `%${escapeIlikePattern(intent.currentCompany.trim().toLowerCase())}%`;
      conditions.push(
        sql`exists (
          select 1
          from ${employments} cur_emp
          left join ${companies} cur_co on cur_co.id = cur_emp.company_id
          where cur_emp.person_id = ${people.id}
            and cur_emp.is_current = true
            and (
              cur_co.normalized_name ILIKE ${companyPattern} ESCAPE '\\'
              or coalesce(cur_emp.employer_name, '') ILIKE ${companyPattern} ESCAPE '\\'
              or coalesce(cur_emp.employer_domain, '') ILIKE ${companyPattern} ESCAPE '\\'
            )
        )`,
      );
    }

    if (intent.previousCompany?.trim()) {
      const companyPattern = `%${escapeIlikePattern(intent.previousCompany.trim().toLowerCase())}%`;
      conditions.push(
        sql`exists (
          select 1
          from ${employments} prev_emp
          left join ${companies} prev_co on prev_co.id = prev_emp.company_id
          where prev_emp.person_id = ${people.id}
            and prev_emp.is_current = false
            and (
              prev_co.normalized_name ILIKE ${companyPattern} ESCAPE '\\'
              or coalesce(prev_emp.employer_name, '') ILIKE ${companyPattern} ESCAPE '\\'
              or coalesce(prev_emp.employer_domain, '') ILIKE ${companyPattern} ESCAPE '\\'
            )
        )`,
      );
    }

    const personRows = await tx
      .select({
        personId: people.id,
        personName: people.name,
      })
      .from(people)
      .where(and(...conditions))
      .orderBy(asc(people.normalizedName), asc(people.id))
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
      const employmentRows = await listProvenanceEmploymentsForUser(tx, {
        personId: person.personId,
        userId,
        runId: options.runId,
      });
      const deduped = [...new Map(employmentRows.map((row) => [row.id, row])).values()];
      const sorted = sortEmploymentRows(deduped);
      const companyIds = sorted
        .map((employment) => employment.companyId)
        .filter((id): id is string => Boolean(id));
      const companyRows =
        companyIds.length > 0
          ? await tx
              .select({ id: companies.id, name: companies.name })
              .from(companies)
              .where(inArray(companies.id, companyIds))
          : [];
      const companyNameById = new Map(companyRows.map((row) => [row.id, row.name]));

      const mapped = sorted.map((employment) => ({
        companyId: employment.companyId,
        companyName:
          (employment.companyId ? companyNameById.get(employment.companyId) : undefined) ??
          employment.employerName ??
          "Unknown company",
        title: employment.rawTitle,
        startDate: employment.startDate,
        endDate: employment.endDate,
        isCurrent: employment.isCurrent,
        employerDomain: employment.employerDomain ?? null,
      }));

      const enrichmentRun = await getLatestOwnedPersonEnrichmentRun(tx, {
        personId: person.personId,
        userId,
        runId: options.runId,
      });

      const [lead] = await tx
        .select({
          id: leadCandidates.id,
          enrichmentStatus: leadCandidates.enrichmentStatus,
        })
        .from(leadCandidates)
        .innerJoin(searchRuns, eq(leadCandidates.runId, searchRuns.id))
        .where(
          and(
            eq(leadCandidates.personId, person.personId),
            options.runId ? eq(leadCandidates.runId, options.runId) : undefined,
            eq(searchRuns.userId, userId),
          ),
        )
        .orderBy(desc(leadCandidates.updatedAt), desc(leadCandidates.id))
        .limit(1);

      const calculated = calculateExperienceMetrics(
        sorted
          .filter((row) => row.startDate)
          .map((row) => {
            const seniorities = row.rawTitle ? classifyTitle(row.rawTitle).seniorities : [];
            return {
              startDate: new Date(row.startDate!),
              endDate: row.isCurrent ? new Date() : row.endDate ? new Date(row.endDate) : null,
              isLeadership: seniorities.some((token) =>
                ["founder", "owner", "c_suite", "vp", "head", "director"].includes(token),
              ),
            };
          }),
      );
      const calculatedMonths = calculated.calculatedTotalMonths || null;
      const providerYears = enrichmentRun?.providerExperienceYears
        ? Number(enrichmentRun.providerExperienceYears)
        : null;

      items.push({
        personId: person.personId,
        personName: person.personName,
        leadId: lead?.id ?? null,
        timelineStatus: deriveTimelineStatus({
          enrichmentStatus: enrichmentRun?.enrichmentStatus ?? lead?.enrichmentStatus,
          employmentCount: mapped.length,
        }),
        totalExperienceYears: calculatedMonths != null ? calculatedMonths / 12 : providerYears,
        providerExperienceYears: providerYears,
        calculatedExperienceMonths: calculatedMonths,
        employments: mapped,
      });
    }

    return items;
  });
}

export async function executeConnectionsSearch(
  db: Db,
  intent: ConnectionsSearchIntent,
  options: { runId?: string; userId: string },
) {
  const userId = requireSearchUserId(options.userId);
  const minOverlapDays = intent.minOverlapDays ?? 30;

  return withReadOnlySearchTransaction(db, async (tx) => {
    const companyIds = await resolveCompanyIdsByQuery(tx, intent.companyA, {
      runId: options.runId,
      userId,
    });
    if (companyIds.length === 0) {
      return [];
    }

    const results: Array<{
      personA: { id: string; name: string };
      personB: { id: string; name: string };
      company: { id: string; name: string };
      overlapStart: string | null;
      overlapEnd: string | null;
      overlapDays: number;
    }> = [];

    for (const companyAId of companyIds) {
      if (!(await userOwnsCompany(tx, companyAId, userId))) {
        continue;
      }

      const anchorPeople = await tx
        .selectDistinct({
          personId: leadCandidates.personId,
          personName: people.name,
        })
        .from(leadCandidates)
        .innerJoin(searchRuns, eq(leadCandidates.runId, searchRuns.id))
        .innerJoin(people, eq(people.id, leadCandidates.personId))
        .where(
          and(
            eq(leadCandidates.companyId, companyAId),
            eq(searchRuns.userId, userId),
            options.runId ? eq(leadCandidates.runId, options.runId) : undefined,
          ),
        )
        .orderBy(asc(people.normalizedName), asc(people.id));

      if (anchorPeople.length === 0) {
        continue;
      }

      let anchorIds = anchorPeople.map((person) => person.personId);
      if (intent.personName?.trim()) {
        const pattern = `%${escapeIlikePattern(intent.personName.trim().toLowerCase())}%`;
        const sqlMatches = await tx
          .select({ id: people.id, name: people.name })
          .from(people)
          .where(
            and(
              inArray(people.id, anchorIds),
              sql`${people.normalizedName} ILIKE ${pattern} ESCAPE '\\'`,
            ),
          )
          .orderBy(asc(people.normalizedName), asc(people.id))
          .limit(5);
        if (sqlMatches.length > 1) {
          throw new NaturalSearchError("AMBIGUOUS_PERSON", "Multiple people matched that name", {
            matches: sqlMatches,
          });
        }
        if (sqlMatches.length === 0) {
          continue;
        }
        anchorIds = [sqlMatches[0]!.id];
      }

      const companyBPattern = intent.companyB?.trim()
        ? `%${escapeIlikePattern(intent.companyB.trim().toLowerCase())}%`
        : null;

      const overlapRows = await tx.execute(sql`
        SELECT
          a.person_id AS person_a_id,
          b.person_id AS person_b_id,
          pa.name AS person_a_name,
          pb.name AS person_b_name,
          a.company_id AS company_id,
          c.name AS company_name,
          GREATEST(a.start_date, b.start_date) AS overlap_start,
          LEAST(COALESCE(a.end_date, CURRENT_DATE), COALESCE(b.end_date, CURRENT_DATE)) AS overlap_end,
          (
            LEAST(COALESCE(a.end_date, CURRENT_DATE), COALESCE(b.end_date, CURRENT_DATE))
            - GREATEST(a.start_date, b.start_date)
          ) AS overlap_days
        FROM employments a
        INNER JOIN employments b
          ON a.company_id = b.company_id
         AND a.person_id < b.person_id
        INNER JOIN people pa ON pa.id = a.person_id
        INNER JOIN people pb ON pb.id = b.person_id
        INNER JOIN companies c ON c.id = a.company_id
        WHERE a.person_id = ANY(${sql`ARRAY[${sql.join(
          anchorIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )}]`}::uuid[])
          AND b.person_id = ANY(${sql`ARRAY[${sql.join(
            anchorIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}]`}::uuid[])
          AND a.company_id IS NOT NULL
          AND a.company_id <> ${companyAId}::uuid
          AND a.start_date IS NOT NULL
          AND b.start_date IS NOT NULL
          AND GREATEST(a.start_date, b.start_date)
              <= LEAST(COALESCE(a.end_date, CURRENT_DATE), COALESCE(b.end_date, CURRENT_DATE))
          AND (
            LEAST(COALESCE(a.end_date, CURRENT_DATE), COALESCE(b.end_date, CURRENT_DATE))
            - GREATEST(a.start_date, b.start_date)
          ) >= ${minOverlapDays}
          ${
            companyBPattern
              ? sql`AND (
                c.normalized_name ILIKE ${companyBPattern} ESCAPE '\\'
                OR coalesce(c.normalized_domain, '') ILIKE ${companyBPattern} ESCAPE '\\'
                OR EXISTS (
                  SELECT 1 FROM company_aliases ca
                  WHERE ca.company_id = c.id
                    AND ca.normalized_value ILIKE ${companyBPattern} ESCAPE '\\'
                )
              )`
              : sql``
          }
        ORDER BY overlap_days DESC, person_a_id, person_b_id, company_id
        LIMIT ${MAX_NATURAL_SEARCH_RESULTS}
      `);

      const rows = Array.isArray(overlapRows)
        ? overlapRows
        : ((overlapRows as { rows?: Array<Record<string, unknown>> }).rows ?? []);

      for (const row of rows as Array<Record<string, unknown>>) {
        results.push({
          personA: { id: String(row.person_a_id), name: String(row.person_a_name ?? "Unknown") },
          personB: { id: String(row.person_b_id), name: String(row.person_b_name ?? "Unknown") },
          company: { id: String(row.company_id), name: String(row.company_name ?? "Unknown") },
          overlapStart: row.overlap_start ? String(row.overlap_start).slice(0, 10) : null,
          overlapEnd: row.overlap_end ? String(row.overlap_end).slice(0, 10) : null,
          overlapDays: Number(row.overlap_days ?? 0),
        });
      }
    }

    const deduped = [
      ...new Map(
        results.map((item) => [`${item.personA.id}:${item.personB.id}:${item.company.id}`, item]),
      ).values(),
    ];
    return deduped.slice(0, MAX_NATURAL_SEARCH_RESULTS);
  });
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
    if (intent.scoreOperator) {
      sanitized.scoreOperator = intent.scoreOperator;
    }
    if (intent.confidenceThreshold !== undefined) {
      sanitized.confidenceThreshold = Math.min(1, Math.max(0, intent.confidenceThreshold));
    }
    if (intent.company?.trim()) {
      sanitized.company = intent.company.trim();
    }
    if (intent.resolvedCompanyIds?.length) {
      sanitized.resolvedCompanyIds = intent.resolvedCompanyIds;
    }
    if (intent.roleAliases?.length) {
      sanitized.roleAliases = intent.roleAliases;
    }
    if (intent.semanticLeadIds?.length) {
      sanitized.semanticLeadIds = intent.semanticLeadIds;
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
      const op = intent.scoreOperator ?? "gte";
      parts.push(
        `score${op === "gt" ? ">" : op === "lt" ? "<" : op === "lte" ? "<=" : ">="}${intent.scoreThreshold}`,
      );
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
