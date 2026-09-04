import { parseSearchQuery } from "@/server/infrastructure/ai";
import type { NaturalSearchRequest, NaturalSearchResponse, SearchIntent } from "@/shared/contracts";
import type { Db } from "@/server/infrastructure/db";

import {
  executeStructuredSearch,
  sanitizeSearchIntent,
  type StructuredSearchResult,
} from "./structured-search";

export type NaturalSearchOptions = {
  db: Db;
  limit?: number;
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

  const intent = sanitizeSearchIntent(parsed.status === "success" ? parsed.data : {});
  const results = await executeStructuredSearch(options.db, intent, {
    runId: input.runId,
    limit: options.limit ?? 50,
  });

  return {
    intent,
    results,
  };
}

export async function parseAndSearch(
  query: string,
  db: Db,
  runId?: string,
): Promise<{ intent: SearchIntent; results: StructuredSearchResult[] }> {
  const parsed = await parseSearchQuery({ query, runId, db });
  const intent = sanitizeSearchIntent(parsed.status === "success" ? parsed.data : {});

  const results = await executeStructuredSearch(db, intent, {
    runId,
    limit: 50,
  });

  return { intent, results };
}
