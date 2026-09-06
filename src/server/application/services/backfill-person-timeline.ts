import { entitiesRepo, getDb, userOwnsPerson } from "@/server/infrastructure/db";
import { enrichPerson, isCrustdataEnabled } from "@/server/infrastructure/connectors";
import { getEnv } from "@/shared/config/server";
import {
  persistPersonEnrichment,
  type PersistPersonEnrichmentResult,
} from "@/server/application/services/persist-person-enrichment";

export type BackfillPersonTimelineResult =
  | ({ ok: true } & PersistPersonEnrichmentResult)
  | {
      ok: false;
      code: "NOT_FOUND" | "VALIDATION_ERROR" | "SERVICE_UNAVAILABLE" | "UPSTREAM_ERROR";
      message: string;
      errorCode?: string;
    };

function resolveLinkedInUrl(input: {
  contacts: Array<{ type: string; rawValue: string }>;
  profileUrl: string | null | undefined;
}): string | null {
  const linkedin = input.contacts.find((contact) => contact.type === "linkedin");
  const candidate = linkedin?.rawValue ?? input.profileUrl ?? null;
  return candidate?.trim() ? candidate.trim() : null;
}

export async function backfillPersonTimeline(
  personId: string,
  userId: string,
): Promise<BackfillPersonTimelineResult> {
  const db = getDb();

  if (!(await userOwnsPerson(db, personId, userId))) {
    return { ok: false, code: "NOT_FOUND", message: "Person not found" };
  }

  if (!isCrustdataEnabled()) {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: "Crustdata enrichment is not enabled.",
    };
  }

  const person = await entitiesRepo.getPersonById(db, personId);
  if (!person) {
    return { ok: false, code: "NOT_FOUND", message: "Person not found" };
  }

  const contacts = await entitiesRepo.getContactPointsByPersonId(db, personId);
  const profileUrl = resolveLinkedInUrl({
    contacts,
    profileUrl: person.profileUrl,
  });
  if (!profileUrl) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "A LinkedIn profile URL is required to re-run Crustdata person enrich.",
    };
  }

  const env = getEnv();
  const result = await enrichPerson([profileUrl], {
    cacheBypass: true,
    timeoutMs: env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
  });

  if (result.status === "disabled") {
    return {
      ok: false,
      code: "SERVICE_UNAVAILABLE",
      message: result.reason,
    };
  }

  if (result.status === "error") {
    return {
      ok: false,
      code: "UPSTREAM_ERROR",
      message: result.error,
      errorCode: result.errorCode,
    };
  }

  const enrichResult = result.data[0];
  if (!enrichResult) {
    return {
      ok: false,
      code: "UPSTREAM_ERROR",
      message: "Crustdata returned no enrichment result for this profile.",
    };
  }

  const persisted = await persistPersonEnrichment({
    db,
    personId,
    enrichResult,
    fetchedAt: new Date(),
    inputProfileUrl: profileUrl,
  });

  return { ok: true, ...persisted };
}
