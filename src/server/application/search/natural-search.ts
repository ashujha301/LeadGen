import { parseSearchQuery } from "@/server/infrastructure/ai";
import type { NaturalSearchRequest, NaturalSearchResponse, SearchIntent } from "@/shared/contracts";
import type { Db } from "@/server/infrastructure/db";

import {
  buildSearchIntentSummary,
  executeConnectionsSearch,
  executeStructuredSearch,
  executeTimelineSearch,
  intentHasMeaningfulConstraint,
  NaturalSearchError,
  sanitizeSearchIntent,
} from "./structured-search";

export type NaturalSearchOptions = {
  db: Db;
  limit?: number;
  userId: string;
};

export async function runNaturalSearch(
  input: NaturalSearchRequest,
  options: NaturalSearchOptions,
): Promise<NaturalSearchResponse> {
  const parsed = await parseSearchQuery({
    query: input.query,
    runId: input.runId,
    db: options.db,
  });

  if (parsed.status === "disabled") {
    throw new NaturalSearchError(
      "AI_UNAVAILABLE",
      "Natural-language search requires OpenAI to be configured",
      { reason: parsed.reason },
    );
  }

  if (parsed.status === "timeout") {
    throw new NaturalSearchError("UPSTREAM_TIMEOUT", "OpenAI timed out while parsing the query");
  }

  if (parsed.status === "error") {
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", "Could not understand the search query", {
      error: parsed.error,
    });
  }

  let intent: SearchIntent;
  try {
    intent = sanitizeSearchIntent(parsed.data);
  } catch {
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", "Parsed search intent was invalid");
  }

  if (!intentHasMeaningfulConstraint(intent)) {
    throw new NaturalSearchError(
      "SEARCH_NOT_UNDERSTOOD",
      "Search intent contained no meaningful filters",
    );
  }

  const summary = buildSearchIntentSummary(intent);
  const interpretation = {
    intent,
    parser: "openai" as const,
    summary,
  };

  const searchOptions = {
    runId: input.runId,
    userId: options.userId,
    limit: options.limit ?? 20,
  };

  if (intent.mode === "timeline") {
    const items = await executeTimelineSearch(options.db, intent, searchOptions);
    return { interpretation, result: { kind: "timelines", items } };
  }

  if (intent.mode === "connections") {
    const items = await executeConnectionsSearch(options.db, intent, {
      runId: input.runId,
      userId: options.userId,
    });
    return { interpretation, result: { kind: "connections", items } };
  }

  const items = await executeStructuredSearch(options.db, intent, {
    runId: input.runId,
    userId: options.userId,
    limit: options.limit ?? 50,
  });
  return { interpretation, result: { kind: "leads", items } };
}

export { NaturalSearchError };
