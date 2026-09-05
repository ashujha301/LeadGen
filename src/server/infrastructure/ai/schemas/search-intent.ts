import { searchIntentSchema } from "@/shared/contracts";
import { z } from "zod";

export const searchIntentOutputSchema = searchIntentSchema;

export type SearchIntentOutput = z.infer<typeof searchIntentOutputSchema>;

export const SEARCH_INTENT_SCHEMA_VERSION = "search-intent.v2";

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
