import { SCORE_COMPONENT_KEYS, SCORE_COMPONENT_MAX_V2 } from "./score-config";
import { REASON_CODES } from "./reason-codes";
import type { ScoreComponentResult } from "./acquisition-score";
import type { ReasonCode } from "./reason-codes";

export type ExperienceScoreInput = {
  totalExperienceYears: number | null;
  leadershipExperienceYears: number | null;
  experienceConfidence: number;
};

export function scoreExperience(input: ExperienceScoreInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_V2[SCORE_COMPONENT_KEYS.experience];
  const totalYears = input.totalExperienceYears ?? 0;
  const leadershipYears = input.leadershipExperienceYears ?? 0;

  const totalComponent = Math.min(totalYears / 10, 1);
  const leadershipComponent = Math.min(leadershipYears / 5, 1);
  const rawValue = 0.6 * totalComponent + 0.4 * leadershipComponent;
  const contribution = round(rawValue * max * clamp(input.experienceConfidence, 0, 1));

  let reasonCode: ReasonCode = REASON_CODES.experience.moderate;
  if (rawValue >= 0.85) {
    reasonCode = REASON_CODES.experience.strong;
  } else if (rawValue <= 0.2) {
    reasonCode = REASON_CODES.experience.limited;
  }

  return {
    key: SCORE_COMPONENT_KEYS.experience,
    weight: max,
    rawValue: round(rawValue),
    contribution,
    reasonCode,
    label: "Experience",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
