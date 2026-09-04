export type {
  ConnectorStatus,
  ConnectorResult,
  CompanyPageFetchResult,
  RdapDomainResult,
  CrustdataCompanyResult,
  CrustdataPeopleSearchResult,
  CrustdataPersonResult,
  CrustdataPersonEnrichResult,
  CrustdataPersonExperience,
  EmailVerificationResult,
  MappedObservation,
} from "./types";

export { fetchCompanyPage, type FetchCompanyPageOptions } from "./company-website/client";
export { mapCompanyPageToObservations } from "./company-website/mapper";

export { lookupDomain, mapRdapPayload, type LookupDomainOptions } from "./rdap/client";
export { mapRdapToObservations } from "./rdap/mapper";

export {
  enrichCompany,
  enrichPerson,
  isCrustdataEnabled,
  searchPeopleByCompany,
  searchPersonByNameAndCompany,
  buildTitleConditions,
  escapeTitleCondition,
  initializeCrustdataLimiters,
  resetCrustdataClientState,
  type EnrichCompanyOptions,
  type SearchPeopleOptions,
  type EnrichPersonOptions,
  type CrustdataRequestMeta,
} from "./crustdata/client";
export { mapCrustdataToObservations, mapCrustdataPeopleToObservations } from "./crustdata/mapper";

export {
  verifyEmail,
  isEmailVerifierEnabled,
  type VerifyEmailOptions,
} from "./email-verifier/client";
export { mapEmailVerificationToObservations } from "./email-verifier/mapper";

export {
  assertSafeUrl,
  resolveAndValidateHost,
  validateUrl,
} from "./ssrf-guard";
