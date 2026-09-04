import { employmentOverlapDays, employmentRangesOverlap, type DateRange } from "./overlap";

export type EmploymentRecord = {
  companyId: string;
  companyName?: string;
  title?: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent?: boolean;
};

export type EmploymentOverlap = {
  companyId: string;
  companyName?: string;
  personA: EmploymentRecord;
  personB: EmploymentRecord;
  overlapDays: number | null;
};

/**
 * Find overlapping employments at the same company between two people.
 */
export function findSharedEmploymentOverlaps(
  employmentsA: EmploymentRecord[],
  employmentsB: EmploymentRecord[],
): EmploymentOverlap[] {
  const overlaps: EmploymentOverlap[] = [];

  for (const employmentA of employmentsA) {
    for (const employmentB of employmentsB) {
      if (employmentA.companyId !== employmentB.companyId) {
        continue;
      }

      const rangeA: DateRange = {
        startDate: employmentA.startDate,
        endDate: employmentA.isCurrent ? null : employmentA.endDate,
      };
      const rangeB: DateRange = {
        startDate: employmentB.startDate,
        endDate: employmentB.isCurrent ? null : employmentB.endDate,
      };

      if (!employmentRangesOverlap(rangeA, rangeB)) {
        continue;
      }

      overlaps.push({
        companyId: employmentA.companyId,
        companyName: employmentA.companyName ?? employmentB.companyName,
        personA: employmentA,
        personB: employmentB,
        overlapDays: employmentOverlapDays(rangeA, rangeB),
      });
    }
  }

  return overlaps;
}

/**
 * Build a chronological employment history for one person.
 */
export function buildEmploymentHistory(employments: EmploymentRecord[]): EmploymentRecord[] {
  return [...employments].sort((left, right) => {
    const leftStart = left.startDate?.getTime() ?? Number.NEGATIVE_INFINITY;
    const rightStart = right.startDate?.getTime() ?? Number.NEGATIVE_INFINITY;

    if (leftStart !== rightStart) {
      return rightStart - leftStart;
    }

    const leftEnd = left.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightEnd = right.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
    return rightEnd - leftEnd;
  });
}
