import type { NormalizedPageExtraction } from "@/shared/contracts";
import { normalizePageExtraction } from "@/shared/contracts/observation";
import type { Db } from "@/server/infrastructure/db";

import { createStructuredResponse } from "./client";
import { buildExtractPagePrompt } from "./prompts/extract";
import {
  PAGE_EXTRACTION_SCHEMA_VERSION,
  pageExtractionOutputSchema,
} from "./schemas/page-extraction";

export type ExtractPageInput = {
  sourceUrl: string;
  pageTitle?: string;
  cleanedText: string;
  runId?: string;
  db?: Db;
  signal?: AbortSignal;
};

export type ExtractPageResult =
  | {
      status: "success";
      data: NormalizedPageExtraction;
      responseId: string | null;
      durationMs: number;
    }
  | { status: "disabled"; reason: string }
  | { status: "error"; error: string; durationMs: number };

export async function extractPage(input: ExtractPageInput): Promise<ExtractPageResult> {
  const prompt = buildExtractPagePrompt({
    sourceUrl: input.sourceUrl,
    pageTitle: input.pageTitle,
    cleanedText: input.cleanedText.slice(0, 12_000),
  });

  const result = await createStructuredResponse({
    operation: "extract_page",
    schema: pageExtractionOutputSchema,
    schemaVersion: PAGE_EXTRACTION_SCHEMA_VERSION,
    prompt,
    runId: input.runId,
    db: input.db,
    signal: input.signal,
  });

  if (result.status !== "success") {
    if (result.status === "disabled") {
      return result;
    }
    return {
      status: "error",
      error: result.error,
      durationMs: result.durationMs,
    };
  }

  return {
    ...result,
    data: normalizePageExtraction(result.data),
  };
}
