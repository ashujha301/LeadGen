import { pickCompanyNameFromObservations, isGenericCompanyLabel } from "@/server/domain/company-identity";
import { isErrorPageTitle } from "@/server/domain/normalization/title";
import { normalizeCompanyInput } from "@/server/domain/normalization/company-input";
import { buildPersonSearchSourceKey, hashRoleCriteria } from "@/server/domain/source-keys";
import { validatePersonMention } from "@/server/domain/entity-resolution/mention-validation";
import {
  matchPersons,
  normalizeDomain,
  normalizeEmail,
  normalizeName,
  normalizeTitle,
  type PersonCandidate,
} from "@/server/domain";
import {
  dedupePersonDrafts,
  findExistingPersonByNameAtCompany,
  type PersonDraft,
} from "@/server/domain/entity-resolution/person-drafts";

export { pickCompanyNameFromObservations as pickCompanyName };
import { getDb, entitiesRepo, runsRepo, sourcesRepo } from "@/server/infrastructure/db";

import type { StageContext, StageResult } from "../jobs/process-run";

function collectPersonDrafts(
  docObs: Array<{
    id: string;
    entityType: string;
    attribute: string;
    rawValue: string;
    normalizedValue: string | null;
    confidence: string;
    subjectKey: string | null;
  }>,
  sourceDocumentId: string,
): PersonDraft[] {
  const drafts: PersonDraft[] = [];
  const subjectKeys = new Set<string>();

  for (const obs of docObs) {
    if (obs.entityType === "person" && obs.attribute === "name" && obs.subjectKey) {
      subjectKeys.add(obs.subjectKey);
    }
  }

  for (const subjectKey of subjectKeys) {
    const subjectObs = docObs.filter((obs) => obs.subjectKey === subjectKey);
    const nameObs = subjectObs.find((obs) => obs.entityType === "person" && obs.attribute === "name");
    if (!nameObs) {
      continue;
    }

    const mention = validatePersonMention(nameObs.rawValue);
    if (!mention.valid) {
      continue;
    }

    drafts.push({
      name: mention.normalizedName || nameObs.rawValue,
      normalizedName: nameObs.normalizedValue ?? normalizeName(mention.normalizedName || nameObs.rawValue),
      title: subjectObs.find((obs) => obs.entityType === "person" && obs.attribute === "title")?.rawValue,
      email: subjectObs.find((obs) => obs.entityType === "contact" && obs.attribute === "email")?.rawValue,
      phone: subjectObs.find((obs) => obs.entityType === "contact" && obs.attribute === "phone")?.rawValue,
      profileUrl: subjectObs.find((obs) => obs.entityType === "contact" && obs.attribute === "profile_url")
        ?.rawValue,
      confidence: Number(nameObs.confidence),
      sourceDocumentId,
      subjectKey,
    });
  }

  const namesWithoutKey = docObs.filter(
    (obs) => obs.entityType === "person" && obs.attribute === "name" && !obs.subjectKey,
  );

  for (const nameObs of namesWithoutKey) {
    const mention = validatePersonMention(nameObs.rawValue);
    if (!mention.valid) {
      continue;
    }

    const subjectKey = nameObs.id;
    drafts.push({
      name: mention.normalizedName || nameObs.rawValue,
      normalizedName: nameObs.normalizedValue ?? normalizeName(mention.normalizedName || nameObs.rawValue),
      title: docObs.find(
        (obs) =>
          obs.entityType === "person" &&
          obs.attribute === "title" &&
          (obs.subjectKey === subjectKey || !obs.subjectKey),
      )?.rawValue,
      email: docObs.find(
        (obs) =>
          obs.entityType === "contact" &&
          obs.attribute === "email" &&
          (obs.subjectKey === subjectKey || !obs.subjectKey),
      )?.rawValue,
      phone: docObs.find(
        (obs) =>
          obs.entityType === "contact" &&
          obs.attribute === "phone" &&
          (obs.subjectKey === subjectKey || !obs.subjectKey),
      )?.rawValue,
      profileUrl: docObs.find(
        (obs) =>
          obs.entityType === "contact" &&
          obs.attribute === "profile_url" &&
          (obs.subjectKey === subjectKey || !obs.subjectKey),
      )?.rawValue,
      confidence: Number(nameObs.confidence),
      sourceDocumentId,
      subjectKey,
    });
  }

  return drafts;
}

export async function resolve(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  await runsRepo.updateRunStatus(db, ctx.runId, "resolving");

  const allObservations = await sourcesRepo.getObservationsByRunId(db, ctx.runId);
  const documents = await sourcesRepo.getSourceDocumentsByRunId(db, ctx.runId);
  const run = await runsRepo.getRunById(db, ctx.runId);

  const companyObs = allObservations
    .filter((obs) => obs.entityType === "company")
    .map((obs) => {
      const document = documents.find((doc) => doc.id === obs.sourceDocumentId);
      let isHomepage = false;
      if (document?.canonicalUrl) {
        try {
          const path = new URL(document.canonicalUrl).pathname.replace(/\/+$/, "") || "/";
          isHomepage = path === "/";
        } catch {
          isHomepage = false;
        }
      }
      return {
        attribute: obs.attribute,
        rawValue: obs.rawValue,
        sourceUrl: document?.canonicalUrl,
        isHomepage,
      };
    });
  let company = await entitiesRepo.findCompanyByDomain(db, ctx.normalizedDomain);

  const normalizedInput = normalizeCompanyInput(ctx.domain);
  const websiteUrl = normalizedInput?.homepageUrl ?? `https://${ctx.normalizedDomain}`;
  const companyName =
    ctx.providerCompany?.name ??
    pickCompanyNameFromObservations(companyObs, ctx.normalizedDomain, websiteUrl);

  if (!company) {
    company = await entitiesRepo.createCompany(db, {
      name: companyName,
      normalizedName: normalizeName(companyName),
      normalizedDomain: ctx.normalizedDomain,
      websiteUrl,
      professionalNetworkUrl: ctx.providerCompany?.linkedinUrl ?? null,
      nameSource: ctx.providerCompany?.name ? "crustdata" : null,
      nameObservedAt: ctx.providerCompany?.name ? new Date() : null,
      confidence: "0.5",
      freshness: "1",
    });
  } else {
    const updates: Parameters<typeof entitiesRepo.updateCompany>[2] = {};

    if (
      (company.name === ctx.normalizedDomain ||
        isErrorPageTitle(company.name) ||
        isGenericCompanyLabel(company.name, ctx.normalizedDomain)) &&
      companyName !== ctx.normalizedDomain &&
      !isErrorPageTitle(companyName) &&
      !isGenericCompanyLabel(companyName, ctx.normalizedDomain)
    ) {
      updates.name = companyName;
      updates.normalizedName = normalizeName(companyName);
    }

    if (ctx.providerCompany?.name && company.name !== ctx.providerCompany.name) {
      updates.name = ctx.providerCompany.name;
      updates.normalizedName = normalizeName(ctx.providerCompany.name);
      updates.nameSource = "crustdata";
      updates.nameObservedAt = new Date();
    }

    if (!company.websiteUrl) {
      updates.websiteUrl = websiteUrl;
    }

    if (ctx.providerCompany?.linkedinUrl && !company.professionalNetworkUrl) {
      updates.professionalNetworkUrl = ctx.providerCompany.linkedinUrl;
    }

    if (Object.keys(updates).length > 0) {
      await entitiesRepo.updateCompany(db, company.id, updates);
    }
  }

  ctx.companyId = company.id;

  for (const obs of companyObs) {
    if (obs.attribute === "industry" && obs.rawValue) {
      await entitiesRepo.updateCompany(db, company.id, { industry: obs.rawValue });
    }
    if (obs.attribute === "location" && obs.rawValue) {
      await entitiesRepo.updateCompany(db, company.id, { location: obs.rawValue });
    }
    if (obs.attribute === "employee_count" && obs.rawValue) {
      const count = Number.parseInt(obs.rawValue, 10);
      if (Number.isFinite(count)) {
        await entitiesRepo.updateCompany(db, company.id, { employeeCount: count });
      }
    }
    if (
      obs.attribute === "professional_network_url" &&
      obs.rawValue &&
      !company.professionalNetworkUrl &&
      !ctx.providerCompany?.linkedinUrl
    ) {
      await entitiesRepo.updateCompany(db, company.id, {
        professionalNetworkUrl: obs.rawValue,
      });
      company = { ...company, professionalNetworkUrl: obs.rawValue };
    }
  }

  const allDrafts: PersonDraft[] = [];

  for (const document of documents) {
    const docObs = allObservations.filter((obs) => obs.sourceDocumentId === document.id);
    allDrafts.push(...collectPersonDrafts(docObs, document.id));
  }

  const criteriaHash = hashRoleCriteria(run?.roleCriteria);
  const personSearchDoc = documents.find(
    (document) => document.sourceKey === buildPersonSearchSourceKey(ctx.normalizedDomain, criteriaHash),
  );

  if (ctx.providerPeople?.people.length) {
    const sourceDocumentId = personSearchDoc?.id ?? documents[0]?.id ?? "";
    for (const [index, person] of ctx.providerPeople.people.entries()) {
      allDrafts.push({
        name: person.name,
        normalizedName: normalizeName(person.name),
        title: person.title ?? undefined,
        profileUrl: person.linkedinUrl ?? undefined,
        crustdataPersonId: person.crustdataPersonId ?? undefined,
        confidence: 0.85,
        sourceDocumentId,
        subjectKey: person.crustdataPersonId
          ? `crustdata:${person.crustdataPersonId}`
          : `crustdata-search-${index}`,
      });
    }
  }

  if (ctx.providerCompany) {
    const companyEnrichDoc = documents.find(
      (document) => document.sourceKey === `company_enrich:${ctx.normalizedDomain}`,
    );
    const sourceDocumentId = companyEnrichDoc?.id ?? documents[0]?.id ?? "";
    const providerPeople = [
      ...(ctx.providerCompany.founders ?? []),
      ...(ctx.providerCompany.cxos ?? []),
      ...(ctx.providerCompany.decisionMakers ?? []),
    ];
    for (const [index, person] of providerPeople.entries()) {
      allDrafts.push({
        name: person.name,
        normalizedName: normalizeName(person.name),
        title: person.title ?? undefined,
        profileUrl: person.professional_network_profile_url ?? undefined,
        crustdataPersonId: person.crustdata_person_id,
        confidence: 0.88,
        sourceDocumentId,
        subjectKey: person.crustdata_person_id
          ? `crustdata:${person.crustdata_person_id}`
          : `crustdata-company-person-${index}`,
      });
    }
  }

  const existingEmployments = await entitiesRepo.getEmploymentsByCompanyId(db, company.id);
  const existingPeople = await Promise.all(
    existingEmployments.map((employment) => entitiesRepo.getPersonById(db, employment.personId)),
  );

  const resolvedPeople: Array<{ id: string; draft: PersonDraft }> = [];
  let peopleResolved = 0;

  for (const draft of dedupePersonDrafts(allDrafts)) {
    const candidate: PersonCandidate = {
      name: draft.normalizedName,
      title: draft.title ? normalizeTitle(draft.title) : null,
      email: draft.email ? normalizeEmail(draft.email) : null,
      profileUrl: draft.profileUrl ?? null,
      currentCompanyId: company.id,
    };

    let matchedPersonId: string | null = findExistingPersonByNameAtCompany(
      draft,
      existingPeople.filter((person): person is NonNullable<typeof person> => Boolean(person)),
    );

    if (!matchedPersonId) {
      for (const person of existingPeople) {
        if (!person) {
          continue;
        }

        const employment = existingEmployments.find((row) => row.personId === person.id);
        const existingCandidate: PersonCandidate = {
          name: person.normalizedName,
          title: employment?.normalizedTitle ?? null,
          profileUrl: person.profileUrl,
          currentCompanyId: company.id,
        };

        const match = matchPersons(candidate, existingCandidate);
        if (match.decision === "auto_merge") {
          matchedPersonId = person.id;
          break;
        }

        if (match.decision === "review") {
          // Keep separate entities; match will be recorded after creating the new person.
        }
      }
    }

    let personId = matchedPersonId;

    if (!personId) {
      const byProfile = draft.profileUrl
        ? await entitiesRepo.findPersonByProfileUrl(db, draft.profileUrl)
        : undefined;
      const byEmail = draft.email
        ? await entitiesRepo.findContactByNormalizedValue(db, "email", normalizeEmail(draft.email))
        : undefined;

      personId =
        byProfile?.id ??
        byEmail?.personId ??
        (
          await entitiesRepo.createPerson(db, {
            name: draft.name,
            normalizedName: draft.normalizedName,
            profileUrl: draft.profileUrl ?? null,
            confidence: String(draft.confidence),
            freshness: "1",
          })
        ).id;

      const reviewTarget = existingPeople.find((person) => {
        if (!person) {
          return false;
        }
        const employment = existingEmployments.find((row) => row.personId === person.id);
        const existingCandidate: PersonCandidate = {
          name: person.normalizedName,
          title: employment?.normalizedTitle ?? null,
          profileUrl: person.profileUrl,
          currentCompanyId: company.id,
        };
        return matchPersons(candidate, existingCandidate).decision === "review";
      });

      if (reviewTarget?.id && reviewTarget.id !== personId) {
        const reviewMatch = matchPersons(candidate, {
          name: reviewTarget.normalizedName,
          title: draft.title ? normalizeTitle(draft.title) : null,
          profileUrl: reviewTarget.profileUrl,
          currentCompanyId: company.id,
        });

        await entitiesRepo.createEntityMatch(db, {
          entityType: "person",
          candidateAId: reviewTarget.id,
          candidateBId: personId,
          matchScore: String(reviewMatch.score),
          reasons: reviewMatch.reasons,
          decision: "review",
        });
      }

      existingPeople.push(await entitiesRepo.getPersonById(db, personId));
    }

    const employment = await entitiesRepo.ensureCurrentEmployment(db, {
      personId,
      companyId: company.id,
      rawTitle: draft.title ?? null,
      normalizedTitle: draft.title ? normalizeTitle(draft.title) : null,
      normalizedRole: draft.title ? normalizeTitle(draft.title) : null,
      confidence: String(draft.confidence),
    });
    if (!existingEmployments.some((row) => row.id === employment.id)) {
      existingEmployments.push(employment);
    }

    if (draft.email) {
      const normalizedEmail = normalizeEmail(draft.email);
      const existingContact = await entitiesRepo.findContactByNormalizedValue(
        db,
        "email",
        normalizedEmail,
      );
      if (!existingContact) {
        await entitiesRepo.createContactPoint(db, {
          personId,
          companyId: company.id,
          type: "email",
          rawValue: draft.email,
          normalizedValue: normalizedEmail,
          verificationStatus: "unverified",
          confidence: String(draft.confidence),
          freshness: "1",
        });
      }
    }

    if (draft.phone) {
      const normalizedPhone = draft.phone.replace(/\s+/g, "");
      const existingPhone = await entitiesRepo.findContactByNormalizedValue(
        db,
        "phone",
        normalizedPhone,
      );
      if (!existingPhone) {
        await entitiesRepo.createContactPoint(db, {
          personId,
          companyId: company.id,
          type: "phone",
          rawValue: draft.phone,
          normalizedValue: normalizedPhone,
          verificationStatus: "unverified",
          confidence: String(draft.confidence),
          freshness: "1",
        });
      }
    }

    if (draft.profileUrl) {
      const normalizedLinkedin = draft.profileUrl.toLowerCase();
      const existingLinkedin = await entitiesRepo.findContactByNormalizedValue(
        db,
        "linkedin",
        normalizedLinkedin,
      );
      if (!existingLinkedin) {
        await entitiesRepo.createContactPoint(db, {
          personId,
          companyId: company.id,
          type: "linkedin",
          rawValue: draft.profileUrl,
          normalizedValue: normalizedLinkedin,
          verificationStatus: "unverified",
          confidence: String(draft.confidence),
          freshness: "1",
        });
      }
    }

    if (draft.crustdataPersonId) {
      await entitiesRepo.upsertPersonExternalProfile(db, {
        personId,
        provider: "crustdata",
        providerPersonId: draft.crustdataPersonId,
        profileUrl: draft.profileUrl ?? null,
        normalizedProfileUrl: draft.profileUrl?.toLowerCase() ?? null,
      });
    }

    const signalObs = allObservations.filter(
      (obs) =>
        obs.entityType === "signal" &&
        obs.sourceDocumentId === draft.sourceDocumentId,
    );

    for (const signal of signalObs) {
      await entitiesRepo.createBusinessSignal(db, {
        companyId: company.id,
        signalType: signal.attribute,
        value: signal.rawValue,
        observedAt: signal.observedAt,
        confidence: signal.confidence,
        sourceDocumentId: draft.sourceDocumentId,
      });
    }

    resolvedPeople.push({ id: personId, draft });
    peopleResolved += 1;
  }

  const domainAlias = normalizeDomain(ctx.normalizedDomain);
  if (domainAlias) {
    const alias = await entitiesRepo.findCompanyByAlias(db, "domain", domainAlias);
    if (!alias) {
      await entitiesRepo.createCompanyAlias(db, {
        companyId: company.id,
        aliasType: "domain",
        aliasValue: ctx.domain,
        normalizedValue: domainAlias,
      });
    }
  }

  ctx.resolvedPersonIds = [...new Set(resolvedPeople.map((person) => person.id))];

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "resolving",
    peopleResolved,
  });

  return {
    stage: "resolving",
    success: true,
    metrics: { peopleResolved },
  };
}

export { collectPersonDrafts };
