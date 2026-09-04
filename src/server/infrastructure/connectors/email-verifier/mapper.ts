import type { EmailVerificationResult, MappedObservation } from "../types";

export function mapEmailVerificationToObservations(
  result: EmailVerificationResult,
): MappedObservation[] {
  return [
    {
      entityType: "contact",
      attribute: "email_verification_status",
      rawValue: result.status,
      normalizedValue: result.email,
      confidence: result.status === "verified" ? 0.9 : result.status === "invalid" ? 0.85 : 0.5,
    },
  ];
}
