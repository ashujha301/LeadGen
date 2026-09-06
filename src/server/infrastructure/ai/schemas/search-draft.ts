import { z } from "zod";

/**
 * Flat AI transport for OpenAI structured outputs (search-intent.v4).
 * Constraints carry explicit field/operator/rawValue; unused conceptual language
 * goes in semanticText. relationshipAmbiguous marks unresolved timeline company ties.
 */
export const searchDraftConstraintTransportSchema = z.object({
  field: z.enum([
    "role",
    "seniority",
    "company",
    "personName",
    "currentCompany",
    "previousCompany",
    "companyA",
    "companyB",
    "score",
    "confidence",
    "signalType",
    "dateRange",
    "minOverlapDays",
    "relationship",
  ]),
  operator: z.enum(["eq", "gt", "gte", "lt", "lte", "contains", "semantic_match"]),
  rawValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  source: z.literal("user"),
});

export const searchDraftAiTransportSchema = z.object({
  mode: z.enum(["leads", "timeline", "connections"]),
  constraints: z.array(searchDraftConstraintTransportSchema),
  semanticText: z.string().nullable(),
  sortBy: z.enum(["score", "confidence", "freshness", "name"]).nullable(),
  sortOrder: z.enum(["asc", "desc"]).nullable(),
  relationshipAmbiguous: z.boolean(),
});

export type SearchDraftAiTransport = z.infer<typeof searchDraftAiTransportSchema>;

export const SEARCH_DRAFT_SCHEMA_VERSION = "search-intent.v4";

export const allowedSearchDraftFields = [
  "mode",
  "constraints",
  "semanticText",
  "sortBy",
  "sortOrder",
  "relationshipAmbiguous",
] as const;
