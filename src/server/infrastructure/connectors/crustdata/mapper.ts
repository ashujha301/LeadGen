import type {
  CrustdataCompanyData,
  CrustdataEmploymentDetail,
  CrustdataPersonData,
  CrustdataSearchProfile,
} from "./schemas";
import type {
  CrustdataCompanyResult,
  CrustdataPeopleSearchResult,
  CrustdataPersonEnrichResult,
  CrustdataPersonExperience,
  CrustdataPersonRef,
  CrustdataPersonResult,
  MappedObservation,
} from "../types";

function coercePersonRef(person: {
  crustdata_person_id?: string;
  name?: string;
  title?: string | null;
  professional_network_profile_url?: string | null;
  email?: string | null;
  match_score?: number;
}): CrustdataPersonRef {
  return {
    crustdata_person_id: person.crustdata_person_id,
    name: (person.name ?? "").trim(),
    title: person.title ?? null,
    professional_network_profile_url: person.professional_network_profile_url ?? null,
    email: person.email ?? null,
    match_score: person.match_score,
  };
}

function filterNamedPeople<T extends { name?: string | null }>(
  people: T[],
): Array<T & { name: string }> {
  return people.filter((person): person is T & { name: string } => Boolean(person.name?.trim()));
}

function normalizePositionId(value: string | number | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const numericValue = Number(normalized);
  return Number.isFinite(numericValue) && numericValue <= 0 ? null : normalized;
}

export function mapCompanyDataToResult(
  domain: string,
  data: CrustdataCompanyData,
  matchScore?: number,
): CrustdataCompanyResult {
  return {
    domain,
    crustdataCompanyId: data.crustdata_company_id ?? null,
    name: data.basic_info?.name ?? null,
    industry: data.taxonomy?.professional_network_industry ?? null,
    employeeCount: data.headcount?.total ?? null,
    location: data.locations?.headquarters ?? null,
    linkedinUrl: data.basic_info?.professional_network_url ?? null,
    description: data.basic_info?.description ?? null,
    matchScore: matchScore ?? null,
    providerUpdatedAt: data.updated_at ?? null,
    founders: filterNamedPeople(data.people?.founders ?? []).map((person) =>
      coercePersonRef(person),
    ),
    cxos: filterNamedPeople(data.people?.cxos ?? []).map((person) => coercePersonRef(person)),
    decisionMakers: filterNamedPeople(data.people?.decision_makers ?? []).map((person) =>
      coercePersonRef(person),
    ),
    raw: data,
  };
}

export function mapSearchProfileToPersonResult(
  profile: CrustdataSearchProfile,
): CrustdataPersonResult | null {
  const name = profile.basic_profile?.name;
  if (!name) {
    return null;
  }

  return {
    crustdataPersonId: profile.crustdata_person_id ?? null,
    name,
    title: profile.basic_profile?.current_title ?? null,
    email: null,
    linkedinUrl: profile.social_handles?.professional_network_identifier?.profile_url ?? null,
    matchScore: null,
    raw: profile,
  };
}

function mapEmploymentDetails(
  entries: CrustdataEmploymentDetail[],
  isCurrent: boolean,
): CrustdataPersonExperience[] {
  return entries.map((entry) => ({
    providerEmploymentId: normalizePositionId(entry.position_id),
    crustdataCompanyId: entry.crustdata_company_id ?? null,
    companyName: entry.name,
    companyDomain: entry.company_website_domain ?? null,
    companyLinkedinUrl: entry.company_professional_network_url ?? null,
    title: entry.title ?? null,
    isCurrent,
    startDate: entry.start_date ?? null,
    endDate: entry.end_date ?? null,
  }));
}

export function mapPersonDataToEnrichResult(
  data: CrustdataPersonData,
  status: "matched" | "not_found" | "redacted",
  matchedOn?: string | null,
  matchConfidence: number | null = null,
): CrustdataPersonEnrichResult {
  const current = data.experience?.employment_details?.current ?? [];
  const past = data.experience?.employment_details?.past ?? [];
  const returnedUrl = data.social_handles?.professional_network_identifier?.profile_url ?? null;

  return {
    crustdataPersonId: data.crustdata_person_id ?? null,
    status,
    name: data.basic_profile?.name ?? null,
    headline: data.basic_profile?.headline ?? null,
    location: data.basic_profile?.location ?? null,
    linkedinUrl: returnedUrl ?? matchedOn ?? null,
    matchedOn: matchedOn ?? null,
    providerExperienceYears: data.experience?.years_of_experience_raw ?? null,
    providerUpdatedAt: data.updated_at ?? null,
    matchConfidence,
    experience: [...mapEmploymentDetails(current, true), ...mapEmploymentDetails(past, false)],
    education: (data.education?.schools ?? []).map((school) => ({
      school: school.school,
      degree: school.degree ?? null,
    })),
    skills: data.skills?.professional_network_skills ?? [],
    raw: data,
  };
}

export function mapPersonRefToResult(person: CrustdataPersonRef): CrustdataPersonResult {
  return {
    crustdataPersonId: person.crustdata_person_id ?? null,
    name: person.name ?? "",
    title: person.title ?? null,
    email: person.email ?? null,
    linkedinUrl: person.professional_network_profile_url ?? null,
    matchScore: person.match_score ?? null,
    raw: person,
  };
}

export function mapCrustdataToObservations(result: CrustdataCompanyResult): MappedObservation[] {
  const observations: MappedObservation[] = [];

  if (result.name) {
    observations.push({
      entityType: "company",
      attribute: "name",
      rawValue: result.name,
      normalizedValue: result.name.toLowerCase(),
      confidence: 0.92,
    });
  }

  if (result.industry) {
    observations.push({
      entityType: "company",
      attribute: "industry",
      rawValue: result.industry,
      confidence: 0.88,
    });
  }

  if (result.location) {
    observations.push({
      entityType: "company",
      attribute: "location",
      rawValue: result.location,
      confidence: 0.85,
    });
  }

  if (result.employeeCount != null) {
    observations.push({
      entityType: "company",
      attribute: "employee_count",
      rawValue: String(result.employeeCount),
      confidence: 0.85,
    });
  }

  if (result.linkedinUrl) {
    observations.push({
      entityType: "company",
      attribute: "professional_network_url",
      rawValue: result.linkedinUrl,
      confidence: 0.9,
    });
  }

  if (result.description) {
    observations.push({
      entityType: "company",
      attribute: "description",
      rawValue: result.description,
      confidence: 0.7,
    });
  }

  return observations;
}

export function mapCrustdataPeopleToObservations(
  result: CrustdataPeopleSearchResult,
): MappedObservation[] {
  const observations: MappedObservation[] = [];

  for (const [index, person] of result.people.entries()) {
    const subjectKey = person.crustdataPersonId
      ? `crustdata:${person.crustdataPersonId}`
      : `crustdata-person-${index}`;

    observations.push({
      entityType: "person",
      attribute: "name",
      rawValue: person.name,
      normalizedValue: person.name.toLowerCase(),
      confidence: 0.8,
      subjectKey,
    });

    if (person.crustdataPersonId) {
      observations.push({
        entityType: "person",
        attribute: "crustdata_person_id",
        rawValue: person.crustdataPersonId,
        confidence: 0.9,
        subjectKey,
      });
    }

    if (person.title) {
      observations.push({
        entityType: "person",
        attribute: "title",
        rawValue: person.title,
        confidence: 0.78,
        subjectKey,
      });
    }

    if (person.email) {
      observations.push({
        entityType: "contact",
        attribute: "email",
        rawValue: person.email,
        normalizedValue: person.email.toLowerCase(),
        confidence: 0.75,
        subjectKey,
      });
    }

    if (person.linkedinUrl) {
      observations.push({
        entityType: "contact",
        attribute: "profile_url",
        rawValue: person.linkedinUrl,
        normalizedValue: person.linkedinUrl.toLowerCase(),
        confidence: 0.82,
        subjectKey,
      });
    }
  }

  return observations;
}
