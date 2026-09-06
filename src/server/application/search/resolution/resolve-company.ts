import { and, eq, sql } from "drizzle-orm";

import { normalizeDomain } from "@/server/domain/normalization/domain";
import type { Db } from "@/server/infrastructure/db";
import { companies, companyAliases, leadCandidates } from "@/server/infrastructure/db/schema";

export type CompanyCandidate = {
  id: string;
  label: string;
  description?: string;
  similarity: number;
  matchStrategy: "exact_domain" | "exact_name" | "exact_alias" | "fuzzy";
};

export type CompanyResolution =
  | { status: "resolved"; company: CompanyCandidate }
  | { status: "ambiguous"; candidates: CompanyCandidate[] }
  | { status: "unresolved"; query: string };

const AUTO_RESOLVE_SIMILARITY = 0.9;
const AUTO_RESOLVE_LEAD = 0.1;
const CLARIFY_SIMILARITY = 0.55;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Resolve a company query to a user-visible canonical company.
 */
export async function resolveCompanyConstraint(
  db: Db,
  raw: string,
  userId: string,
): Promise<CompanyResolution> {
  const query = raw.trim();
  if (!query) return { status: "unresolved", query: raw };

  const domain = normalizeDomain(query);
  const normalizedName = query.toLowerCase();
  const compactName = normalizeName(query);

  const ownedCompanyFilter = sql`exists (
    select 1 from ${leadCandidates} lc
    inner join search_runs sr on sr.id = lc.run_id
    where lc.company_id = ${companies.id}
      and sr.user_id = ${userId}
  )`;

  if (domain) {
    const exactDomain = await db
      .select({
        id: companies.id,
        name: companies.name,
        domain: companies.normalizedDomain,
      })
      .from(companies)
      .where(and(eq(companies.normalizedDomain, domain), ownedCompanyFilter))
      .limit(5);

    const exactDomainHit = exactDomain[0];
    if (exactDomain.length === 1 && exactDomainHit) {
      return {
        status: "resolved",
        company: {
          id: exactDomainHit.id,
          label: exactDomainHit.name,
          description: exactDomainHit.domain ?? domain,
          similarity: 1,
          matchStrategy: "exact_domain",
        },
      };
    }
    if (exactDomain.length > 1) {
      return {
        status: "ambiguous",
        candidates: exactDomain.map((row) => ({
          id: row.id,
          label: row.name,
          description: row.domain ?? domain,
          similarity: 1,
          matchStrategy: "exact_domain" as const,
        })),
      };
    }
  }

  const exactName = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.normalizedDomain,
      normalizedName: companies.normalizedName,
    })
    .from(companies)
    .where(
      and(
        ownedCompanyFilter,
        sql`replace(lower(${companies.normalizedName}), ' ', '') = ${compactName}
            or lower(${companies.normalizedName}) = ${normalizedName}`,
      ),
    )
    .limit(5);

  const exactNameHit = exactName[0];
  if (exactName.length === 1 && exactNameHit) {
    return {
      status: "resolved",
      company: {
        id: exactNameHit.id,
        label: exactNameHit.name,
        description: exactNameHit.domain ?? undefined,
        similarity: 1,
        matchStrategy: "exact_name",
      },
    };
  }
  if (exactName.length > 1) {
    return {
      status: "ambiguous",
      candidates: exactName.map((row) => ({
        id: row.id,
        label: row.name,
        description: row.domain ?? undefined,
        similarity: 1,
        matchStrategy: "exact_name" as const,
      })),
    };
  }

  const aliasHits = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.normalizedDomain,
      alias: companyAliases.normalizedValue,
    })
    .from(companyAliases)
    .innerJoin(companies, eq(companies.id, companyAliases.companyId))
    .where(
      and(
        ownedCompanyFilter,
        sql`lower(${companyAliases.normalizedValue}) = ${normalizedName}
            or replace(lower(${companyAliases.normalizedValue}), ' ', '') = ${compactName}`,
      ),
    )
    .limit(5);

  const aliasHit = aliasHits[0];
  if (aliasHits.length === 1 && aliasHit) {
    return {
      status: "resolved",
      company: {
        id: aliasHit.id,
        label: aliasHit.name,
        description: aliasHit.domain ?? aliasHit.alias,
        similarity: 1,
        matchStrategy: "exact_alias",
      },
    };
  }

  const fuzzy = await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.normalizedDomain,
      similarity: sql<number>`greatest(
        similarity(lower(${companies.normalizedName}), ${normalizedName}),
        similarity(replace(lower(${companies.normalizedName}), ' ', ''), ${compactName}),
        coalesce(similarity(lower(coalesce(${companies.normalizedDomain}, '')), ${normalizedName}), 0)
      )`,
    })
    .from(companies)
    .where(ownedCompanyFilter)
    .orderBy(
      sql`greatest(
        similarity(lower(${companies.normalizedName}), ${normalizedName}),
        similarity(replace(lower(${companies.normalizedName}), ' ', ''), ${compactName}),
        coalesce(similarity(lower(coalesce(${companies.normalizedDomain}, '')), ${normalizedName}), 0)
      ) desc`,
    )
    .limit(5);

  const candidates: CompanyCandidate[] = fuzzy
    .map((row) => ({
      id: row.id,
      label: row.name,
      description: row.domain ?? undefined,
      similarity: Number(row.similarity) || 0,
      matchStrategy: "fuzzy" as const,
    }))
    .filter((row) => row.similarity >= CLARIFY_SIMILARITY);

  if (candidates.length === 0) {
    return { status: "unresolved", query };
  }

  const top = candidates[0];
  const second = candidates[1];
  if (
    top &&
    top.similarity >= AUTO_RESOLVE_SIMILARITY &&
    (!second || top.similarity - second.similarity >= AUTO_RESOLVE_LEAD)
  ) {
    return { status: "resolved", company: top };
  }

  return { status: "ambiguous", candidates: candidates.slice(0, 5) };
}
