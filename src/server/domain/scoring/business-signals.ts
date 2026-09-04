import { REASON_CODES, type ReasonCode } from "./reason-codes";
import {
  SCORE_COMPONENT_KEYS,
  SCORE_COMPONENT_LABELS,
  getScoreComponentMax,
} from "./score-config";
import type { ScoreComponentResult } from "./acquisition-score";

export type BusinessSignalInput = {
  type: string;
  value?: string;
  confidence?: number;
  observedAt?: Date;
};

export type BusinessSignalsScoreInput = {
  signals: BusinessSignalInput[];
  referenceDate?: Date;
};

const SIGNAL_WEIGHTS: Record<string, number> = {
  funding: 1,
  hiring: 0.75,
  expansion: 0.7,
  product_launch: 0.65,
  leadership_change: 0.6,
};

const SIGNAL_REASON: Record<string, ReasonCode> = {
  funding: REASON_CODES.signals.funding,
  hiring: REASON_CODES.signals.hiring,
  expansion: REASON_CODES.signals.expansion,
  product_launch: REASON_CODES.signals.productLaunch,
  leadership_change: REASON_CODES.signals.leadershipChange,
};

/**
 * Business and timing signal scoring (max 20).
 */
export function scoreBusinessSignals(
  input: BusinessSignalsScoreInput,
  scoreVersion = 1,
): ScoreComponentResult {
  const max = getScoreComponentMax(SCORE_COMPONENT_KEYS.businessSignals, scoreVersion);

  if (input.signals.length === 0) {
    return component(max, 0, REASON_CODES.signals.none, scoreVersion);
  }

  let bestWeight = 0;
  let bestReason: ReasonCode = REASON_CODES.signals.none;

  for (const signal of input.signals) {
    const typeKey = signal.type.trim().toLowerCase().replace(/\s+/g, "_");
    const baseWeight = SIGNAL_WEIGHTS[typeKey] ?? 0.4;
    const confidence = clamp(signal.confidence ?? 0.7, 0, 1);
    const weighted = baseWeight * confidence;

    if (weighted > bestWeight) {
      bestWeight = weighted;
      bestReason = SIGNAL_REASON[typeKey] ?? REASON_CODES.signals.expansion;
    }
  }

  const rawValue = bestWeight * max;

  return component(max, rawValue, bestReason, scoreVersion);
}

function component(
  max: number,
  rawValue: number,
  reasonCode: ReasonCode,
  scoreVersion = 1,
): ScoreComponentResult {
  return {
    key: SCORE_COMPONENT_KEYS.businessSignals,
    weight: getScoreComponentMax(SCORE_COMPONENT_KEYS.businessSignals, scoreVersion),
    rawValue: round(rawValue / max, 4),
    contribution: round(rawValue),
    reasonCode,
    label: SCORE_COMPONENT_LABELS[SCORE_COMPONENT_KEYS.businessSignals],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
