import { z } from "zod";
import {
  draftSearchConstraintSchema,
  type DraftSearchConstraint,
  type SearchConstraintField,
  type SearchConstraintOperator,
} from "@/shared/contracts/natural-search-v2";
import { NaturalSearchError } from "@/server/application/search/natural-search-error";

const MAX_STRING_LENGTH = 120;
const MAX_CONSTRAINTS = 20;
const MAX_LIMIT = 50;

export const draftSearchPlanTransportSchema = z.object({
  mode: z.enum(["leads", "timeline", "connections"]),
  constraints: z.array(draftSearchConstraintSchema).max(MAX_CONSTRAINTS),
  semanticText: z.string().max(500).nullable(),
  sortBy: z.enum(["score", "confidence", "freshness", "name"]).nullable(),
  sortOrder: z.enum(["asc", "desc"]).nullable(),
  relationshipAmbiguous: z.boolean(),
});

export type DraftSearchPlanTransport = z.infer<typeof draftSearchPlanTransportSchema>;

export type DraftSearchPlan = {
  mode: "leads" | "timeline" | "connections";
  constraints: DraftSearchConstraint[];
  semanticText: string | null;
  sortBy: "score" | "confidence" | "freshness" | "name" | null;
  sortOrder: "asc" | "desc" | null;
  relationshipAmbiguous: boolean;
  limit: number;
};

export type ResolvedEntityRef = {
  id: string;
  label: string;
  matchStrategy: string;
};

export type CanonicalSearchPlan = DraftSearchPlan & {
  resolved: {
    companyIds?: string[];
    personIds?: string[];
    companyAIds?: string[];
    companyBIds?: string[];
    roleTitles?: string[];
    roleAliases?: string[];
    relationship?: "current" | "previous" | "lead" | "overlap";
  };
  resolvedLabels: Array<{
    field: string;
    label: string;
    operator?: SearchConstraintOperator;
    rawValue?: string | number | boolean | null;
    matchStrategy?: string;
  }>;
};

function isNoiseString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/[a-z0-9]/i.test(trimmed)) return true;
  return /^(null|undefined|none|n\/a|-|\.)$/i.test(trimmed);
}

function normalizeRawValue(
  value: DraftSearchConstraint["rawValue"],
  field: SearchConstraintField,
): DraftSearchConstraint["rawValue"] {
  if (typeof value === "string") {
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
  return value;
}

const LEADS_FIELDS = new Set<SearchConstraintField>([
  "role",
  "seniority",
  "company",
  "score",
  "confidence",
  "signalType",
  "dateRange",
]);

const TIMELINE_FIELDS = new Set<SearchConstraintField>([
  "personName",
  "currentCompany",
  "previousCompany",
  "relationship",
  "company",
]);

const CONNECTIONS_FIELDS = new Set<SearchConstraintField>([
  "companyA",
  "companyB",
  "personName",
  "minOverlapDays",
]);

function assertModeCompatible(mode: DraftSearchPlan["mode"], field: SearchConstraintField): void {
  const allowed =
    mode === "leads" ? LEADS_FIELDS : mode === "timeline" ? TIMELINE_FIELDS : CONNECTIONS_FIELDS;
  if (!allowed.has(field)) {
    throw new NaturalSearchError(
      "SEARCH_NOT_UNDERSTOOD",
      `Field ${field} incompatible with mode=${mode}`,
    );
  }
}

/**
 * Convert AI transport draft into a validated server-owned draft plan.
 * Does not invent signalType/seniority/dates; keeps only explicit constraints.
 * For timeline, leaves ambiguous company on field=company and sets relationshipAmbiguous
 * rather than guessing currentCompany.
 */
export function mapDraftConstraintsFromTransport(
  transport: DraftSearchPlanTransport,
  options?: { limit?: number },
): DraftSearchPlan {
  const constraints: DraftSearchConstraint[] = [];

  for (const constraint of transport.constraints) {
    assertModeCompatible(transport.mode, constraint.field);
    if (constraint.source !== "user" && constraint.source !== "derived") {
      throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", "Invalid constraint source");
    }
    constraints.push({
      field: constraint.field,
      operator: constraint.operator,
      rawValue: normalizeRawValue(constraint.rawValue, constraint.field),
      source: constraint.source,
    });
  }

  let relationshipAmbiguous = transport.relationshipAmbiguous;
  if (transport.mode === "timeline") {
    const hasCompany = constraints.some((c) => c.field === "company");
    const hasCurrent = constraints.some((c) => c.field === "currentCompany");
    const hasPrevious = constraints.some((c) => c.field === "previousCompany");
    if (hasCompany && !hasCurrent && !hasPrevious) {
      relationshipAmbiguous = true;
    }
  }

  const semanticText =
    transport.semanticText && !isNoiseString(transport.semanticText)
      ? transport.semanticText.trim()
      : null;

  if (constraints.length === 0 && !semanticText) {
    throw new NaturalSearchError(
      "SEARCH_NOT_UNDERSTOOD",
      "Search intent contained no meaningful filters",
    );
  }

  return {
    mode: transport.mode,
    constraints,
    semanticText,
    sortBy: transport.sortBy,
    sortOrder: transport.sortOrder,
    relationshipAmbiguous,
    limit: Math.min(Math.max(options?.limit ?? 50, 1), MAX_LIMIT),
  };
}

export function buildCanonicalPlanFromDraft(
  draft: DraftSearchPlan,
  resolved: CanonicalSearchPlan["resolved"] = {},
  resolvedLabels: CanonicalSearchPlan["resolvedLabels"] = [],
): CanonicalSearchPlan {
  return {
    ...draft,
    resolved,
    resolvedLabels:
      resolvedLabels.length > 0
        ? resolvedLabels
        : draft.constraints
            .filter((c) => c.source === "user")
            .map((c) => ({
              field: c.field,
              label: String(c.rawValue ?? c.field),
              operator: c.operator,
              rawValue: c.rawValue,
            })),
  };
}
