import { SCORE_MAX_V2 } from "@/shared/config";

export const SCORE_COMPONENT_KEYS = {
  companyIcpFit: "company_icp_fit",
  targetRoleFit: "target_role_fit",
  /** @deprecated Use companyIcpFit and targetRoleFit. */
  icpFit: "icp_fit",
  decisionAuthority: "decision_authority",
  experience: "experience",
  businessSignals: "business_signals",
  contactability: "contactability",
  evidenceQuality: "evidence_quality",
} as const;

export type ScoreComponentKey = (typeof SCORE_COMPONENT_KEYS)[keyof typeof SCORE_COMPONENT_KEYS];

export const SCORE_COMPONENT_LABELS: Record<
  Exclude<ScoreComponentKey, typeof SCORE_COMPONENT_KEYS.icpFit>,
  string
> = {
  [SCORE_COMPONENT_KEYS.companyIcpFit]: "Company ICP Fit",
  [SCORE_COMPONENT_KEYS.targetRoleFit]: "Target Role Fit",
  [SCORE_COMPONENT_KEYS.decisionAuthority]: "Decision Authority",
  [SCORE_COMPONENT_KEYS.experience]: "Experience",
  [SCORE_COMPONENT_KEYS.businessSignals]: "Business Signals",
  [SCORE_COMPONENT_KEYS.contactability]: "Contactability",
  [SCORE_COMPONENT_KEYS.evidenceQuality]: "Evidence Quality",
};

export const SCORE_COMPONENT_MAX_V1 = {
  [SCORE_COMPONENT_KEYS.companyIcpFit]: 20,
  [SCORE_COMPONENT_KEYS.targetRoleFit]: 10,
  [SCORE_COMPONENT_KEYS.decisionAuthority]: 25,
  [SCORE_COMPONENT_KEYS.businessSignals]: 20,
  [SCORE_COMPONENT_KEYS.contactability]: 15,
  [SCORE_COMPONENT_KEYS.evidenceQuality]: 10,
} as const;

export const SCORE_COMPONENT_MAX_V2 = {
  [SCORE_COMPONENT_KEYS.companyIcpFit]: SCORE_MAX_V2.companyIcpFit,
  [SCORE_COMPONENT_KEYS.targetRoleFit]: SCORE_MAX_V2.targetRoleFit,
  [SCORE_COMPONENT_KEYS.decisionAuthority]: SCORE_MAX_V2.decisionAuthority,
  [SCORE_COMPONENT_KEYS.experience]: SCORE_MAX_V2.experience,
  [SCORE_COMPONENT_KEYS.businessSignals]: SCORE_MAX_V2.businessSignals,
  [SCORE_COMPONENT_KEYS.contactability]: SCORE_MAX_V2.contactability,
  [SCORE_COMPONENT_KEYS.evidenceQuality]: SCORE_MAX_V2.evidenceQuality,
} as const;

/** @deprecated Use SCORE_COMPONENT_MAX_V1 or SCORE_COMPONENT_MAX_V2. */
export const SCORE_COMPONENT_MAX = SCORE_COMPONENT_MAX_V1;

export const TOTAL_SCORE_MAX_V1 =
  SCORE_COMPONENT_MAX_V1[SCORE_COMPONENT_KEYS.companyIcpFit] +
  SCORE_COMPONENT_MAX_V1[SCORE_COMPONENT_KEYS.targetRoleFit] +
  SCORE_COMPONENT_MAX_V1[SCORE_COMPONENT_KEYS.decisionAuthority] +
  SCORE_COMPONENT_MAX_V1[SCORE_COMPONENT_KEYS.businessSignals] +
  SCORE_COMPONENT_MAX_V1[SCORE_COMPONENT_KEYS.contactability] +
  SCORE_COMPONENT_MAX_V1[SCORE_COMPONENT_KEYS.evidenceQuality];

export const TOTAL_SCORE_MAX_V2 =
  SCORE_COMPONENT_MAX_V2[SCORE_COMPONENT_KEYS.companyIcpFit] +
  SCORE_COMPONENT_MAX_V2[SCORE_COMPONENT_KEYS.targetRoleFit] +
  SCORE_COMPONENT_MAX_V2[SCORE_COMPONENT_KEYS.decisionAuthority] +
  SCORE_COMPONENT_MAX_V2[SCORE_COMPONENT_KEYS.experience] +
  SCORE_COMPONENT_MAX_V2[SCORE_COMPONENT_KEYS.businessSignals] +
  SCORE_COMPONENT_MAX_V2[SCORE_COMPONENT_KEYS.contactability] +
  SCORE_COMPONENT_MAX_V2[SCORE_COMPONENT_KEYS.evidenceQuality];

/** @deprecated Use TOTAL_SCORE_MAX_V1 or TOTAL_SCORE_MAX_V2. */
export const TOTAL_SCORE_MAX = TOTAL_SCORE_MAX_V1;

export function getScoreComponentMax(
  key: Exclude<ScoreComponentKey, typeof SCORE_COMPONENT_KEYS.icpFit>,
  scoreVersion: number,
): number {
  return scoreVersion >= 2
    ? SCORE_COMPONENT_MAX_V2[key]
    : SCORE_COMPONENT_MAX_V1[key as keyof typeof SCORE_COMPONENT_MAX_V1];
}

export function getTotalScoreMax(scoreVersion: number): number {
  return scoreVersion >= 2 ? TOTAL_SCORE_MAX_V2 : TOTAL_SCORE_MAX_V1;
}
