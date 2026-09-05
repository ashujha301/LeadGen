import { getEnv } from "@/shared/config/server";
import { enrichPerson, isCrustdataEnabled } from "@/server/infrastructure/connectors";
import { buildPersonEnrichSourceKey } from "@/server/domain/source-keys";
import { profileIdentityKey } from "@/server/domain/entity-resolution/person-drafts";
import { normalizeUrl } from "@/server/domain/normalization/url";
import {
  connectorAttemptsRepo,
  entitiesRepo,
  getDb,
  runsRepo,
  sourcesRepo,
} from "@/server/infrastructure/db";
import { persistPersonEnrichment } from "@/server/application/services/persist-person-enrichment";

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
  const fetchedAt = new Date();
  const result = await enrichPerson(profileUrls, {
    timeoutMs: env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
    signal: getRunAbortSignal(ctx.runId),
  });

  await connectorAttemptsRepo.createConnectorAttempt(db, {
    runId: ctx.runId,
    connectorName: "crustdata_person_enrich",
    endpoint: "/person/enrich",
    status:
      result.status === "success" ? "success" : result.status === "disabled" ? "skipped" : "failed",
    durationMs: Date.now() - startedAt,
    errorCode: result.status === "error" ? result.error : null,
    recordsReturned: result.status === "success" ? result.data.length : null,
    attempts: 1,
  });

  if (result.status !== "success") {
    return { stage: "enriching", success: true, metrics: { personsEnriched: 0 } };
  }

  for (let index = 0; index < result.data.length; index += 1) {
    const personResult = result.data[index]!;
    const inputUrl = profileUrls[index] ?? null;
    const identityUrl = personResult.linkedinUrl ?? personResult.matchedOn ?? inputUrl;
    if (!identityUrl) {
      continue;
    }

    const resultProfileKey = profileIdentityKey(identityUrl);
    const personId = resultProfileKey ? personByProfileKey.get(resultProfileKey) : undefined;
    if (!personId) {
      continue;
    }

    const normalizedProfile = normalizeUrl(identityUrl)?.toLowerCase() ?? identityUrl.toLowerCase();
    const sourceKey = buildPersonEnrichSourceKey(normalizedProfile);
    const upsert = await sourcesRepo.upsertSourceDocument(db, {
      runId: ctx.runId,
      sourceType: "crustdata",
      sourceUrl: "https://api.crustdata.com/person/enrich",
      canonicalUrl: identityUrl,
      sourceKey,
      responseStatus: 200,
      fetchedAt,
      extractionStatus: "completed",
    });

    if (upsert.state !== "already_completed") {
      await sourcesRepo.updateExtractionStatus(db, upsert.document.id, "completed");
    }

    await persistPersonEnrichment({
      db,
      personId,
      enrichResult: personResult,
      runId: ctx.runId,
      fetchedAt,
      inputProfileUrl: inputUrl,
    });

    if (personResult.status === "matched") {
      personsEnriched += 1;
      enrichedPersonIds.push(personId);
    }
  }

  ctx.enrichedPersonIds = enrichedPersonIds;

  return {
    stage: "enriching",
    success: true,
    metrics: { personsEnriched },
  };
}
