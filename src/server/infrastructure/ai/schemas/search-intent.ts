import {
  type ConnectionsSearchIntent,
  type LeadsSearchIntent,
  type SearchIntent,
  type TimelineSearchIntent,
  searchIntentSchema,
} from "@/shared/contracts";
import { NaturalSearchError } from "@/server/application/search/natural-search-error";
import { z } from "zod";

/** Domain SearchIntent remains a discriminated union for app code. */
export const searchIntentOutputSchema = searchIntentSchema;

export type SearchIntentOutput = z.infer<typeof searchIntentOutputSchema>;

/**
 * Flat AI transport object for OpenAI structured outputs.
 * Top-level object with every field required; unused values are null.
 */
export const searchIntentAiTransportSchema = z.object({
  mode: z.enum(["leads", "timeline", "connections"]),
  roles: z.array(z.string()).nullable(),
  seniority: z.array(z.string()).nullable(),
  company: z.string().nullable(),
  scoreThreshold: z.number().min(0).max(100).nullable(),
  confidenceThreshold: z.number().min(0).max(1).nullable(),
  signalType: z.string().nullable(),
  personName: z.string().nullable(),
  currentCompany: z.string().nullable(),
  previousCompany: z.string().nullable(),
  companyA: z.string().nullable(),
  companyB: z.string().nullable(),
  minOverlapDays: z.number().int().positive().nullable(),
  dateRange: z
    .object({
      from: z.string().nullable(),
      to: z.string().nullable(),
    })
    .nullable(),
  sortBy: z.enum(["score", "confidence", "freshness", "name"]).nullable(),
  sortOrder: z.enum(["asc", "desc"]).nullable(),
});

export type SearchIntentAiTransport = z.infer<typeof searchIntentAiTransportSchema>;

export const SEARCH_INTENT_SCHEMA_VERSION = "search-intent.v3";

export const allowedSearchFields = [
  "mode",
  "roles",
  "seniority",
  "scoreThreshold",
  "confidenceThreshold",
  "company",
  "personName",
  "currentCompany",
  "previousCompany",
  "signalType",
  "companyA",
  "companyB",
  "minOverlapDays",
  "dateRange",
  "sortBy",
  "sortOrder",
] as const;

export type AllowedSearchField = (typeof allowedSearchFields)[number];

const MAX_STRING_LENGTH = 120;
const MAX_LIST_SIZE = 10;

function isNoiseString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/[a-z0-9]/i.test(trimmed)) return true;
  return /^(null|undefined|none|n\/a|-|\.)$/i.test(trimmed);
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return !isNoiseString(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) => isPresent(entry));
  }
  return true;
}

function normalizeString(value: string, field: string): string {
  const trimmed = value.trim();
  if (isNoiseString(trimmed)) {
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", `Empty value for ${field}`);
  }
  if (trimmed.length > MAX_STRING_LENGTH) {
    throw new NaturalSearchError(
      "SEARCH_NOT_UNDERSTOOD",
      `${field} exceeds ${MAX_STRING_LENGTH} characters`,
    );
  }
  return trimmed;
}

function optionalNormalizedString(
  value: string | null | undefined,
  field: string,
): string | undefined {
  if (value == null) return undefined;
  if (isNoiseString(value)) return undefined;
  return normalizeString(value, field);
}

function normalizeStringList(values: string[], field: string): string[] {
  const normalized = [
    ...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)),
  ];
  if (normalized.length === 0) {
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", `Empty value for ${field}`);
  }
  if (normalized.length > MAX_LIST_SIZE) {
    throw new NaturalSearchError(
      "SEARCH_NOT_UNDERSTOOD",
      `${field} exceeds ${MAX_LIST_SIZE} unique values`,
    );
  }
  for (const value of normalized) {
    if (value.length > MAX_STRING_LENGTH) {
      throw new NaturalSearchError(
        "SEARCH_NOT_UNDERSTOOD",
        `${field} value exceeds ${MAX_STRING_LENGTH} characters`,
      );
    }
  }
  return normalized;
}

function assertIsoDate(value: string, field: string): string {
  const trimmed = normalizeString(value, field);
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", `Invalid date for ${field}`);
  }
  return trimmed;
}

/**
 * Coerce common model mistakes into the correct mode fields, then drop leftover
 * mode-incompatible noise. Hard-reject only when a field cannot be remapped
 * (e.g. personName on leads).
 */
function coerceTransportForMode(transport: SearchIntentAiTransport): SearchIntentAiTransport {
  const next: SearchIntentAiTransport = { ...transport };

  if (next.mode === "timeline") {
    // Do not silently guess currentCompany from ambiguous company text.
    // Ambiguous timeline company relationships are handled by clarification in v2.
    next.company = null;
    next.roles = null;
    next.seniority = null;
    next.scoreThreshold = null;
    next.confidenceThreshold = null;
    next.signalType = null;
    next.dateRange = null;
    next.sortBy = null;
    next.sortOrder = null;
    next.companyA = null;
    next.companyB = null;
    next.minOverlapDays = null;
    return next;
  }

  if (next.mode === "connections") {
    if (!isPresent(next.companyA) && isPresent(next.company)) {
      next.companyA = next.company;
    }
    next.company = null;
    next.roles = null;
    next.seniority = null;
    next.scoreThreshold = null;
    next.confidenceThreshold = null;
    next.signalType = null;
    next.dateRange = null;
    next.sortBy = null;
    next.sortOrder = null;
    next.currentCompany = null;
    next.previousCompany = null;
    return next;
  }

  // leads: reject person/timeline/connection-only filters that cannot remap cleanly
  const forbidden: Array<keyof SearchIntentAiTransport> = [
    "personName",
    "currentCompany",
    "previousCompany",
    "companyA",
    "companyB",
    "minOverlapDays",
  ];
  const present = forbidden.filter((field) => isPresent(next[field]));
  if (present.length > 0) {
    throw new NaturalSearchError(
      "SEARCH_NOT_UNDERSTOOD",
      `Fields incompatible with mode=leads: ${present.join(", ")}`,
      { forbidden: present },
    );
  }
  return next;
}

function hasMeaningfulFilter(intent: SearchIntent): boolean {
  if (intent.mode === "leads") {
    return Boolean(
      intent.roles?.length ||
      intent.seniority?.length ||
      intent.company ||
      intent.scoreThreshold !== undefined ||
      intent.confidenceThreshold !== undefined ||
      intent.signalType ||
      intent.dateRange?.from ||
      intent.dateRange?.to,
    );
  }
  if (intent.mode === "timeline") {
    return Boolean(intent.personName || intent.currentCompany || intent.previousCompany);
  }
  return Boolean(intent.companyA);
}

export function mapAiTransportToSearchIntent(transport: SearchIntentAiTransport): SearchIntent {
  const coerced = coerceTransportForMode(transport);

  if (coerced.mode === "leads") {
    const intent: LeadsSearchIntent = { mode: "leads" };
    if (coerced.roles) intent.roles = normalizeStringList(coerced.roles, "roles");
    if (coerced.seniority) {
      intent.seniority = normalizeStringList(coerced.seniority, "seniority");
    }
    if (coerced.company) intent.company = normalizeString(coerced.company, "company");
    if (coerced.scoreThreshold !== null) intent.scoreThreshold = coerced.scoreThreshold;
    if (coerced.confidenceThreshold !== null) {
      intent.confidenceThreshold = coerced.confidenceThreshold;
    }
    if (coerced.signalType) {
      intent.signalType = normalizeString(coerced.signalType, "signalType");
    }
    if (coerced.dateRange) {
      const from = coerced.dateRange.from
        ? assertIsoDate(coerced.dateRange.from, "dateRange.from")
        : undefined;
      const to = coerced.dateRange.to
        ? assertIsoDate(coerced.dateRange.to, "dateRange.to")
        : undefined;
      if (from && to && Date.parse(from) > Date.parse(to)) {
        throw new NaturalSearchError(
          "SEARCH_NOT_UNDERSTOOD",
          "dateRange.from must be less than or equal to dateRange.to",
        );
      }
      if (from || to) intent.dateRange = { from, to };
    }
    if (coerced.sortBy) intent.sortBy = coerced.sortBy;
    if (coerced.sortOrder) intent.sortOrder = coerced.sortOrder;

    if (!hasMeaningfulFilter(intent)) {
      throw new NaturalSearchError(
        "SEARCH_NOT_UNDERSTOOD",
        "Search intent contained no meaningful filters",
      );
    }
    return intent;
  }

  if (coerced.mode === "timeline") {
    const intent: TimelineSearchIntent = {
      mode: "timeline",
      personName: optionalNormalizedString(coerced.personName, "personName"),
      currentCompany: optionalNormalizedString(coerced.currentCompany, "currentCompany"),
      previousCompany: optionalNormalizedString(coerced.previousCompany, "previousCompany"),
    };
    if (!hasMeaningfulFilter(intent)) {
      throw new NaturalSearchError(
        "SEARCH_NOT_UNDERSTOOD",
        "Search intent contained no meaningful filters",
      );
    }
    return intent;
  }

  if (!coerced.companyA) {
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", "connections mode requires companyA");
  }

  const intent: ConnectionsSearchIntent = {
    mode: "connections",
    companyA: normalizeString(coerced.companyA, "companyA"),
    companyB: coerced.companyB ? normalizeString(coerced.companyB, "companyB") : undefined,
    personName: coerced.personName ? normalizeString(coerced.personName, "personName") : undefined,
    minOverlapDays: coerced.minOverlapDays ?? undefined,
  };

  if (!hasMeaningfulFilter(intent)) {
    throw new NaturalSearchError(
      "SEARCH_NOT_UNDERSTOOD",
      "Search intent contained no meaningful filters",
    );
  }
  return intent;
}
