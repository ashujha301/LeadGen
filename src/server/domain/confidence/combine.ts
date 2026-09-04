import { CONFIDENCE_CAP } from "@/shared/config";

export type ConfidenceSource = {
  sourceConfidence: number;
  freshness: number;
};

/**
 * Combine independent evidence:
 * combined = 1 - product(1 - sourceConfidence * freshness), capped at CONFIDENCE_CAP.
 */
export function combineConfidence(sources: ConfidenceSource[]): number {
  if (sources.length === 0) {
    return 0;
  }

  let product = 1;

  for (const source of sources) {
    const effective = clamp(source.sourceConfidence, 0, 1) * clamp(source.freshness, 0, 1);
    product *= 1 - effective;
  }

  const combined = 1 - product;
  return Math.min(CONFIDENCE_CAP, round(combined));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export { CONFIDENCE_CAP };
