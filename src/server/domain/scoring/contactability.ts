import { REASON_CODES, type ReasonCode } from "./reason-codes";
import { SCORE_COMPONENT_KEYS, SCORE_COMPONENT_LABELS, getScoreComponentMax } from "./score-config";
import type { ScoreComponentResult } from "./acquisition-score";
import {
  isUsableEmail,
  isUsablePhone,
  isUsableProfileUrl,
} from "@/server/domain/entity-resolution/contact-identity";

export type ContactPointInput = {
  type: "email" | "phone" | "linkedin" | "other";
  value: string;
  verificationStatus?: "verified" | "unverified" | "invalid" | "disabled";
  confidence?: number;
};

export type ContactabilityInput = {
  contacts: ContactPointInput[];
};

/**
 * Contactability scoring (max 15) based on available and verified contact channels.
 */
export function scoreContactability(
  input: ContactabilityInput,
  scoreVersion = 1,
): ScoreComponentResult {
  const max = getScoreComponentMax(SCORE_COMPONENT_KEYS.contactability, scoreVersion);
  let rawValue = 0;
  let reasonCode: ReasonCode = REASON_CODES.contact.none;

  const emails = input.contacts.filter(
    (contact) => contact.type === "email" && isUsableEmail(contact.value),
  );
  const phones = input.contacts.filter(
    (contact) => contact.type === "phone" && isUsablePhone(contact.value),
  );
  const linkedins = input.contacts.filter(
    (contact) => contact.type === "linkedin" && isUsableProfileUrl(contact.value),
  );

  const verifiedEmail = emails.find((contact) => contact.verificationStatus === "verified");
  const unverifiedEmail = emails.find((contact) => contact.verificationStatus !== "invalid");

  if (verifiedEmail) {
    rawValue = max;
    reasonCode = REASON_CODES.contact.verifiedEmail;
  } else if (unverifiedEmail) {
    rawValue = max * 0.75;
    reasonCode = REASON_CODES.contact.unverifiedEmail;
  } else if (phones.length > 0) {
    rawValue = max * 0.55;
    reasonCode = REASON_CODES.contact.phone;
  } else if (linkedins.length > 0) {
    rawValue = max * 0.4;
    reasonCode = REASON_CODES.contact.linkedin;
  }

  return {
    key: SCORE_COMPONENT_KEYS.contactability,
    weight: getScoreComponentMax(SCORE_COMPONENT_KEYS.contactability, scoreVersion),
    rawValue: round(rawValue / max, 4),
    contribution: round(rawValue),
    reasonCode,
    label: SCORE_COMPONENT_LABELS[SCORE_COMPONENT_KEYS.contactability],
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
