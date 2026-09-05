import type { SearchIntent } from "@/shared/contracts";
import type { Db } from "@/server/infrastructure/db";

import { createStructuredResponse } from "./client";
import { buildParseSearchQueryPrompt } from "./prompts/search";
import { SEARCH_INTENT_SCHEMA_VERSION, searchIntentOutputSchema } from "./schemas/search-intent";

export type ParseSearchQueryInput = {
  query: string;
  runId?: string;
  db?: Db;
};

export type ParseSearchQueryResult =
  | { status: "success"; data: SearchIntent; responseId: string | null; durationMs: number }
  | { status: "disabled"; reason: string }
  | { status: "timeout"; error: string; durationMs: number }
  | { status: "error"; error: string; durationMs: number };

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
    return { status: "disabled", reason: result.reason };
  }

  if (result.status === "timeout") {
    return { status: "timeout", error: result.error, durationMs: result.durationMs };
  }

  if (result.status === "error") {
    return { status: "error", error: result.error, durationMs: result.durationMs };
  }

  return result;
}
