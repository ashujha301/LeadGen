import { employmentRangesOverlap, type DateRange } from "@/server/domain/timeline/overlap";

export type ExperienceInterval = DateRange & {
  isLeadership?: boolean;
  isRelevantRole?: boolean;
};

const MS_PER_MONTH = (1000 * 60 * 60 * 24 * 365.25) / 12;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mergeIntervals(
  intervals: Array<{ start: Date; end: Date }>,
): Array<{ start: Date; end: Date }> {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Array<{ start: Date; end: Date }> = [sorted[0]!];

  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (interval.start.getTime() <= last.end.getTime() + MS_PER_MONTH) {
      if (interval.end.getTime() > last.end.getTime()) {
        last.end = interval.end;
      }
    } else {
      merged.push({ ...interval });
    }
  }

  return merged;
}

function monthsBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.round(diffMs / MS_PER_MONTH);
}

export type ExperienceCalculationResult = {
  calculatedTotalMonths: number;
  leadershipExperienceMonths: number;
  relevantRoleExperienceMonths: number;
  totalExperienceYears: number;
  leadershipExperienceYears: number;
};

/**
 * Union overlapping employment intervals so concurrent roles are not double-counted.
 * Unknown dates are excluded from exact month calculations.
 */
export function calculateExperienceMetrics(
  intervals: ExperienceInterval[],
): ExperienceCalculationResult {
  const totalIntervals: Array<{ start: Date; end: Date }> = [];
  const leadershipIntervals: Array<{ start: Date; end: Date }> = [];
  const relevantIntervals: Array<{ start: Date; end: Date }> = [];

  for (const interval of intervals) {
    const start = parseDate(interval.startDate?.toString() ?? null);
    const end = parseDate(interval.endDate?.toString() ?? null);
    if (!start || !end) {
      continue;
    }

    const range = { start, end };
    totalIntervals.push(range);
    if (interval.isLeadership) {
      leadershipIntervals.push(range);
    }
    if (interval.isRelevantRole) {
      relevantIntervals.push(range);
    }
  }

  const sumMonths = (ranges: Array<{ start: Date; end: Date }>): number =>
    mergeIntervals(ranges).reduce((sum, range) => sum + monthsBetween(range.start, range.end), 0);

  const calculatedTotalMonths = sumMonths(totalIntervals);
  const leadershipExperienceMonths = sumMonths(leadershipIntervals);
  const relevantRoleExperienceMonths = sumMonths(relevantIntervals);

  return {
    calculatedTotalMonths,
    leadershipExperienceMonths,
    relevantRoleExperienceMonths,
    totalExperienceYears: calculatedTotalMonths / 12,
    leadershipExperienceYears: leadershipExperienceMonths / 12,
  };
}

export function intervalsOverlap(a: ExperienceInterval, b: ExperienceInterval): boolean {
  return employmentRangesOverlap(
    {
      startDate: parseDate(a.startDate?.toString() ?? null),
      endDate: parseDate(a.endDate?.toString() ?? null),
    },
    {
      startDate: parseDate(b.startDate?.toString() ?? null),
      endDate: parseDate(b.endDate?.toString() ?? null),
    },
  );
}
