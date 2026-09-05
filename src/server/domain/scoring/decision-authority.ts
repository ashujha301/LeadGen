import { TARGET_ROLES } from "@/shared/config";
import { REASON_CODES, type ReasonCode } from "./reason-codes";
import { SCORE_COMPONENT_KEYS, SCORE_COMPONENT_LABELS, getScoreComponentMax } from "./score-config";
import type { ScoreComponentResult } from "./acquisition-score";

export type DecisionAuthorityInput = {
  title?: string | null;
  normalizedTitle?: string | null;
  isFounder?: boolean;
  isOwner?: boolean;
};

const C_SUITE_PATTERN = /\b(chief|ceo|cfo|cto|coo|cmo|cpo|cro|president)\b/i;
const VP_PATTERN = /\b(vp|vice president|director|head of)\b/i;
const MANAGER_PATTERN = /\b(manager|lead|supervisor)\b/i;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function matchesTargetRole(title: string): boolean {
  const normalized = normalizeTitle(title);
  return TARGET_ROLES.some((role) => normalized.includes(role));
}

/**
 * Decision authority scoring (max 25) based on role seniority and ownership signals.
 */
export function scoreDecisionAuthority(
  input: DecisionAuthorityInput,
  scoreVersion = 1,
): ScoreComponentResult {
  const max = getScoreComponentMax(SCORE_COMPONENT_KEYS.decisionAuthority, scoreVersion);
  let rawValue = 0;
  let reasonCode: ReasonCode = REASON_CODES.authority.unknownRole;

  const title = input.normalizedTitle ?? input.title ?? "";

  if (input.isFounder || input.isOwner || /\b(founder|owner|co-founder|cofounder)\b/i.test(title)) {
    rawValue = max;
    reasonCode = REASON_CODES.authority.founderOwner;
  } else if (C_SUITE_PATTERN.test(title) || matchesTargetRole(title)) {
    rawValue = max * 0.85;
    reasonCode = REASON_CODES.authority.cSuite;
  } else if (VP_PATTERN.test(title)) {
    rawValue = max * 0.65;
    reasonCode = REASON_CODES.authority.vpDirector;
  } else if (MANAGER_PATTERN.test(title)) {
    rawValue = max * 0.35;
    reasonCode = REASON_CODES.authority.manager;
  } else if (title) {
    rawValue = max * 0.15;
    reasonCode = REASON_CODES.authority.individualContributor;
  }

  return {
    key: SCORE_COMPONENT_KEYS.decisionAuthority,
    weight: getScoreComponentMax(SCORE_COMPONENT_KEYS.decisionAuthority, scoreVersion),
    rawValue: round(rawValue / max, 4),
    contribution: round(rawValue),
    reasonCode,
    label: SCORE_COMPONENT_LABELS[SCORE_COMPONENT_KEYS.decisionAuthority],
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
