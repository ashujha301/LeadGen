import type { CompanyDetail, PersonDetail } from "@/shared/contracts";
import {
  getDb,
  entitiesRepo,
  listOwnedCompanyIdsForPerson,
  listOwnedPersonIdsForCompany,
  sourcesRepo,
  userOwnsCompany,
  userOwnsPerson,
} from "@/server/infrastructure/db";

function toNumber(value: string | number | null | undefined): number {
  if (value == null) {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type EntityMatch = {
  id: string;
  entityType: "person" | "company";
  candidateA: { id: string; label: string };
  candidateB: { id: string; label: string };
  matchScore: number;
  reasons: string[];
  decision: "review";
};

export const entityService = {
  async getCompany(companyId: string, userId: string): Promise<CompanyDetail | null> {
    const db = getDb();
    if (!(await userOwnsCompany(db, companyId, userId))) {
      return null;
    }

    const company = await entitiesRepo.getCompanyById(db, companyId);
    if (!company) {
      return null;
    }

    const ownedPersonIds = new Set(await listOwnedPersonIdsForCompany(db, companyId, userId));
    const employments = await entitiesRepo.getEmploymentsByCompanyId(db, companyId);
    const people = (
      await Promise.all(
        employments
          .filter((employment) => ownedPersonIds.has(employment.personId))
          .map(async (employment) => {
            const person = await entitiesRepo.getPersonById(db, employment.personId);
            if (!person) {
              return null;
            }

            return {
              id: person.id,
              name: person.name,
              title: employment.rawTitle,
              isCurrent: employment.isCurrent,
            };
          }),
      )
    ).filter(Boolean) as Array<{
      id: string;
      name: string;
      title: string | null;
      isCurrent: boolean;
    }>;

    const signals = await entitiesRepo.getBusinessSignalsByCompanyId(db, companyId);
    const aliases = await entitiesRepo.getCompanyAliasesByCompanyId(db, companyId);
    const documents = await sourcesRepo.findSourceDocumentsByDomainForUser(
      db,
      company.normalizedDomain,
      userId,
    );

    return {
      id: company.id,
      name: company.name,
      normalizedDomain: company.normalizedDomain,
      industry: company.industry,
      location: company.location,
      employeeCount: company.employeeCount,
      confidence: toNumber(company.confidence),
      freshness: toNumber(company.freshness),
      aliases: aliases.map((alias) => alias.aliasValue),
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
      businessSignals: signals.map((signal) => ({
        type: signal.signalType,
        value: signal.value,
        confidence: toNumber(signal.confidence),
        observedAt: signal.observedAt.toISOString(),
      })),
      people,
      evidence: documents.map((doc) => ({
        id: doc.id,
        sourceUrl: doc.canonicalUrl,
        excerpt: doc.excerpt ?? "",
        observedAt: (doc.fetchedAt ?? doc.createdAt).toISOString(),
      })),
    };
  },

  async getPerson(personId: string, userId: string): Promise<PersonDetail | null> {
    const db = getDb();
    if (!(await userOwnsPerson(db, personId, userId))) {
      return null;
    }

    const person = await entitiesRepo.getPersonById(db, personId);
    if (!person) {
      return null;
    }

    const ownedCompanyIds = new Set(await listOwnedCompanyIdsForPerson(db, personId, userId));
    const contacts = await entitiesRepo.getContactPointsByPersonId(db, personId);
    const employments = await entitiesRepo.getEmploymentsByPersonId(db, personId);
    const scopedEmployments = employments.filter(
      (employment) => employment.companyId != null && ownedCompanyIds.has(employment.companyId),
    );
    const employmentDetails = await Promise.all(
      scopedEmployments.map(async (employment) => {
        const company = employment.companyId
          ? await entitiesRepo.getCompanyById(db, employment.companyId)
          : null;
        return {
          companyId: employment.companyId,
          companyName: company?.name ?? employment.employerName ?? "Unknown company",
          title: employment.rawTitle,
          startDate: employment.startDate,
          endDate: employment.endDate,
          isCurrent: employment.isCurrent,
          confidence: toNumber(employment.confidence),
          employerDomain: employment.employerDomain ?? null,
        };
      }),
    );

    return {
      id: person.id,
      name: person.name,
      normalizedName: person.normalizedName,
      profileUrl: person.profileUrl,
      confidence: toNumber(person.confidence),
      freshness: toNumber(person.freshness),
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
      contacts: contacts.map((contact) => ({
        type: contact.type,
        value: contact.rawValue,
        verificationStatus: contact.verificationStatus,
        confidence: toNumber(contact.confidence),
      })),
      employments: employmentDetails,
      evidence: [],
    };
  },

  async getUnresolvedMatches(userId: string): Promise<EntityMatch[]> {
    const db = getDb();
    const matches = await entitiesRepo.getEntityMatchesForReview(db);
    const results: EntityMatch[] = [];

    for (const match of matches) {
      if (match.entityType !== "person") {
        continue;
      }

      const [ownsA, ownsB] = await Promise.all([
        userOwnsPerson(db, match.candidateAId, userId),
        userOwnsPerson(db, match.candidateBId, userId),
      ]);
      if (!ownsA || !ownsB) {
        continue;
      }

      const personA = await entitiesRepo.getPersonById(db, match.candidateAId);
      const personB = await entitiesRepo.getPersonById(db, match.candidateBId);
      if (!personA || !personB) {
        continue;
      }

      results.push({
        id: match.id,
        entityType: "person",
        candidateA: { id: personA.id, label: personA.name },
        candidateB: { id: personB.id, label: personB.name },
        matchScore: toNumber(match.matchScore),
        reasons: match.reasons ?? [],
        decision: "review",
      });
    }

    return results;
  },
};
