export type ConnectorStatus = "success" | "error" | "disabled";

export type ConnectorResult<T> =
  | { status: "success"; data: T }
  | { status: "disabled"; reason: string }
  | { status: "error"; error: string };

export type CompanyPageFetchResult = {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
  html: string;
  fetchedAt: string;
};

export type RdapDomainResult = {
  domain: string;
  registrar: string | null;
  createdDate: string | null;
  updatedDate: string | null;
  expiresDate: string | null;
  status: string[];
  nameservers: string[];
  raw: unknown;
};

export type CrustdataPersonRef = {
  crustdata_person_id?: string;
  name: string;
  title?: string | null;
  professional_network_profile_url?: string | null;
  email?: string | null;
  match_score?: number;
};

export type CrustdataCompanyResult = {
  domain: string;
  crustdataCompanyId: string | null;
  name: string | null;
  industry: string | null;
  employeeCount: number | null;
  location: string | null;
  linkedinUrl: string | null;
  description: string | null;
  matchScore: number | null;
  providerUpdatedAt: string | null;
  founders: CrustdataPersonRef[];
  cxos: CrustdataPersonRef[];
  decisionMakers: CrustdataPersonRef[];
  raw: unknown;
};

export type CrustdataPersonResult = {
  crustdataPersonId: string | null;
  name: string;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  matchScore: number | null;
  raw: unknown;
};

export type CrustdataPersonExperience = {
  providerEmploymentId: string | null;
  companyName: string;
  companyDomain: string | null;
  companyLinkedinUrl: string | null;
  title: string | null;
  isCurrent: boolean;
  startDate: string | null;
  endDate: string | null;
};

export type CrustdataPersonEnrichResult = {
  crustdataPersonId: string | null;
  status: "matched" | "not_found" | "redacted";
  name: string | null;
  headline: string | null;
  location: string | null;
  linkedinUrl: string | null;
  providerExperienceYears: number | null;
  providerUpdatedAt: string | null;
  experience: CrustdataPersonExperience[];
  education: Array<{ school?: string; degree?: string | null }>;
  skills: string[];
  raw: unknown;
};

export type CrustdataPeopleSearchResult = {
  domain: string;
  people: CrustdataPersonResult[];
  raw: unknown;
};

export type EmailVerificationResult = {
  email: string;
  status: "verified" | "unverified" | "invalid" | "unknown";
  provider: string;
  raw: unknown;
};

export type MappedObservation = {
  entityType: "company" | "person" | "employment" | "contact" | "signal";
  attribute: string;
  rawValue: string;
  normalizedValue?: string;
  confidence: number;
  subjectKey?: string;
};
