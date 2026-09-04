import type { SearchIntent } from "@/shared/contracts";
import type { Db } from "@/server/infrastructure/db";

import { createStructuredResponse } from "./client";
import { buildParseSearchQueryPrompt } from "./prompts/search";
import {
  SEARCH_INTENT_SCHEMA_VERSION,
  searchIntentOutputSchema,
} from "./schemas/search-intent";

export type ParseSearchQueryInput = {
  query: string;
  runId?: string;
  db?: Db;
};

export type ParseSearchQueryResult =
  | { status: "success"; data: SearchIntent; responseId: string | null; durationMs: number }
  | { status: "disabled"; reason: string }
  | { status: "error"; error: string; durationMs: number };

function fallbackParseSearchQuery(query: string): SearchIntent {
  const normalized = query.toLowerCase();

  return {
    roles: /\b(ceo|founder|owner|president|vp sales|head of sales)\b/.test(normalized)
      ? normalized.match(/\b(ceo|founder|owner|president|vp sales|head of sales)\b/g) ?? undefined
      : undefined,
    scoreThreshold: normalized.includes("high score") ? 70 : undefined,
    confidenceThreshold: normalized.includes("high confidence") ? 0.8 : undefined,
    sortBy: "score",
    sortOrder: "desc",
  };
}

export async function parseSearchQuery(
  input: ParseSearchQueryInput,
): Promise<ParseSearchQueryResult> {
  const prompt = buildParseSearchQueryPrompt({
    query: input.query,
    runId: input.runId,
  });

  const result = await createStructuredResponse({
    operation: "parse_search_query",
    schema: searchIntentOutputSchema,
    schemaVersion: SEARCH_INTENT_SCHEMA_VERSION,
    prompt,
    runId: input.runId,
    db: input.db,
  });

  if (result.status === "disabled") {
    return {
      status: "success",
      data: fallbackParseSearchQuery(input.query),
      responseId: null,
      durationMs: 0,
    };
  }

  if (result.status === "error") {
    return {
      status: "success",
      data: fallbackParseSearchQuery(input.query),
      responseId: null,
      durationMs: result.durationMs,
    };
  }

  return result;
}

export { fallbackParseSearchQuery };
