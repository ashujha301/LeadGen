import { and, sql } from "drizzle-orm";

import type { Db } from "@/server/infrastructure/db";
import { leadCandidates, people } from "@/server/infrastructure/db/schema";

export type PersonCandidate = {
  id: string;
  label: string;
  description?: string;
  similarity: number;
  matchStrategy: "exact_name" | "fuzzy";
};

export type PersonResolution =
  | { status: "resolved"; person: PersonCandidate }
  | { status: "ambiguous"; candidates: PersonCandidate[] }
  | { status: "unresolved"; query: string };

const AUTO_RESOLVE_SIMILARITY = 0.9;
const AUTO_RESOLVE_LEAD = 0.1;
const CLARIFY_SIMILARITY = 0.55;

/**
 * Resolve a person name to a user-visible canonical person (non-merged).
 */
export async function resolvePersonConstraint(
  db: Db,
  raw: string,
  userId: string,
): Promise<PersonResolution> {
  const query = raw.trim();
  if (!query) return { status: "unresolved", query: raw };

  const normalized = query.toLowerCase();

  const ownedPersonFilter = sql`exists (
    select 1 from ${leadCandidates} lc
    inner join search_runs sr on sr.id = lc.run_id
    where lc.person_id = ${people.id}
      and sr.user_id = ${userId}
  )`;

  const exact = await db
    .select({
      id: people.id,
      name: people.name,
      normalizedName: people.normalizedName,
    })
    .from(people)
    .where(
      and(
        ownedPersonFilter,
        sql`${people.mergedIntoPersonId} is null`,
        sql`lower(${people.normalizedName}) = ${normalized}
            or lower(${people.name}) = ${normalized}`,
      ),
    )
    .limit(5);

  const exactHit = exact[0];
  if (exact.length === 1 && exactHit) {
    return {
      status: "resolved",
      person: {
        id: exactHit.id,
        label: exactHit.name,
        similarity: 1,
        matchStrategy: "exact_name",
      },
    };
  }
  if (exact.length > 1) {
    return {
      status: "ambiguous",
      candidates: exact.map((row) => ({
        id: row.id,
        label: row.name,
        similarity: 1,
        matchStrategy: "exact_name" as const,
      })),
    };
  }

  const fuzzy = await db
    .select({
      id: people.id,
      name: people.name,
      similarity: sql<number>`similarity(lower(${people.normalizedName}), ${normalized})`,
    })
    .from(people)
    .where(and(ownedPersonFilter, sql`${people.mergedIntoPersonId} is null`))
    .orderBy(sql`similarity(lower(${people.normalizedName}), ${normalized}) desc`)
    .limit(5);

  const candidates: PersonCandidate[] = fuzzy
    .map((row) => ({
      id: row.id,
      label: row.name,
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
    return { status: "resolved", person: top };
  }

  return { status: "ambiguous", candidates: candidates.slice(0, 5) };
}
