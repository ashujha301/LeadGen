import { normalizeDomain, normalizeName, normalizeTitle, normalizeUrl } from "@/server/domain";
import { getDb, runsRepo, sourcesRepo } from "@/server/infrastructure/db";

import type { StageContext, StageResult } from "../jobs/process-run";

function normalizeObservationValue(
  entityType: string,
  attribute: string,
  rawValue: string,
): string | null {
  if (attribute === "email") {
    return rawValue.trim().toLowerCase();
  }

  if (attribute === "phone") {
    return rawValue.replace(/\s+/g, "");
  }

  if (attribute === "profile_url") {
    return normalizeUrl(rawValue);
  }

  if (attribute === "name") {
    return normalizeName(rawValue);
  }

  if (attribute === "title") {
    return normalizeTitle(rawValue);
  }

  if (entityType === "company" && attribute.includes("domain")) {
    return normalizeDomain(rawValue);
  }

  return rawValue.trim().toLowerCase();
}

export async function normalize(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  const rows = await sourcesRepo.getObservationsByRunId(db, ctx.runId);
  let observationsNormalized = 0;

  for (const observation of rows) {
    const normalizedValue = normalizeObservationValue(
      observation.entityType,
      observation.attribute,
      observation.rawValue,
    );

    if (normalizedValue && normalizedValue !== observation.normalizedValue) {
      await sourcesRepo.updateObservationNormalizedValue(db, observation.id, normalizedValue);
      observationsNormalized += 1;
    }
  }

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "extracting",
  });

  return {
    stage: "extracting",
    success: true,
    metrics: { observationsNormalized },
  };
}
