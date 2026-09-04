import { getEnv } from "@/shared/config/server";
import { enrichPerson, isCrustdataEnabled } from "@/server/infrastructure/connectors";
import { buildPersonEnrichSourceKey } from "@/server/domain/source-keys";
import { profileIdentityKey } from "@/server/domain/entity-resolution/person-drafts";
import { normalizeUrl } from "@/server/domain/normalization/url";
import {
  connectorAttemptsRepo,
  entitiesRepo,
  getDb,
  personExperienceMetrics,
  runsRepo,
  sourcesRepo,
} from "@/server/infrastructure/db";
import { eq } from "drizzle-orm";

import type { StageContext, StageResult } from "../jobs/process-run";
import { assertRunNotCanceled, getRunAbortSignal } from "../run-abort";

const MAX_ENRICH_PEOPLE = 25;

export async function enrichPersons(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  const env = getEnv();

  if (!isCrustdataEnabled() || !ctx.resolvedPersonIds?.length || !ctx.companyId) {
    return { stage: "enriching", success: true, metrics: { personsEnriched: 0 } };
  }

  await assertRunNotCanceled(ctx.runId);
  await runsRepo.updateRunStatus(db, ctx.runId, "enriching");

  const profileUrls: string[] = [];
  const personByProfileKey = new Map<string, string>();

  for (const personId of ctx.resolvedPersonIds.slice(0, MAX_ENRICH_PEOPLE)) {
    const contacts = await entitiesRepo.getContactPointsByPersonId(db, personId);
    const linkedin = contacts.find((contact) => contact.type === "linkedin");
    if (!linkedin?.rawValue) {
      continue;
    }
    const profileKey = profileIdentityKey(linkedin.rawValue);
    if (!profileKey || profileUrls.includes(linkedin.rawValue)) {
      continue;
    }
    profileUrls.push(linkedin.rawValue);
    personByProfileKey.set(profileKey, personId);
  }

  if (profileUrls.length === 0) {
    return { stage: "enriching", success: true, metrics: { personsEnriched: 0 } };
  }

  let personsEnriched = 0;
  const enrichedPersonIds: string[] = [];
  const startedAt = Date.now();
  const result = await enrichPerson(profileUrls, {
    timeoutMs: env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
    signal: getRunAbortSignal(ctx.runId),
  });

  await connectorAttemptsRepo.createConnectorAttempt(db, {
    runId: ctx.runId,
    connectorName: "crustdata_person_enrich",
    endpoint: "/person/enrich",
    status: result.status === "success" ? "success" : result.status === "disabled" ? "skipped" : "failed",
    durationMs: Date.now() - startedAt,
    errorCode: result.status === "error" ? result.error : null,
    recordsReturned: result.status === "success" ? result.data.length : null,
    attempts: 1,
  });

  if (result.status !== "success") {
    return { stage: "enriching", success: true, metrics: { personsEnriched: 0 } };
  }

  for (const personResult of result.data) {
    if (!personResult.linkedinUrl || personResult.status !== "matched") {
      continue;
    }

    const resultProfileKey = profileIdentityKey(personResult.linkedinUrl);
    const personId = resultProfileKey ? personByProfileKey.get(resultProfileKey) : undefined;
    if (!personId) {
      continue;
    }

    const normalizedProfile = normalizeUrl(personResult.linkedinUrl)?.toLowerCase() ?? personResult.linkedinUrl.toLowerCase();
    const sourceKey = buildPersonEnrichSourceKey(normalizedProfile);
    const upsert = await sourcesRepo.upsertSourceDocument(db, {
      runId: ctx.runId,
      sourceType: "crustdata",
      sourceUrl: "https://api.crustdata.com/person/enrich",
      canonicalUrl: personResult.linkedinUrl,
      sourceKey,
      responseStatus: 200,
      fetchedAt: new Date(),
      extractionStatus: "completed",
    });

    if (upsert.state !== "already_completed") {
      await sourcesRepo.updateExtractionStatus(db, upsert.document.id, "completed");
    }

    if (personResult.crustdataPersonId) {
      await entitiesRepo.upsertPersonExternalProfile(db, {
        personId,
        provider: "crustdata",
        providerPersonId: personResult.crustdataPersonId,
        profileUrl: personResult.linkedinUrl,
        normalizedProfileUrl: normalizedProfile,
        providerUpdatedAt: personResult.providerUpdatedAt
          ? new Date(personResult.providerUpdatedAt)
          : null,
      });
    }

    const totalMonths = personResult.providerExperienceYears
      ? Math.round(personResult.providerExperienceYears * 12)
      : null;

    const [existingMetrics] = await db
      .select()
      .from(personExperienceMetrics)
      .where(eq(personExperienceMetrics.personId, personId))
      .limit(1);

    const metricsInput = {
      providerExperienceYears: personResult.providerExperienceYears?.toString() ?? null,
      calculatedTotalMonths: totalMonths,
      experienceConfidence: "0.85",
    };

    if (existingMetrics) {
      await db
        .update(personExperienceMetrics)
        .set(metricsInput)
        .where(eq(personExperienceMetrics.personId, personId));
    } else {
      await db.insert(personExperienceMetrics).values({
        personId,
        ...metricsInput,
      });
    }

    personsEnriched += 1;
    enrichedPersonIds.push(personId);
  }

  ctx.enrichedPersonIds = enrichedPersonIds;

  return {
    stage: "enriching",
    success: true,
    metrics: { personsEnriched },
  };
}
