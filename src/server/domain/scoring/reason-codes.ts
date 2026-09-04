export const REASON_CODES = {
  icp: {
    industryMatch: "ICP_INDUSTRY_MATCH",
    locationMatch: "ICP_LOCATION_MATCH",
    employeeRangeMatch: "ICP_EMPLOYEE_RANGE_MATCH",
    partialIcp: "ICP_PARTIAL_MATCH",
    noIcpMatch: "ICP_NO_MATCH",
  },
  authority: {
    founderOwner: "AUTH_FOUNDER_OWNER",
    cSuite: "AUTH_C_SUITE",
    vpDirector: "AUTH_VP_DIRECTOR",
    manager: "AUTH_MANAGER",
    individualContributor: "AUTH_IC",
    unknownRole: "AUTH_UNKNOWN",
  },
  signals: {
    funding: "SIGNAL_FUNDING",
    hiring: "SIGNAL_HIRING",
    expansion: "SIGNAL_EXPANSION",
    productLaunch: "SIGNAL_PRODUCT_LAUNCH",
    leadershipChange: "SIGNAL_LEADERSHIP_CHANGE",
    none: "SIGNAL_NONE",
  },
  contact: {
    verifiedEmail: "CONTACT_VERIFIED_EMAIL",
    unverifiedEmail: "CONTACT_UNVERIFIED_EMAIL",
    phone: "CONTACT_PHONE",
    linkedin: "CONTACT_LINKEDIN",
    none: "CONTACT_NONE",
  },
  evidence: {
    multiSource: "EVIDENCE_MULTI_SOURCE",
    singleSource: "EVIDENCE_SINGLE_SOURCE",
    highConfidence: "EVIDENCE_HIGH_CONFIDENCE",
    lowConfidence: "EVIDENCE_LOW_CONFIDENCE",
    stale: "EVIDENCE_STALE",
  },
  role: {
    fullMatch: "ROLE_FULL_MATCH",
    customTitleMatch: "ROLE_CUSTOM_TITLE_MATCH",
    noMatch: "ROLE_NO_MATCH",
    noCriteria: "ROLE_NO_CRITERIA",
  },
  experience: {
    strong: "EXPERIENCE_STRONG",
    moderate: "EXPERIENCE_MODERATE",
    limited: "EXPERIENCE_LIMITED",
  },
} as const;

export type ReasonCode =
  | (typeof REASON_CODES.icp)[keyof typeof REASON_CODES.icp]
  | (typeof REASON_CODES.authority)[keyof typeof REASON_CODES.authority]
  | (typeof REASON_CODES.signals)[keyof typeof REASON_CODES.signals]
  | (typeof REASON_CODES.contact)[keyof typeof REASON_CODES.contact]
  | (typeof REASON_CODES.evidence)[keyof typeof REASON_CODES.evidence]
  | (typeof REASON_CODES.role)[keyof typeof REASON_CODES.role]
  | (typeof REASON_CODES.experience)[keyof typeof REASON_CODES.experience];
