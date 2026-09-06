import type { Db } from "@/server/infrastructure/db";
import type { DraftSearchPlanTransport } from "@/server/application/search/canonical-plan";
import { NaturalSearchError } from "@/server/application/search/natural-search-error";

import { createStructuredResponse } from "./client";
import { buildParseSearchDraftPrompt } from "./prompts/search-draft";
import {
  SEARCH_DRAFT_SCHEMA_VERSION,
  searchDraftAiTransportSchema,
  type SearchDraftAiTransport,
} from "./schemas/search-draft";

export type ParseSearchDraftInput = {
  query: string;
  runId?: string;
  userId: string;
  requestId?: string;
  db: Db;
};

export async function parseSearchDraftPlan(
  input: ParseSearchDraftInput,
): Promise<DraftSearchPlanTransport> {
  const prompt = buildParseSearchDraftPrompt({
    query: input.query,
    runId: input.runId,
  });

  const result = await createStructuredResponse({
    operation: "parse_search_query",
    schema: searchDraftAiTransportSchema,
    schemaVersion: SEARCH_DRAFT_SCHEMA_VERSION,
    prompt,
    runId: input.runId,
    userId: input.userId,
    requestId: input.requestId,
    db: input.db,
  });

  if (result.status === "disabled") {
    throw new NaturalSearchError(
      "AI_UNAVAILABLE",
      "Natural-language search requires OpenAI to be configured",
      { reason: result.reason },
    );
  }
  if (result.status === "unavailable") {
    throw new NaturalSearchError(
      "AI_UNAVAILABLE",
      "Natural-language search is temporarily unavailable",
      { category: result.errorCategory },
    );
  }
  if (result.status === "timeout") {
    throw new NaturalSearchError("UPSTREAM_TIMEOUT", "OpenAI timed out while parsing the query");
  }
  if (result.status === "service_unavailable") {
    throw new NaturalSearchError(
      "SERVICE_UNAVAILABLE",
      "Search provider is temporarily unavailable",
      { category: result.errorCategory },
    );
  }
  if (result.status === "error") {
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", "Could not understand the search query", {
      category: result.errorCategory,
    });
  }

  const transport = result.data as SearchDraftAiTransport;
  return {
    mode: transport.mode,
    constraints: transport.constraints.map((c) => ({
      field: c.field,
      operator: c.operator,
      rawValue: c.rawValue,
      source: "user" as const,
    })),
    semanticText: transport.semanticText,
    sortBy: transport.sortBy,
    sortOrder: transport.sortOrder,
    relationshipAmbiguous: transport.relationshipAmbiguous,
  };
}
