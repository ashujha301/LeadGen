import { createHash } from "node:crypto";

export type ObservationFingerprintInput = {
  entityType: string;
  subjectKey?: string | null;
  attribute: string;
  normalizedValue?: string | null;
  rawValue: string;
  evidenceSpan?: { start: number; end: number; text: string } | null;
};

export function buildObservationFingerprint(input: ObservationFingerprintInput): string {
  const payload = JSON.stringify({
    entityType: input.entityType,
    subjectKey: input.subjectKey ?? null,
    attribute: input.attribute,
    normalizedValue: input.normalizedValue ?? null,
    rawValue: input.rawValue,
    evidenceSpan: input.evidenceSpan ?? null,
  });
  return createHash("sha256").update(payload).digest("hex");
}
