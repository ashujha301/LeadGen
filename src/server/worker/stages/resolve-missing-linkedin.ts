import {
  isCrustdataEnabled,
  searchPersonByNameAndCompany,
} from "@/server/infrastructure/connectors";
import { connectorAttemptsRepo, entitiesRepo, getDb, runsRepo } from "@/server/infrastructure/db";
import { getEnv } from "@/shared/config/server";

import type { StageContext, StageResult } from "../jobs/process-run";
import { assertRunNotCanceled, getRunAbortSignal } from "../run-abort";

const MAX_LINKEDIN_LOOKUPS = 10;

export async function resolveMissingLinkedInProfiles(ctx: StageContext): Promise<StageResult> {
  const db = getDb();

  if (!isCrustdataEnabled() || !ctx.resolvedPersonIds?.length || !ctx.companyId) {
    return { stage: "resolving", success: true, metrics: { linkedinProfilesResolved: 0 } };
  }

  const env = getEnv();
  const abortSignal = getRunAbortSignal(ctx.runId);
  let linkedinProfilesResolved = 0;
  let lookups = 0;

  for (const personId of ctx.resolvedPersonIds) {
    await assertRunNotCanceled(ctx.runId);

    if (lookups >= MAX_LINKEDIN_LOOKUPS) {
      break;
    }

    const contacts = await entitiesRepo.getContactPointsByPersonId(db, personId);
    if (contacts.some((contact) => contact.type === "linkedin")) {
      continue;
    }

    const person = await entitiesRepo.getPersonById(db, personId);
    if (!person?.name?.trim()) {
      continue;
    }

    lookups += 1;
    const startedAt = Date.now();
    const result = await searchPersonByNameAndCompany(person.name, ctx.normalizedDomain, {
      timeoutMs: env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
      signal: abortSignal,
    });

    await connectorAttemptsRepo.createConnectorAttempt(db, {
      runId: ctx.runId,
      connectorName: "crustdata_person_search",
      endpoint: "/person/search",
      status:
        result.status === "success" ? "success" : result.status === "disabled" ? "skipped" : "failed",
      durationMs: Date.now() - startedAt,
      errorCode: result.status === "error" ? result.error : null,
      recordsReturned: result.status === "success" && result.data ? 1 : 0,
      attempts: 1,
    });

    if (result.status !== "success" || !result.data?.linkedinUrl) {
      continue;
    }

    const normalizedLinkedin = result.data.linkedinUrl.toLowerCase();
    const existingLinkedin = await entitiesRepo.findContactByNormalizedValue(
      db,
      "linkedin",
      normalizedLinkedin,
    );
    if (!existingLinkedin) {
      await entitiesRepo.createContactPoint(db, {
        personId,
        companyId: ctx.companyId,
        type: "linkedin",
        rawValue: result.data.linkedinUrl,
        normalizedValue: normalizedLinkedin,
        verificationStatus: "unverified",
        confidence: "0.75",
        freshness: "1",
      });
    }

    if (result.data.crustdataPersonId) {
      await entitiesRepo.upsertPersonExternalProfile(db, {
        personId,
        provider: "crustdata",
        providerPersonId: result.data.crustdataPersonId,
        profileUrl: result.data.linkedinUrl,
        normalizedProfileUrl: normalizedLinkedin,
      });
    }

    linkedinProfilesResolved += 1;
  }

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "resolving",
    peopleResolved: linkedinProfilesResolved,
  });

  return {
    stage: "resolving",
    success: true,
    metrics: { linkedinProfilesResolved },
  };
}
