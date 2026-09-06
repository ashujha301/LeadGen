export {
  buildEmployerIdentityKey,
  resolveSharedEmployerKey,
  employerMatchKind,
  type EmployerIdentityInput,
} from "./employer-identity";

export {
  toHalfOpenInterval,
  halfOpenOverlapDays,
  mergePersonEmployerIntervals,
  intersectIntervalSets,
  totalIntersectedOverlapDays,
  type EmploymentIntervalInput,
  type HalfOpenInterval,
} from "./date-ranges";

export {
  scorePotentialConnectionStrength,
  scoreEvidenceQuality,
  buildStableConnectionId,
  type StrengthBand,
  type EvidenceLabel,
} from "./scoring";
