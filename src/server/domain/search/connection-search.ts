import type { OverlapResult } from "@/shared/contracts";
import type { Db } from "@/server/infrastructure/db";
import { companies, employments, people } from "@/server/infrastructure/db";
import { employmentOverlapDays } from "@/server/domain";
import { and, eq } from "drizzle-orm";

export type OverlapSearchInput = {
  companyId: string;
  personId?: string;
  minOverlapDays?: number;
  /** When set, only these people participate in overlap results (user-scoped). */
  ownedPersonIds?: string[];
};

type EmploymentRow = {
  id: string;
  personId: string;
  personName: string;
  startDate: string | null;
  endDate: string | null;
};

export function filterRowsToOwnedPersonIds<T extends { personId: string }>(
  rows: T[],
  ownedPersonIds: string[] | undefined,
): T[] {
  if (ownedPersonIds === undefined) {
    return rows;
  }
  const allowed = new Set(ownedPersonIds);
  return rows.filter((row) => allowed.has(row.personId));
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function formatDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function findEmploymentOverlaps(
  db: Db,
  input: OverlapSearchInput,
): Promise<OverlapResult[]> {
  const minOverlapDays = input.minOverlapDays ?? 30;

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, input.companyId),
  });

  if (!company) {
    return [];
  }

  const employmentRows = await db
    .select({
      id: employments.id,
      personId: employments.personId,
      personName: people.name,
      startDate: employments.startDate,
      endDate: employments.endDate,
    })
    .from(employments)
    .innerJoin(people, eq(people.id, employments.personId))
    .where(eq(employments.companyId, input.companyId));

  const scopedRows = filterRowsToOwnedPersonIds(employmentRows, input.ownedPersonIds);

  const filteredRows = input.personId
    ? scopedRows.filter((row) => row.personId === input.personId)
    : scopedRows;

  const grouped = new Map<string, EmploymentRow[]>();

  for (const row of filteredRows) {
    const existing = grouped.get(row.personId) ?? [];
    existing.push(row);
    grouped.set(row.personId, existing);
  }

  const personIds = [...grouped.keys()];
  const results: OverlapResult[] = [];

  for (let i = 0; i < personIds.length; i += 1) {
    for (let j = i + 1; j < personIds.length; j += 1) {
      const personAId = personIds[i];
      const personBId = personIds[j];
      if (!personAId || !personBId) {
        continue;
      }

      const personARecords = grouped.get(personAId) ?? [];
      const personBRecords = grouped.get(personBId) ?? [];

      let bestOverlap: OverlapResult | null = null;

      for (const recordA of personARecords) {
        for (const recordB of personBRecords) {
          const overlapDays = employmentOverlapDays(
            {
              startDate: toDate(recordA.startDate),
              endDate: toDate(recordA.endDate),
            },
            {
              startDate: toDate(recordB.startDate),
              endDate: toDate(recordB.endDate),
            },
          );

          if (overlapDays === null || overlapDays < minOverlapDays) {
            continue;
          }

          const overlapStart = formatDate(
            toDate(recordA.startDate) && toDate(recordB.startDate)
              ? toDate(recordA.startDate)! > toDate(recordB.startDate)!
                ? toDate(recordA.startDate)
                : toDate(recordB.startDate)
              : toDate(recordA.startDate) ?? toDate(recordB.startDate),
          );

          const overlapEnd = formatDate(
            toDate(recordA.endDate) && toDate(recordB.endDate)
              ? toDate(recordA.endDate)! < toDate(recordB.endDate)!
                ? toDate(recordA.endDate)
                : toDate(recordB.endDate)
              : toDate(recordA.endDate) ?? toDate(recordB.endDate),
          );

          const candidate: OverlapResult = {
            personA: { id: personAId, name: recordA.personName },
            personB: { id: personBId, name: recordB.personName },
            company: { id: company.id, name: company.name },
            overlapStart,
            overlapEnd,
            overlapDays,
          };

          if (!bestOverlap || candidate.overlapDays > bestOverlap.overlapDays) {
            bestOverlap = candidate;
          }
        }
      }

      if (bestOverlap) {
        results.push(bestOverlap);
      }
    }
  }

  return results.sort((a, b) => b.overlapDays - a.overlapDays);
}

export async function findSharedEmployerConnections(
  db: Db,
  personId: string,
  minOverlapDays = 30,
): Promise<OverlapResult[]> {
  const personEmployments = await db.query.employments.findMany({
    where: eq(employments.personId, personId),
  });

  const overlaps: OverlapResult[] = [];

  for (const employment of personEmployments) {
    if (!employment.companyId) {
      continue;
    }
    const companyOverlaps = await findEmploymentOverlaps(db, {
      companyId: employment.companyId,
      personId,
      minOverlapDays,
    });
    overlaps.push(...companyOverlaps);
  }

  const deduped = new Map<string, OverlapResult>();

  for (const overlap of overlaps) {
    const key = [overlap.personA.id, overlap.personB.id, overlap.company.id].sort().join(":");
    const existing = deduped.get(key);
    if (!existing || overlap.overlapDays > existing.overlapDays) {
      deduped.set(key, overlap);
    }
  }

  return [...deduped.values()].sort((a, b) => b.overlapDays - a.overlapDays);
}

export async function findPreviousColleaguesAtCompany(
  db: Db,
  companyId: string,
): Promise<Array<{ personId: string; personName: string; title: string | null; endDate: string | null }>> {
  const rows = await db
    .select({
      personId: people.id,
      personName: people.name,
      title: employments.normalizedTitle,
      endDate: employments.endDate,
    })
    .from(employments)
    .innerJoin(people, eq(people.id, employments.personId))
    .where(and(eq(employments.companyId, companyId), eq(employments.isCurrent, false)));

  return rows;
}
