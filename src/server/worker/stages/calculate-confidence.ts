import {
  ageInDays,
  calculateFreshness,
  combineConfidence,
  type FreshnessCategory,
} from "@/server/domain";
import { getDb, entitiesRepo, runsRepo, sourcesRepo } from "@/server/infrastructure/db";

import type { StageContext, StageResult } from "../jobs/process-run";
import { toNumber } from "./helpers";

function freshnessCategory(entityType: string, attribute: string): FreshnessCategory {
  if (entityType === "contact" || attribute.includes("email") || attribute.includes("phone")) {
    return "contact";
  }
  if (entityType === "person" || entityType === "employment" || attribute === "title") {
    return "employment";
  }
  return "company";
}

export async function calculateConfidence(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  let confidenceCalculated = 0;

  const company =
    (ctx.companyId ? await entitiesRepo.getCompanyById(db, ctx.companyId) : undefined) ??
    (await entitiesRepo.findCompanyByDomain(db, ctx.normalizedDomain));

  if (!company) {
    return {
      stage: "enriching",
      success: true,
      metrics: { confidenceCalculated: 0 },
    };
  }

  const observations = await sourcesRepo.getObservationsByRunId(db, ctx.runId);
  const companyObs = observations.filter((obs) => obs.entityType === "company");

  if (companyObs.length > 0) {
    const sources = companyObs.map((obs) => ({
      sourceConfidence: toNumber(obs.confidence),
      freshness: calculateFreshness(
        ageInDays(obs.observedAt),
        freshnessCategory(obs.entityType, obs.attribute),
      ),
    }));

    const confidence = combineConfidence(sources);
    const freshness = Math.max(...sources.map((source) => source.freshness));
    await entitiesRepo.updateCompany(db, company.id, {
      confidence: String(confidence),
      freshness: String(freshness),
    });
    confidenceCalculated += 1;
  }

  const employments = await entitiesRepo.getEmploymentsByCompanyId(db, company.id);
  for (const employment of employments) {
    const person = await entitiesRepo.getPersonById(db, employment.personId);
    if (!person) {
      continue;
    }

    const personObs = observations.filter(
      (obs) =>
        obs.entityType === "person" ||
        (obs.entityType === "contact" &&
          (obs.attribute === "email" || obs.attribute === "profile_url")),
    );

    const sources = personObs.map((obs) => ({
      sourceConfidence: toNumber(obs.confidence),
      freshness: calculateFreshness(
        ageInDays(obs.observedAt),
        freshnessCategory(obs.entityType, obs.attribute),
      ),
    }));

    if (sources.length === 0) {
      continue;
    }

    const confidence = combineConfidence(sources);
    const freshness = Math.max(...sources.map((source) => source.freshness));

    await entitiesRepo.updatePerson(db, person.id, {
      confidence: String(confidence),
      freshness: String(freshness),
    });

    confidenceCalculated += 1;
  }

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "enriching",
  });

  return {
    stage: "enriching",
    success: true,
    metrics: { confidenceCalculated },
  };
}
