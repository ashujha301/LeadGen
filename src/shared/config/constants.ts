export const APP_NAME = "leadGen-demo";

export const USER_AGENT = "leadGen-demo/0.1 (+https://github.com/ashujha301/LeadGen)";

export const TARGET_ROLES = [
  "founder",
  "owner",
  "ceo",
  "president",
  "head of sales",
  "vp sales",
  "chief executive",
  "managing director",
] as const;

export const SCORE_MAX = {
  companyIcpFit: 20,
  targetRoleFit: 10,
  /** Sum of company and role ICP components (20 + 10). */
  icpFit: 30,
  decisionAuthority: 25,
  businessSignals: 20,
  contactability: 15,
  evidenceQuality: 10,
} as const;

export const SCORE_MAX_V2 = {
  companyIcpFit: 15,
  targetRoleFit: 15,
  decisionAuthority: 20,
  experience: 15,
  businessSignals: 15,
  contactability: 10,
  evidenceQuality: 10,
} as const;

export const HIGH_VALUE_LEAD_THRESHOLDS = {
  minScore: 55,
  minConfidence: 0.55,
  scoreVersion: 2,
} as const;

export const FRESHNESS_HALF_LIFE_DAYS = {
  contact: 30,
  employment: 90,
  company: 180,
} as const;

export const PERSON_MATCH_THRESHOLDS = {
  autoMerge: 0.9,
  review: 0.7,
} as const;

export const PERSON_MATCH_WEIGHTS = {
  profileUrl: 0.4,
  email: 0.3,
  currentCompany: 0.15,
  nameSimilarity: 0.1,
  titleSimilarity: 0.05,
} as const;

export const RATE_LIMITS = {
  naturalSearchPerMinute: 30,
  readApiPerMinute: 120,
} as const;

export const CONFIDENCE_CAP = 0.99;
