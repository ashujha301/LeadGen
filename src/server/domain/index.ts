export { normalizeDomain } from "./normalization/domain";
export { normalizeName, nameSimilarity } from "./normalization/name";
export { buildSubjectKey } from "./normalization/subject-key";
export { isErrorPageTitle, normalizeTitle, titleSimilarity } from "./normalization/title";
export { normalizeUrl } from "./normalization/url";

export {
  buildCompanyDomainIndex,
  resolveCompanyByDomain,
  type CompanyRecord,
  type CompanyResolutionResult,
} from "./entity-resolution/company";

export {
  normalizeEmail,
  normalizePersonCandidate,
  scoreCurrentCompanyMatch,
  scoreEmailMatch,
  scoreNameMatch,
  scoreProfileUrlMatch,
  scoreTitleMatch,
  type PersonCandidate,
  type PersonFeatureScore,
  type PersonMatchFeature,
} from "./entity-resolution/person";

export {
  classifyMatchDecision,
  matchPersons,
  type MatchDecision,
  type PersonMatchResult,
} from "./entity-resolution/matcher";

export { combineConfidence, CONFIDENCE_CAP, type ConfidenceSource } from "./confidence/combine";
export {
  ageInDays,
  calculateFreshness,
  FRESHNESS_HALF_LIFE_DAYS,
  type FreshnessCategory,
} from "./confidence/freshness";

export {
  employmentOverlapDays,
  employmentRangesOverlap,
  type DateRange,
} from "./timeline/overlap";

export {
  buildEmploymentHistory,
  findSharedEmploymentOverlaps,
  type EmploymentOverlap,
  type EmploymentRecord,
} from "./timeline/employment-history";

export {
  buildLeadGraph,
  emptyGraph,
  type LeadGraphInput,
} from "./search/graph-response";

export {
  findEmploymentOverlaps,
  findSharedEmployerConnections,
  findPreviousColleaguesAtCompany,
  type OverlapSearchInput,
} from "./search/connection-search";

export { classifyTitle, type TitleClassification } from "./roles/classification";
export {
  matchTitleAgainstRoleCriteria,
  type RoleMatchResult,
} from "./roles/matching";
