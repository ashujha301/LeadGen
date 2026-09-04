import { createHash } from "node:crypto";

import type { MappedObservation } from "@/server/infrastructure/connectors";
import type { Db, NewObservation } from "@/server/infrastructure/db";
import { buildObservationFingerprint } from "@/server/domain/observation-fingerprint";
import { sourcesRepo } from "@/server/infrastructure/db";

export { buildSubjectKey } from "@/server/domain";

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function extractTextExcerpt(html: string, maxLength = 2000): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLength);
}

export function extractPageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

export function isSameRegistrableDomain(urlString: string, normalizedDomain: string): boolean {
  try {
    const hostname = new URL(urlString).hostname.toLowerCase().replace(/^www\./, "");
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
  } catch {
    return false;
  }
}

export function isLeadershipPath(pathname: string): boolean {
  return /\/(about|team|leadership|company|people|staff|management|contact|careers)(\/|$)/i.test(
    pathname,
  );
}

export function isLeadershipLikePage(pathname: string, text: string): boolean {
  if (isLeadershipPath(pathname)) {
    return true;
  }

  return /\b(co-?founder|founder|chief executive officer|ceo|leadership|the team|our team|meet the|brains behind)\b/i.test(
    text,
  );
}

export function mappedToNewObservations(
  sourceDocumentId: string,
  mapped: MappedObservation[],
  observedAt: Date = new Date(),
  subjectKey?: string,
): NewObservation[] {
  return mapped.map((obs) => ({
    sourceDocumentId,
    entityType: obs.entityType,
    subjectKey: obs.subjectKey ?? subjectKey ?? null,
    attribute: obs.attribute,
    rawValue: obs.rawValue,
    normalizedValue: obs.normalizedValue ?? null,
    confidence: String(obs.confidence),
    observedAt,
    fingerprint: buildObservationFingerprint({
      entityType: obs.entityType,
      subjectKey: obs.subjectKey ?? subjectKey ?? null,
      attribute: obs.attribute,
      normalizedValue: obs.normalizedValue ?? null,
      rawValue: obs.rawValue,
      evidenceSpan: null,
    }),
  }));
}

export async function persistMappedObservations(
  db: Db,
  sourceDocumentId: string,
  mapped: MappedObservation[],
): Promise<number> {
  const rows = mappedToNewObservations(sourceDocumentId, mapped);
  if (rows.length === 0) {
    return 0;
  }
  await sourcesRepo.createObservations(db, rows);
  return rows.length;
}

export function toNumber(value: string | number | null | undefined): number {
  if (value == null) {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
