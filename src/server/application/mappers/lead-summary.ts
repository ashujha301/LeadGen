import type { LeadSummary } from "@/shared/contracts/lead";
import type {
  Company,
  ContactPoint,
  Employment,
  LeadCandidate,
  Person,
  PersonExperienceMetrics,
  PersonExternalProfile,
} from "@/server/infrastructure/db";

export function buildLeadSummary(input: {
  lead: LeadCandidate;
  person: Person;
  company: Company;
  employment: Employment;
  contacts: ContactPoint[];
  keyReason: string;
  experienceMetrics?: PersonExperienceMetrics | null;
  externalProfile?: PersonExternalProfile | null;
}): LeadSummary {
  const linkedinContact = input.contacts.find((contact) => contact.type === "linkedin");
  const linkedinUrl =
    linkedinContact?.rawValue ?? input.externalProfile?.profileUrl ?? null;

  const totalExperienceYears = input.experienceMetrics?.calculatedTotalMonths
    ? input.experienceMetrics.calculatedTotalMonths / 12
    : input.experienceMetrics?.providerExperienceYears
      ? Number(input.experienceMetrics.providerExperienceYears)
      : null;

  return {
    id: input.lead.id,
    personId: input.person.id,
    companyId: input.company.id,
    personName: input.person.name,
    title: input.employment.rawTitle ?? null,
    companyName: input.company.name,
    score: Number(input.lead.finalScore),
    contactability: Number(input.lead.contactability),
    confidence: Number(input.lead.confidence),
    keyReason: input.keyReason,
    hasEmail: input.contacts.some((contact) => contact.type === "email"),
    hasPhone: input.contacts.some((contact) => contact.type === "phone"),
    roleMatch: input.lead.roleMatch,
    roleMatchReasons: input.lead.roleMatchReasons ?? [],
    linkedinUrl,
    totalExperienceYears,
    experienceConfidence: input.experienceMetrics
      ? Number(input.experienceMetrics.experienceConfidence)
      : null,
    enrichmentStatus: input.lead.enrichmentStatus ?? "pending",
    providerUpdatedAt: input.externalProfile?.providerUpdatedAt?.toISOString() ?? null,
    scoreVersion: input.lead.scoreVersion ?? 1,
    roleMatchTier: input.lead.roleMatchTier ?? "none",
    roleSimilarity: Number(input.lead.roleSimilarity ?? 0),
    roleMatchFinal: input.lead.roleMatchFinal ?? false,
  };
}
