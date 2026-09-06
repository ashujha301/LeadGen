export type EmploymentIntervalInput = {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  asOfDate?: string;
};

export type HalfOpenInterval = {
  startInclusive: string;
  endExclusive: string;
};

const MS_PER_DAY = 86_400_000;

function parseUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function toHalfOpenInterval(input: EmploymentIntervalInput): HalfOpenInterval | null {
  if (!input.startDate) {
    return null;
  }

  if (!input.endDate) {
    if (!input.isCurrent) {
      return null;
    }
    const asOf = input.asOfDate ?? formatUtcDate(new Date());
    return {
      startInclusive: input.startDate,
      endExclusive: asOf,
    };
  }

  // Treat stored end_date as exclusive so adjacent promotions [start, end) / [end, next)
  // do not create a false one-day overlap.
  return {
    startInclusive: input.startDate,
    endExclusive: input.endDate,
  };
}

export function halfOpenOverlapDays(
  a: HalfOpenInterval,
  b: HalfOpenInterval,
): number {
  const start = a.startInclusive > b.startInclusive ? a.startInclusive : b.startInclusive;
  const end = a.endExclusive < b.endExclusive ? a.endExclusive : b.endExclusive;
  if (compareDates(start, end) >= 0) {
    return 0;
  }
  return Math.floor((parseUtcDate(end).getTime() - parseUtcDate(start).getTime()) / MS_PER_DAY);
}

export function mergeHalfOpenIntervals(intervals: HalfOpenInterval[]): HalfOpenInterval[] {
  const sorted = [...intervals].sort((left, right) =>
    compareDates(left.startInclusive, right.startInclusive),
  );
  if (sorted.length === 0) {
    return [];
  }

  const merged: HalfOpenInterval[] = [];
  let current = { ...sorted[0]! };

  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]!;
    if (compareDates(next.startInclusive, current.endExclusive) <= 0) {
      if (compareDates(next.endExclusive, current.endExclusive) > 0) {
        current.endExclusive = next.endExclusive;
      }
      continue;
    }
    merged.push(current);
    current = { ...next };
  }
  merged.push(current);
  return merged;
}

export function mergePersonEmployerIntervals(
  inputs: EmploymentIntervalInput[],
): HalfOpenInterval[] {
  return mergeHalfOpenIntervals(
    inputs
      .map((input) => toHalfOpenInterval(input))
      .filter((interval): interval is HalfOpenInterval => interval != null),
  );
}

export function intersectIntervalSets(
  left: HalfOpenInterval[],
  right: HalfOpenInterval[],
): HalfOpenInterval[] {
  const intersections: HalfOpenInterval[] = [];
  for (const a of left) {
    for (const b of right) {
      const start = a.startInclusive > b.startInclusive ? a.startInclusive : b.startInclusive;
      const end = a.endExclusive < b.endExclusive ? a.endExclusive : b.endExclusive;
      if (compareDates(start, end) < 0) {
        intersections.push({ startInclusive: start, endExclusive: end });
      }
    }
  }
  return mergeHalfOpenIntervals(intersections);
}

export function totalIntersectedOverlapDays(
  left: HalfOpenInterval[],
  right: HalfOpenInterval[],
): number {
  return intersectIntervalSets(left, right).reduce(
    (total, interval) =>
      total +
      Math.floor(
        (parseUtcDate(interval.endExclusive).getTime() -
          parseUtcDate(interval.startInclusive).getTime()) /
          MS_PER_DAY,
      ),
    0,
  );
}
