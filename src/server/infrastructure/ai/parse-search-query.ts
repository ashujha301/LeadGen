import type { SearchIntent } from "@/shared/contracts";
import type { Db } from "@/server/infrastructure/db";

import { createStructuredResponse } from "./client";
import { buildParseSearchQueryPrompt } from "./prompts/search";
import {
  SEARCH_INTENT_SCHEMA_VERSION,
  mapAiTransportToSearchIntent,
  searchIntentAiTransportSchema,
  type SearchIntentAiTransport,
} from "./schemas/search-intent";

export type ParseSearchQueryInput = {
  query: string;
  runId?: string;
  userId?: string;
  requestId?: string;
  db?: Db;
};

export type ParseSearchQueryResult =
  | { status: "success"; data: SearchIntent; responseId: string | null; durationMs: number }
  | { status: "disabled"; reason: string }
  | { status: "timeout"; error: string; durationMs: number; errorCategory: "timeout" }
  | {
      status: "unavailable";
      error: string;
      durationMs: number;
      errorCategory: "auth" | "invalid_model" | "disabled";
    }
  | {
      status: "service_unavailable";
      error: string;
      durationMs: number;
      errorCategory: "rate_limit" | "connection" | "provider_5xx";
    }
  | {
      status: "error";
      error: string;
      durationMs: number;
      errorCategory: "refusal" | "incomplete" | "malformed" | "unknown" | "invalid_intent";
    };

export async function parseSearchQuery(
  input: ParseSearchQueryInput,
): Promise<ParseSearchQueryResult> {
  const prompt = buildParseSearchQueryPrompt({
    query: input.query,
    runId: input.runId,
  });

  const result = await createStructuredResponse({
    operation: "parse_search_query",
    schema: searchIntentAiTransportSchema,
    schemaVersion: SEARCH_INTENT_SCHEMA_VERSION,
    prompt,
    runId: input.runId,
    userId: input.userId,
    requestId: input.requestId,
    db: input.db,
  });

  if (result.status !== "success") {
    return result;
  }

  try {
    const intent = mapAiTransportToSearchIntent(result.data as SearchIntentAiTransport);
    return {
      status: "success",
      data: intent,
      responseId: result.responseId,
      durationMs: result.durationMs,
    };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "invalid intent",
      durationMs: result.durationMs,
      errorCategory: "invalid_intent",
    };
  }
}
