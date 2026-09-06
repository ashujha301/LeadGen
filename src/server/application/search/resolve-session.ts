import { and, eq, sql } from "drizzle-orm";

import type {
  NaturalSearchResolveRequest,
  NaturalSearchV2Response,
} from "@/shared/contracts/natural-search-v2";
import type { Db } from "@/server/infrastructure/db";
import { naturalSearchSessions } from "@/server/infrastructure/db/schema";
import { buildCanonicalPlanFromDraft, type CanonicalSearchPlan } from "./canonical-plan";
import { MAX_CLARIFICATION_ROUNDS, SESSION_TTL_MS } from "./clarification/session";
import { NaturalSearchError } from "./natural-search-error";
import { resolveAndExecuteNaturalSearch } from "./resolve-and-execute";

type StoredPlan = CanonicalSearchPlan & {
  optionLookup?: Record<string, { slot: string; entityId?: string; value?: string }>;
};

function applyWidening(plan: StoredPlan, wideningOptionId: string): CanonicalSearchPlan {
  const constraints = [...plan.constraints];

  if (wideningOptionId === "widen-drop-optional") {
    const filtered = constraints.filter((c) => c.field !== "signalType" && c.field !== "dateRange");
    return buildCanonicalPlanFromDraft(
      { ...plan, constraints: filtered, relationshipAmbiguous: false },
      plan.resolved,
      plan.resolvedLabels,
    );
  }

  if (wideningOptionId === "widen-threshold") {
    const score = constraints.find((c) => c.field === "score");
    if (score && typeof score.rawValue === "number") {
      const lowered = Math.max(0, Math.floor(score.rawValue * 0.75));
      const filtered = constraints.filter((c) => c.field !== "score");
      filtered.push({
        field: "score",
        operator: score.operator,
        rawValue: lowered,
        source: "user",
      });
      return buildCanonicalPlanFromDraft(
        { ...plan, constraints: filtered, relationshipAmbiguous: false },
        plan.resolved,
        plan.resolvedLabels,
      );
    }
  }

  if (wideningOptionId === "widen-role-family" || wideningOptionId === "widen-semantic-role") {
    const role = constraints.find((c) => c.field === "role");
    const semantic =
      wideningOptionId === "widen-semantic-role" && typeof role?.rawValue === "string"
        ? [plan.semanticText, String(role.rawValue)].filter(Boolean).join(" ")
        : plan.semanticText;
    const filtered =
      wideningOptionId === "widen-semantic-role"
        ? constraints.filter((c) => c.field !== "role")
        : constraints.map((c) =>
            c.field === "role"
              ? { ...c, operator: "contains" as const, source: "derived" as const }
              : c,
          );
    return buildCanonicalPlanFromDraft(
      {
        ...plan,
        constraints: filtered,
        semanticText: semantic,
        relationshipAmbiguous: false,
      },
      plan.resolved,
      plan.resolvedLabels,
    );
  }

  throw new NaturalSearchError("VALIDATION_ERROR", `Unknown widening option ${wideningOptionId}`);
}

function applyAnswersToPlan(
  plan: StoredPlan,
  answers: NaturalSearchResolveRequest["answers"],
  questions: Array<{ id: string; slot: string }>,
): CanonicalSearchPlan {
  const nextConstraints = [...plan.constraints];
  let relationshipAmbiguous = plan.relationshipAmbiguous;

  for (const answer of answers) {
    const question = questions.find((q) => q.id === answer.questionId);
    if (!question) {
      throw new NaturalSearchError("VALIDATION_ERROR", `Unknown question ${answer.questionId}`);
    }

    const selectedId = answer.optionIds?.[0];
    const custom = answer.customAnswer?.trim();
    if (!selectedId && !custom) {
      throw new NaturalSearchError("VALIDATION_ERROR", `Missing answer for ${answer.questionId}`);
    }

    if (question.slot === "relationship" && selectedId) {
      relationshipAmbiguous = false;
      const companyConstraint = nextConstraints.find((c) => c.field === "company");
      const companyValue = companyConstraint?.rawValue;
      // Remove ambiguous company field and map to current/previous
      const filtered = nextConstraints.filter(
        (c) => c.field !== "company" && c.field !== "relationship",
      );
      if (selectedId === "rel-current" && typeof companyValue === "string") {
        filtered.push({
          field: "currentCompany",
          operator: "eq",
          rawValue: companyValue,
          source: "user",
        });
      } else if (selectedId === "rel-previous" && typeof companyValue === "string") {
        filtered.push({
          field: "previousCompany",
          operator: "eq",
          rawValue: companyValue,
          source: "user",
        });
      } else if (selectedId === "rel-lead" && typeof companyValue === "string") {
        filtered.push({
          field: "company",
          operator: "eq",
          rawValue: companyValue,
          source: "user",
        });
      }
      nextConstraints.splice(0, nextConstraints.length, ...filtered);
      continue;
    }

    const lookup = selectedId ? plan.optionLookup?.[selectedId] : undefined;
    const rawValue = custom ?? lookup?.value ?? selectedId;
    const field = question.slot === "company" ? "company" : question.slot;

    const without = nextConstraints.filter((c) => c.field !== field);
    without.push({
      field: field as CanonicalSearchPlan["constraints"][number]["field"],
      operator: "eq",
      rawValue: rawValue ?? null,
      source: "user",
    });
    nextConstraints.splice(0, nextConstraints.length, ...without);

    if (lookup?.entityId) {
      if (field === "company" || field === "currentCompany" || field === "previousCompany") {
        plan.resolved.companyIds = [lookup.entityId];
      }
      if (field === "personName") {
        plan.resolved.personIds = [lookup.entityId];
      }
    }
  }

  return buildCanonicalPlanFromDraft(
    {
      mode: plan.mode,
      constraints: nextConstraints,
      semanticText: plan.semanticText,
      sortBy: plan.sortBy,
      sortOrder: plan.sortOrder,
      relationshipAmbiguous,
      limit: plan.limit,
    },
    plan.resolved,
    plan.resolvedLabels,
  );
}

/**
 * Apply clarification answers to a persisted session and continue search.
 */
export async function resolveNaturalSearchSession(
  sessionId: string,
  request: NaturalSearchResolveRequest,
  context: { db: Db; userId: string; requestId?: string },
): Promise<NaturalSearchV2Response> {
  const [session] = await context.db
    .select()
    .from(naturalSearchSessions)
    .where(
      and(
        eq(naturalSearchSessions.id, sessionId),
        eq(naturalSearchSessions.userId, context.userId),
      ),
    )
    .limit(1);

  if (!session) {
    throw new NaturalSearchError("NOT_FOUND", "Clarification session not found");
  }

  if (session.expiresAt.getTime() < Date.now()) {
    throw new NaturalSearchError("SESSION_EXPIRED", "Clarification session expired");
  }

  if (session.version !== request.version) {
    throw new NaturalSearchError("VERSION_CONFLICT", "Clarification session version is stale");
  }

  if (session.round >= MAX_CLARIFICATION_ROUNDS && request.wideningOptionId == null) {
    // Allow one more resolve after answers within max rounds; block endless loops.
  }

  if (session.round > MAX_CLARIFICATION_ROUNDS) {
    throw new NaturalSearchError(
      "SEARCH_NOT_UNDERSTOOD",
      "Too many clarification rounds for this search",
    );
  }

  const plan = session.partialPlan as StoredPlan;
  const questions = (session.pendingQuestions ?? []) as Array<{ id: string; slot: string }>;

  let nextPlan: CanonicalSearchPlan;
  if (request.wideningOptionId) {
    nextPlan = applyWidening(plan, request.wideningOptionId);
  } else {
    nextPlan = applyAnswersToPlan(plan, request.answers ?? [], questions);
  }

  const answers = [...((session.answers as unknown[]) ?? []), ...request.answers];
  await context.db
    .update(naturalSearchSessions)
    .set({
      answers,
      version: session.version + 1,
      round: session.round + 1,
      partialPlan: nextPlan,
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })
    .where(eq(naturalSearchSessions.id, sessionId));

  const result = await resolveAndExecuteNaturalSearch(nextPlan, {
    query: session.originalQuery,
    runId: session.runId ?? undefined,
    userId: context.userId,
    requestId: context.requestId,
    db: context.db,
    widened: Boolean(request.wideningOptionId),
  });

  if (result.status === "completed" || result.status === "no_results") {
    await context.db
      .update(naturalSearchSessions)
      .set({
        status: result.status,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(naturalSearchSessions.id, sessionId));
  }

  void sql;
  return result;
}
