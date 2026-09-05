import { HIGH_VALUE_LEAD_THRESHOLDS } from "@/shared/config";

export function passesHighValueScoreGates(input: {
  scoreVersion: number;
  finalScore: number;
  confidence: number;
  isStale: boolean;
}): boolean {
  return (
    input.scoreVersion === HIGH_VALUE_LEAD_THRESHOLDS.scoreVersion &&
    input.finalScore >= HIGH_VALUE_LEAD_THRESHOLDS.minScore &&
    input.confidence >= HIGH_VALUE_LEAD_THRESHOLDS.minConfidence &&
    !input.isStale
  );
}
