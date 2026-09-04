import type { RoleCriteria } from "@/shared/contracts/roles";
import { matchTitleAgainstRoleCriteria } from "@/server/domain/roles/matching";
import { REASON_CODES, type ReasonCode } from "./reason-codes";
import {
  SCORE_COMPONENT_KEYS,
  SCORE_COMPONENT_LABELS,
  getScoreComponentMax,
} from "./score-config";
import type { ScoreComponentResult } from "./acquisition-score";

export type TargetRoleFitInput = {
  title?: string | null;
  roleCriteria?: RoleCriteria | null;
};

function isEmptyCriteria(criteria: RoleCriteria): boolean {
  return (
    criteria.seniorities.length === 0 &&
    criteria.functions.length === 0 &&
    criteria.customTitles.length === 0
  );
}

/**
 * Target role fit scoring (max 10): alignment between a person's title and run role criteria.
 */
export function scoreTargetRoleFit(input: TargetRoleFitInput, scoreVersion = 1): ScoreComponentResult {
  const max = getScoreComponentMax(SCORE_COMPONENT_KEYS.targetRoleFit, scoreVersion);
  let rawValue = 0;
  let reasonCode: ReasonCode = REASON_CODES.role.noMatch;

  const criteria = input.roleCriteria;
  if (!criteria || isEmptyCriteria(criteria)) {
    rawValue = max * 0.5;
    reasonCode = REASON_CODES.role.noCriteria;
  } else {
    const match = matchTitleAgainstRoleCriteria(input.title, criteria);
    if (match.roleMatch) {
      rawValue = max;
      reasonCode = match.roleMatchReasons.some((reason) => reason.startsWith("custom:"))
        ? REASON_CODES.role.customTitleMatch
        : REASON_CODES.role.fullMatch;
    }
  }

  return {
    key: SCORE_COMPONENT_KEYS.targetRoleFit,
    weight: getScoreComponentMax(SCORE_COMPONENT_KEYS.targetRoleFit, scoreVersion),
    rawValue: round(rawValue / max, 4),
    contribution: round(rawValue),
    reasonCode,
    label: SCORE_COMPONENT_LABELS[SCORE_COMPONENT_KEYS.targetRoleFit],
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
