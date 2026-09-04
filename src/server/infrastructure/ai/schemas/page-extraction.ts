import { pageExtractionSchema } from "@/shared/contracts";
import { z } from "zod";

export const pageExtractionOutputSchema = pageExtractionSchema;

export type PageExtractionOutput = z.infer<typeof pageExtractionOutputSchema>;

export const PAGE_EXTRACTION_SCHEMA_VERSION = "page-extraction.v1";
