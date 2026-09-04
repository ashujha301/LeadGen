import { FRESHNESS_HALF_LIFE_DAYS } from "@/shared/config";

export type FreshnessCategory = keyof typeof FRESHNESS_HALF_LIFE_DAYS;

/**
 * Exponential half-life decay: 2^(-ageDays / halfLifeDays).
 */
export function calculateFreshness(ageDays: number, category: FreshnessCategory): number {
  if (ageDays < 0) {
    return 1;
  }

  const halfLifeDays = FRESHNESS_HALF_LIFE_DAYS[category];
  const freshness = 2 ** (-ageDays / halfLifeDays);
  return clamp(freshness, 0, 1);
}

/**
 * Age in whole days between observedAt and referenceDate (defaults to now).
 */
export function ageInDays(observedAt: Date, referenceDate: Date = new Date()): number {
  const diffMs = referenceDate.getTime() - observedAt.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export { FRESHNESS_HALF_LIFE_DAYS };
