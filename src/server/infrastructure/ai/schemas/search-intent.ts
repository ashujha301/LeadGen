import { searchIntentSchema } from "@/shared/contracts";
import { z } from "zod";

export const searchIntentOutputSchema = searchIntentSchema;

export type SearchIntentOutput = z.infer<typeof searchIntentOutputSchema>;

export const SEARCH_INTENT_SCHEMA_VERSION = "search-intent.v1";

export const allowedSearchFields = [
  "roles",
  "seniority",
  "scoreThreshold",
  "confidenceThreshold",
  "company",
  "previousCompany",
  "signalType",
  "employmentOverlap",
  "dateRange",
  "sortBy",
  "sortOrder",
] as const;

export type AllowedSearchField = (typeof allowedSearchFields)[number];
