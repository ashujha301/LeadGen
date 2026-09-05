import { REASON_CODES, type ReasonCode } from "./reason-codes";
import { SCORE_COMPONENT_KEYS, SCORE_COMPONENT_LABELS, getScoreComponentMax } from "./score-config";
import type { ScoreComponentResult } from "./acquisition-score";

export type EvidenceInput = {
  sourceUrl: string;
  confidence: number;
  freshness: number;
};

export type EvidenceQualityInput = {
  evidence: EvidenceInput[];
};

/**
 * Evidence quality scoring (max 10) from source count, confidence, and freshness.
 */
export function scoreEvidenceQuality(
  input: EvidenceQualityInput,
  scoreVersion = 1,
): ScoreComponentResult {
  const max = getScoreComponentMax(SCORE_COMPONENT_KEYS.evidenceQuality, scoreVersion);

  if (input.evidence.length === 0) {
    return component(max, 0, REASON_CODES.evidence.lowConfidence, scoreVersion);
  }

  const sourceCount = new Set(input.evidence.map((item) => item.sourceUrl)).size;
  const avgEffective =
    input.evidence.reduce(
      (sum, item) => sum + clamp(item.confidence, 0, 1) * clamp(item.freshness, 0, 1),
      0,
    ) / input.evidence.length;

  let rawValue = avgEffective * max * 0.7;
  let reasonCode: ReasonCode = REASON_CODES.evidence.singleSource;

  if (sourceCount >= 2) {
    rawValue = Math.min(max, rawValue + max * 0.25);
    reasonCode = REASON_CODES.evidence.multiSource;
  }

  if (avgEffective >= 0.8) {
    reasonCode = REASON_CODES.evidence.highConfidence;
  } else if (avgEffective < 0.4) {
    reasonCode = REASON_CODES.evidence.lowConfidence;
  }

  const minFreshness = Math.min(...input.evidence.map((item) => clamp(item.freshness, 0, 1)));
  if (minFreshness < 0.35) {
    rawValue = Math.max(0, rawValue - max * 0.2);
    reasonCode = REASON_CODES.evidence.stale;
  }

  return component(max, rawValue, reasonCode, scoreVersion);
}

function component(
  max: number,
  rawValue: number,
  reasonCode: ReasonCode,
  scoreVersion = 1,
): ScoreComponentResult {
  return {
    key: SCORE_COMPONENT_KEYS.evidenceQuality,
    weight: getScoreComponentMax(SCORE_COMPONENT_KEYS.evidenceQuality, scoreVersion),
    rawValue: round(rawValue / max, 4),
    contribution: round(rawValue),
    reasonCode,
    label: SCORE_COMPONENT_LABELS[SCORE_COMPONENT_KEYS.evidenceQuality],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
