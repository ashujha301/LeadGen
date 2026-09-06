import type { NaturalSearchRequest } from "@/shared/contracts";
import type { NaturalSearchV2Response } from "@/shared/contracts/natural-search-v2";
import type { Db } from "@/server/infrastructure/db";
import { parseSearchDraftPlan } from "@/server/infrastructure/ai/parse-search-draft";
import {
  buildCanonicalPlanFromDraft,
  mapDraftConstraintsFromTransport,
  type CanonicalSearchPlan,
  type DraftSearchPlan,
  type DraftSearchPlanTransport,
} from "./canonical-plan";
import { NaturalSearchError } from "./natural-search-error";
import { resolveAndExecuteNaturalSearch } from "./resolve-and-execute";

export type NaturalSearchV2Deps = {
  parseDraft: (input: {
    query: string;
    runId?: string;
    userId: string;
    requestId?: string;
    db: Db;
  }) => Promise<DraftSearchPlanTransport>;
  resolveAndExecute: (
    plan: CanonicalSearchPlan,
    context: {
      query: string;
      runId?: string;
      userId: string;
      requestId?: string;
      db: Db;
    },
  ) => Promise<NaturalSearchV2Response>;
};

export type NaturalSearchV2Options = {
  db: Db;
  userId: string;
  requestId?: string;
  limit?: number;
  deps?: Partial<NaturalSearchV2Deps>;
};

/**
 * Conversational NL search entrypoint: draft intent -> resolve -> execute or clarify.
 */
export async function runNaturalSearchV2(
  input: NaturalSearchRequest,
  options: NaturalSearchV2Options,
): Promise<NaturalSearchV2Response & { plan?: CanonicalSearchPlan }> {
  const parseDraft = options.deps?.parseDraft ?? parseSearchDraftPlan;
  const resolveAndExecute = options.deps?.resolveAndExecute ?? resolveAndExecuteNaturalSearch;

  let draft: DraftSearchPlan;
  try {
    const transport = await parseDraft({
      query: input.query,
      runId: input.runId,
      userId: options.userId,
      requestId: options.requestId,
      db: options.db,
    });
    draft = mapDraftConstraintsFromTransport(transport, { limit: options.limit });
  } catch (error) {
    if (error instanceof NaturalSearchError) throw error;
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", "Could not understand the search query");
  }

  const plan = buildCanonicalPlanFromDraft(draft);
  const response = await resolveAndExecute(plan, {
    query: input.query,
    runId: input.runId,
    userId: options.userId,
    requestId: options.requestId,
    db: options.db,
  });

  if (response.status === "completed") {
    return { ...response, plan };
  }
  return response;
}
