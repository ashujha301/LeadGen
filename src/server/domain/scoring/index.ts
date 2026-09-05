import {
  scoreCompanyIcpFit,
  type IcpFitInput,
  type ScoreComponentResult,
} from "./acquisition-score";
import { scoreBusinessSignals, type BusinessSignalsScoreInput } from "./business-signals";
import { scoreContactability, type ContactabilityInput } from "./contactability";
import { scoreDecisionAuthority, type DecisionAuthorityInput } from "./decision-authority";
import { scoreEvidenceQuality, type EvidenceQualityInput } from "./evidence-quality";
import { scoreExperience, type ExperienceScoreInput } from "./experience-score";
import { scoreTargetRoleFit, type TargetRoleFitInput } from "./target-role-fit";
import { getTotalScoreMax } from "./score-config";

export type LeadScoreInput = {
  icp: IcpFitInput;
  role?: TargetRoleFitInput;
  authority: DecisionAuthorityInput;
  signals: BusinessSignalsScoreInput;
  contactability: ContactabilityInput;
  evidence: EvidenceQualityInput;
  experience?: ExperienceScoreInput;
  scoreVersion?: number;
};

export type LeadScoreResult = {
  total: number;
  components: ScoreComponentResult[];
  keyReason: string;
};

/**
 * Deterministic lead score totaling up to 100 with component breakdown.
 */
export function scoreLead(input: LeadScoreInput): LeadScoreResult {
  const scoreVersion = input.scoreVersion ?? 1;
  const components = [
    scoreCompanyIcpFit(input.icp, scoreVersion),
    scoreTargetRoleFit(input.role ?? {}, scoreVersion),
    scoreDecisionAuthority(input.authority, scoreVersion),
    ...(scoreVersion >= 2
      ? [
          scoreExperience(
            input.experience ?? {
              totalExperienceYears: null,
              leadershipExperienceYears: null,
              experienceConfidence: 0,
            },
          ),
        ]
      : []),
    scoreBusinessSignals(input.signals, scoreVersion),
    scoreContactability(input.contactability, scoreVersion),
    scoreEvidenceQuality(input.evidence, scoreVersion),
  ];

  const totalMax = getTotalScoreMax(scoreVersion);
  const total = round(components.reduce((sum, component) => sum + component.contribution, 0));
  const keyReason = pickKeyReason(components);

  return { total: Math.min(totalMax, total), components, keyReason };
}

function pickKeyReason(components: ScoreComponentResult[]): string {
  const sorted = [...components].sort((a, b) => b.contribution - a.contribution);
  return sorted[0]?.reasonCode ?? "SCORE_COMPUTED";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export { scoreCompanyIcpFit, scoreIcpFit } from "./acquisition-score";
export type { IcpFitInput, ScoreComponentResult } from "./acquisition-score";
export { scoreTargetRoleFit, type TargetRoleFitInput } from "./target-role-fit";
export { scoreDecisionAuthority, type DecisionAuthorityInput } from "./decision-authority";
export {
  scoreBusinessSignals,
  type BusinessSignalInput,
  type BusinessSignalsScoreInput,
} from "./business-signals";
export {
  scoreContactability,
  type ContactPointInput,
  type ContactabilityInput,
} from "./contactability";
export {
  scoreEvidenceQuality,
  type EvidenceInput,
  type EvidenceQualityInput,
} from "./evidence-quality";
export { REASON_CODES, type ReasonCode } from "./reason-codes";
export {
  SCORE_COMPONENT_KEYS,
  SCORE_COMPONENT_LABELS,
  SCORE_COMPONENT_MAX,
  TOTAL_SCORE_MAX,
  TOTAL_SCORE_MAX_V2,
  type ScoreComponentKey,
} from "./score-config";
