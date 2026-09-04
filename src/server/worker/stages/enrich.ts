import {
  isEmailVerifierEnabled,
  mapEmailVerificationToObservations,
  verifyEmail,
} from "@/server/infrastructure/connectors";
import { buildEmailVerifySourceKey } from "@/server/domain/source-keys";
import {
  connectorAttemptsRepo,
  entitiesRepo,
  getDb,
  runsRepo,
  sourcesRepo,
} from "@/server/infrastructure/db";

import type { StageContext, StageResult } from "../jobs/process-run";
import { persistMappedObservations } from "./helpers";

export async function enrich(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  await runsRepo.updateRunStatus(db, ctx.runId, "enriching");

  let entitiesEnriched = 0;
  const company =
    (ctx.companyId ? await entitiesRepo.getCompanyById(db, ctx.companyId) : undefined) ??
    (await entitiesRepo.findCompanyByDomain(db, ctx.normalizedDomain));

  if (!company) {
    return {
      stage: "enriching",
      success: true,
      metrics: { entitiesEnriched: 0 },
    };
  }

  ctx.companyId = company.id;

  if (isEmailVerifierEnabled()) {
    const contacts = await entitiesRepo.getEmploymentsByCompanyId(db, company.id);
    for (const employment of contacts) {
      if (ctx.resolvedPersonIds?.length && !ctx.resolvedPersonIds.includes(employment.personId)) {
        continue;
      }

      const contactPoints = await entitiesRepo.getContactPointsByPersonId(db, employment.personId);
      for (const contact of contactPoints) {
        if (contact.type !== "email") {
          continue;
        }

        const verificationStarted = Date.now();
        const verification = await verifyEmail(contact.rawValue);
        await connectorAttemptsRepo.createConnectorAttempt(db, {
          runId: ctx.runId,
          connectorName: "email_verifier",
          endpoint: "/email/verify",
          status: verification.status === "success" ? "success" : "failed",
          durationMs: Date.now() - verificationStarted,
          errorCode: verification.status === "error" ? verification.error : null,
          recordsReturned: verification.status === "success" ? 1 : null,
          attempts: 1,
        });

        if (verification.status === "success") {
          const sourceKey = buildEmailVerifySourceKey(contact.normalizedValue);
          const upsert = await sourcesRepo.upsertSourceDocument(db, {
            runId: ctx.runId,
            sourceType: "email_verifier",
            sourceUrl: `email-verifier:${contact.normalizedValue}`,
            canonicalUrl: contact.normalizedValue,
            sourceKey,
            fetchedAt: new Date(),
            extractionStatus: "completed",
          });

          if (upsert.state !== "already_completed") {
            await persistMappedObservations(
              db,
              upsert.document.id,
              mapEmailVerificationToObservations(verification.data),
            );
            entitiesEnriched += 1;
          }
        }
      }
    }
  }

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "enriching",
  });

  return {
    stage: "enriching",
    success: true,
    metrics: { entitiesEnriched },
  };
}
