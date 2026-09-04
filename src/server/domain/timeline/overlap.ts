export type DateRange = {
  startDate: Date | null;
  endDate: Date | null;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Detect whether two employment date ranges overlap.
 * Missing start dates are treated as unbounded past; missing end dates as unbounded future.
 */
export function employmentRangesOverlap(a: DateRange, b: DateRange): boolean {
  const aStart = a.startDate ?? new Date(-8640000000000000);
  const aEnd = a.endDate ?? new Date(8640000000000000);
  const bStart = b.startDate ?? new Date(-8640000000000000);
  const bEnd = b.endDate ?? new Date(8640000000000000);

  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Overlap length in whole days, or null when ranges do not overlap.
 */
export function employmentOverlapDays(a: DateRange, b: DateRange): number | null {
  if (!employmentRangesOverlap(a, b)) {
    return null;
  }

  const aStart = a.startDate ?? new Date(-8640000000000000);
  const aEnd = a.endDate ?? new Date(8640000000000000);
  const bStart = b.startDate ?? new Date(-8640000000000000);
  const bEnd = b.endDate ?? new Date(8640000000000000);

  const overlapStart = aStart > bStart ? aStart : bStart;
  const overlapEnd = aEnd < bEnd ? aEnd : bEnd;
  const diffMs = overlapEnd.getTime() - overlapStart.getTime();

  return diffMs < 0 ? 0 : Math.floor(diffMs / MS_PER_DAY) + 1;
}
