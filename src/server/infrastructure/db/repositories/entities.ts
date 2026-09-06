import { and, eq, sql } from "drizzle-orm";

import { isUniqueViolation } from "../errors";
import type { Db } from "../client";
import {
  businessSignals,
  companies,
  companyAliases,
  contactPoints,
  employments,
  entityMatches,
  people,
  personExternalProfiles,
  type BusinessSignal,
  type Company,
  type CompanyAlias,
  type ContactPoint,
  type Employment,
  type EntityMatch,
  type NewBusinessSignal,
  type NewCompany,
  type NewCompanyAlias,
  type NewContactPoint,
  type NewEmployment,
  type NewEntityMatch,
  type NewPerson,
  type NewPersonExternalProfile,
  type Person,
  type PersonExternalProfile,
} from "../schema/index";
import { upsertEmploymentRunProvenance } from "./search-provenance";

export type ObservationContext = {
  observedAt: Date;
  runId: string;
};

function observationTimestampFields(
  context: ObservationContext,
  isNew: boolean,
): {
  firstObservedAt?: Date;
  lastObservedAt: Date;
  lastConfirmedRunId: string;
} {
  return {
    ...(isNew ? { firstObservedAt: context.observedAt } : {}),
    lastObservedAt: context.observedAt,
    lastConfirmedRunId: context.runId,
  };
}

export async function getCompanyAliasesByCompanyId(
  db: Db,
  companyId: string,
): Promise<CompanyAlias[]> {
  return db.query.companyAliases.findMany({
    where: eq(companyAliases.companyId, companyId),
  });
}

export async function createCompany(db: Db, input: NewCompany): Promise<Company> {
  try {
    const [company] = await db.insert(companies).values(input).returning();
    if (!company) {
      throw new Error("Failed to create company");
    }
    return company;
  } catch (error) {
    if (!isUniqueViolation(error, "companies_normalized_domain_idx")) {
      throw error;
    }
    const existing = await findCompanyByDomain(db, input.normalizedDomain);
    if (existing) {
      return existing;
    }
    throw error;
  }
}

export async function updateCompany(
  db: Db,
  companyId: string,
  input: Partial<NewCompany>,
): Promise<Company | undefined> {
  const [company] = await db
    .update(companies)
    .set(input)
    .where(eq(companies.id, companyId))
    .returning();
  return company;
}

export async function upsertCompanyWithObservation(
  db: Db,
  companyId: string | undefined,
  input: Omit<NewCompany, "firstObservedAt" | "lastObservedAt" | "lastConfirmedRunId">,
  context: ObservationContext,
): Promise<Company> {
  if (companyId) {
    const updated = await updateCompany(db, companyId, {
      ...input,
      ...observationTimestampFields(context, false),
    });
    if (!updated) {
      throw new Error("Failed to update company");
    }
    return updated;
  }

  const [company] = await db
    .insert(companies)
    .values({
      ...input,
      ...observationTimestampFields(context, true),
    })
    .returning();

  if (!company) {
    throw new Error("Failed to create company");
  }
  return company;
}

export async function findCompanyByDomain(
  db: Db,
  normalizedDomain: string,
): Promise<Company | undefined> {
  return db.query.companies.findFirst({
    where: eq(companies.normalizedDomain, normalizedDomain),
  });
}

export async function getCompanyById(db: Db, companyId: string): Promise<Company | undefined> {
  return db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
}

export async function createCompanyAlias(db: Db, input: NewCompanyAlias): Promise<CompanyAlias> {
  const [alias] = await db
    .insert(companyAliases)
    .values(input)
    .onConflictDoNothing({
      target: [companyAliases.aliasType, companyAliases.normalizedValue],
    })
    .returning();
  if (alias) {
    return alias;
  }

  const existing = await db.query.companyAliases.findFirst({
    where: and(
      eq(companyAliases.aliasType, input.aliasType),
      eq(companyAliases.normalizedValue, input.normalizedValue),
    ),
  });
  if (!existing) {
    throw new Error("Failed to create company alias");
  }
  return existing;
}

export async function findCompanyByAlias(
  db: Db,
  aliasType: CompanyAlias["aliasType"],
  normalizedValue: string,
): Promise<Company | undefined> {
  const alias = await db.query.companyAliases.findFirst({
    where: and(
      eq(companyAliases.aliasType, aliasType),
      eq(companyAliases.normalizedValue, normalizedValue),
    ),
    with: {
      company: true,
    },
  });

  return alias?.company;
}

export async function createPerson(db: Db, input: NewPerson): Promise<Person> {
  const [person] = await db.insert(people).values(input).returning();
  if (!person) {
    throw new Error("Failed to create person");
  }
  return person;
}

export async function updatePerson(
  db: Db,
  personId: string,
  input: Partial<NewPerson>,
): Promise<Person | undefined> {
  const [person] = await db.update(people).set(input).where(eq(people.id, personId)).returning();
  return person;
}

export async function upsertPersonWithObservation(
  db: Db,
  personId: string | undefined,
  input: Omit<NewPerson, "firstObservedAt" | "lastObservedAt" | "lastConfirmedRunId">,
  context: ObservationContext,
): Promise<Person> {
  if (personId) {
    const updated = await updatePerson(db, personId, {
      ...input,
      ...observationTimestampFields(context, false),
    });
    if (!updated) {
      throw new Error("Failed to update person");
    }
    return updated;
  }

  const [person] = await db
    .insert(people)
    .values({
      ...input,
      ...observationTimestampFields(context, true),
    })
    .returning();

  if (!person) {
    throw new Error("Failed to create person");
  }
  return person;
}

export async function getPersonById(db: Db, personId: string): Promise<Person | undefined> {
  return db.query.people.findFirst({
    where: eq(people.id, personId),
  });
}

export async function findPersonByProfileUrl(
  db: Db,
  profileUrl: string,
): Promise<Person | undefined> {
  return db.query.people.findFirst({
    where: eq(people.profileUrl, profileUrl),
  });
}

export async function createEmployment(db: Db, input: NewEmployment): Promise<Employment> {
  const [employment] = await db.insert(employments).values(input).returning();
  if (!employment) {
    throw new Error("Failed to create employment");
  }
  return employment;
}

export async function ensureCurrentEmployment(
  db: Db,
  input: Omit<NewEmployment, "isCurrent"> & { personId: string; companyId: string },
): Promise<Employment> {
  const existing = await findCurrentEmployment(db, input.personId, input.companyId);
  if (existing) {
    const updated = await updateEmployment(db, existing.id, {
      rawTitle: input.rawTitle || existing.rawTitle,
      normalizedTitle: input.normalizedTitle || existing.normalizedTitle,
      normalizedRole: input.normalizedRole || existing.normalizedRole,
      confidence: input.confidence ?? existing.confidence,
      lastObservedAt: new Date(),
      lastConfirmedRunId: input.lastConfirmedRunId ?? existing.lastConfirmedRunId,
    });
    return updated ?? existing;
  }

  try {
    return await createEmployment(db, { ...input, isCurrent: true });
  } catch (error) {
    if (!isUniqueViolation(error, "employments_current_person_company_idx")) {
      throw error;
    }
    const raced = await findCurrentEmployment(db, input.personId, input.companyId);
    if (raced) {
      return raced;
    }
    throw error;
  }
}

export async function updateEmployment(
  db: Db,
  employmentId: string,
  input: Partial<NewEmployment>,
): Promise<Employment | undefined> {
  const [employment] = await db
    .update(employments)
    .set(input)
    .where(eq(employments.id, employmentId))
    .returning();
  return employment;
}

export async function findCurrentEmployment(
  db: Db,
  personId: string,
  companyId: string,
): Promise<Employment | undefined> {
  return db.query.employments.findFirst({
    where: and(
      eq(employments.personId, personId),
      eq(employments.companyId, companyId),
      eq(employments.isCurrent, true),
    ),
  });
}

export async function upsertEmploymentWithObservation(
  db: Db,
  employmentId: string | undefined,
  input: Omit<
    NewEmployment,
    "firstObservedAt" | "lastObservedAt" | "lastConfirmedRunId" | "missedRefreshCount"
  >,
  context: ObservationContext,
): Promise<Employment> {
  if (employmentId) {
    const updated = await updateEmployment(db, employmentId, {
      ...input,
      ...observationTimestampFields(context, false),
      missedRefreshCount: 0,
    });
    if (!updated) {
      throw new Error("Failed to update employment");
    }
    await upsertEmploymentRunProvenance(db, {
      employmentId: updated.id,
      runId: context.runId,
      observedAt: context.observedAt,
    });
    return updated;
  }

  const [employment] = await db
    .insert(employments)
    .values({
      ...input,
      ...observationTimestampFields(context, true),
      missedRefreshCount: 0,
    })
    .returning();

  if (!employment) {
    throw new Error("Failed to create employment");
  }
  await upsertEmploymentRunProvenance(db, {
    employmentId: employment.id,
    runId: context.runId,
    observedAt: context.observedAt,
  });
  return employment;
}

export async function incrementEmploymentMissedRefreshCount(
  db: Db,
  employmentId: string,
): Promise<Employment | undefined> {
  const [employment] = await db
    .update(employments)
    .set({
      missedRefreshCount: sql`${employments.missedRefreshCount} + 1`,
    })
    .where(eq(employments.id, employmentId))
    .returning();
  return employment;
}

export async function getEmploymentsByPersonId(db: Db, personId: string): Promise<Employment[]> {
  return db.query.employments.findMany({
    where: eq(employments.personId, personId),
  });
}

export async function getEmploymentsByCompanyId(db: Db, companyId: string): Promise<Employment[]> {
  return db.query.employments.findMany({
    where: eq(employments.companyId, companyId),
  });
}

export async function createContactPoint(db: Db, input: NewContactPoint): Promise<ContactPoint> {
  const [contact] = await db
    .insert(contactPoints)
    .values(input)
    .onConflictDoNothing({
      target: [contactPoints.type, contactPoints.normalizedValue],
    })
    .returning();
  if (contact) {
    return contact;
  }

  const existing = await findContactByNormalizedValue(db, input.type, input.normalizedValue);
  if (!existing) {
    throw new Error("Failed to create contact point");
  }
  return existing;
}

export async function updateContactPoint(
  db: Db,
  contactPointId: string,
  input: Partial<NewContactPoint>,
): Promise<ContactPoint | undefined> {
  const [contact] = await db
    .update(contactPoints)
    .set(input)
    .where(eq(contactPoints.id, contactPointId))
    .returning();
  return contact;
}

export async function upsertContactPointWithObservation(
  db: Db,
  contactPointId: string | undefined,
  input: Omit<NewContactPoint, "firstObservedAt" | "lastObservedAt" | "lastConfirmedRunId">,
  context: ObservationContext,
): Promise<ContactPoint> {
  if (contactPointId) {
    const updated = await updateContactPoint(db, contactPointId, {
      ...input,
      ...observationTimestampFields(context, false),
    });
    if (!updated) {
      throw new Error("Failed to update contact point");
    }
    return updated;
  }

  const [contact] = await db
    .insert(contactPoints)
    .values({
      ...input,
      ...observationTimestampFields(context, true),
    })
    .returning();

  if (!contact) {
    throw new Error("Failed to create contact point");
  }
  return contact;
}

export async function getContactPointsByPersonId(
  db: Db,
  personId: string,
): Promise<ContactPoint[]> {
  return db.query.contactPoints.findMany({
    where: eq(contactPoints.personId, personId),
  });
}

export async function findContactByNormalizedValue(
  db: Db,
  type: ContactPoint["type"],
  normalizedValue: string,
): Promise<ContactPoint | undefined> {
  return db.query.contactPoints.findFirst({
    where: and(eq(contactPoints.type, type), eq(contactPoints.normalizedValue, normalizedValue)),
  });
}

export async function createBusinessSignal(
  db: Db,
  input: NewBusinessSignal,
): Promise<BusinessSignal> {
  const [signal] = await db.insert(businessSignals).values(input).returning();
  if (!signal) {
    throw new Error("Failed to create business signal");
  }
  return signal;
}

export async function getBusinessSignalsByCompanyId(
  db: Db,
  companyId: string,
): Promise<BusinessSignal[]> {
  return db.query.businessSignals.findMany({
    where: eq(businessSignals.companyId, companyId),
  });
}

export async function createEntityMatch(db: Db, input: NewEntityMatch): Promise<EntityMatch> {
  const [match] = await db.insert(entityMatches).values(input).returning();
  if (!match) {
    throw new Error("Failed to create entity match");
  }
  return match;
}

export async function getEntityMatchesForReview(db: Db, limit = 50): Promise<EntityMatch[]> {
  return db.query.entityMatches.findMany({
    where: eq(entityMatches.decision, "review"),
    limit,
  });
}

export async function updateEntityMatchDecision(
  db: Db,
  matchId: string,
  decision: EntityMatch["decision"],
): Promise<EntityMatch | undefined> {
  const [match] = await db
    .update(entityMatches)
    .set({ decision })
    .where(eq(entityMatches.id, matchId))
    .returning();
  return match;
}

export async function upsertPersonExternalProfile(
  db: Db,
  input: NewPersonExternalProfile,
): Promise<PersonExternalProfile> {
  const provider = input.provider ?? "crustdata";

  if (input.providerPersonId) {
    const existingByProvider = await db.query.personExternalProfiles.findFirst({
      where: and(
        eq(personExternalProfiles.provider, provider),
        eq(personExternalProfiles.providerPersonId, input.providerPersonId),
      ),
    });
    if (existingByProvider) {
      const [updated] = await db
        .update(personExternalProfiles)
        .set({
          personId: input.personId,
          profileUrl: input.profileUrl ?? existingByProvider.profileUrl,
          normalizedProfileUrl:
            input.normalizedProfileUrl ?? existingByProvider.normalizedProfileUrl,
          providerUpdatedAt: input.providerUpdatedAt ?? existingByProvider.providerUpdatedAt,
        })
        .where(eq(personExternalProfiles.id, existingByProvider.id))
        .returning();
      if (updated) {
        return updated;
      }
    }
  }

  if (input.normalizedProfileUrl) {
    const existingByUrl = await db.query.personExternalProfiles.findFirst({
      where: eq(personExternalProfiles.normalizedProfileUrl, input.normalizedProfileUrl),
    });
    if (existingByUrl) {
      const [updated] = await db
        .update(personExternalProfiles)
        .set({
          personId: input.personId,
          providerPersonId: input.providerPersonId ?? existingByUrl.providerPersonId,
          profileUrl: input.profileUrl ?? existingByUrl.profileUrl,
          providerUpdatedAt: input.providerUpdatedAt ?? existingByUrl.providerUpdatedAt,
        })
        .where(eq(personExternalProfiles.id, existingByUrl.id))
        .returning();
      if (updated) {
        return updated;
      }
    }
  }

  try {
    const [created] = await db.insert(personExternalProfiles).values(input).returning();
    if (!created) {
      throw new Error("Failed to upsert person external profile");
    }
    return created;
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    if (input.providerPersonId) {
      const existingByProvider = await db.query.personExternalProfiles.findFirst({
        where: and(
          eq(personExternalProfiles.provider, provider),
          eq(personExternalProfiles.providerPersonId, input.providerPersonId),
        ),
      });
      if (existingByProvider) {
        return existingByProvider;
      }
    }
    if (input.normalizedProfileUrl) {
      const existingByUrl = await db.query.personExternalProfiles.findFirst({
        where: eq(personExternalProfiles.normalizedProfileUrl, input.normalizedProfileUrl),
      });
      if (existingByUrl) {
        return existingByUrl;
      }
    }
    throw error;
  }
}
