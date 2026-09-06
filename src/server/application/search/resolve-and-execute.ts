import { randomUUID } from "node:crypto";

import type {
  ConnectionsSearchIntent,
  LeadsSearchIntent,
  TimelineSearchIntent,
} from "@/shared/contracts";
import type { AppliedFilter, NaturalSearchV2Response } from "@/shared/contracts/natural-search-v2";
import type { Db } from "@/server/infrastructure/db";
import { naturalSearchSessions } from "@/server/infrastructure/db/schema";

import {
  buildCanonicalPlanFromDraft,
  type CanonicalSearchPlan,
  type DraftSearchPlan,
} from "./canonical-plan";
import { buildClarificationResponse, SESSION_TTL_MS } from "./clarification/session";
import { NaturalSearchError } from "./natural-search-error";
import { planClarifications } from "./resolution/clarifications";
import { resolveCompanyConstraint } from "./resolution/resolve-company";
import { resolvePersonConstraint } from "./resolution/resolve-person";
import { resolveRoleConstraint } from "./resolution/resolve-role";
import {
  executeConnectionsSearch,
  executeStructuredSearch,
  executeTimelineSearch,
} from "./structured-search";
import { buildNoResultsResponse, suggestWideningOptions } from "./widening/options";
import { retrieveSemanticLeadIds } from "./semantic-retrieval";

export type ResolveExecuteContext = {
  query: string;
  runId?: string;
  userId: string;
  requestId?: string;
  db: Db;
  widened?: boolean;
};

function constraintValue(plan: DraftSearchPlan, field: string): string | number | null {
  const hit = plan.constraints.find((c) => c.field === field);
  if (!hit) return null;
  return hit.rawValue as string | number | null;
}

function constraintOperator(plan: DraftSearchPlan, field: string) {
  return plan.constraints.find((c) => c.field === field)?.operator;
}

async function persistClarificationSession(
  db: Db,
  context: ResolveExecuteContext,
  plan: CanonicalSearchPlan,
  questions: ReturnType<typeof planClarifications>,
): Promise<Extract<NaturalSearchV2Response, { status: "needs_clarification" }>> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const sessionId = randomUUID();
  const optionLookup: Record<string, { slot: string; entityId?: string; value?: string }> = {};

  for (const question of questions) {
    for (const option of question.options) {
      optionLookup[option.id] = {
        slot: question.slot,
        entityId: option.id.startsWith("entity:") ? option.id.slice("entity:".length) : undefined,
        value: option.id,
      };
    }
  }

  await db.insert(naturalSearchSessions).values({
    id: sessionId,
    userId: context.userId,
    runId: context.runId ?? null,
    originalQuery: context.query,
    partialPlan: {
      ...plan,
      optionLookup,
    },
    pendingQuestions: questions,
    answers: [],
    status: "pending_clarification",
    version: 1,
    round: 1,
    expiresAt,
  });

  return buildClarificationResponse({
    sessionId,
    version: 1,
    expiresAt: expiresAt.toISOString(),
    questions,
    interpretation: {
      summary: context.query,
      appliedFilters: plan.resolvedLabels,
      semanticPhrase: plan.semanticText,
      warnings: [],
      widened: false,
    },
  });
}

function toAppliedFilters(plan: CanonicalSearchPlan): AppliedFilter[] {
  return plan.resolvedLabels.map((label) => ({
    field: label.field,
    label: label.label,
    operator: label.operator,
    rawValue: label.rawValue ?? null,
    matchStrategy: label.matchStrategy,
  }));
}

/**
 * Resolve draft plan entities and execute search, or return clarification / no_results.
 */
export async function resolveAndExecuteNaturalSearch(
  plan: CanonicalSearchPlan,
  context: ResolveExecuteContext,
): Promise<NaturalSearchV2Response> {
  const labels: CanonicalSearchPlan["resolvedLabels"] = [];
  const resolved: CanonicalSearchPlan["resolved"] = { ...plan.resolved };
  const warnings: string[] = [];

  // Relationship ambiguity for timeline
  if (plan.mode === "timeline" && plan.relationshipAmbiguous) {
    const companyRaw =
      (constraintValue(plan, "company") as string | null) ??
      (constraintValue(plan, "currentCompany") as string | null) ??
      (constraintValue(plan, "previousCompany") as string | null);
    const personName = constraintValue(plan, "personName") as string | null;
    const questions = planClarifications({
      mode: "timeline",
      personName,
      unresolvedCompany: companyRaw,
      relationshipAmbiguous: true,
    });
    return persistClarificationSession(
      context.db,
      context,
      buildCanonicalPlanFromDraft(plan, resolved, labels),
      questions,
    );
  }

  // Roles
  const roleRaw = constraintValue(plan, "role");
  let semanticText = plan.semanticText;
  if (typeof roleRaw === "string") {
    const role = resolveRoleConstraint(roleRaw);
    if (role.status === "resolved") {
      resolved.roleTitles = [role.canonicalTitle];
      resolved.roleAliases = role.aliases;
      labels.push({
        field: "role",
        label: role.canonicalTitle,
        operator: "eq",
        rawValue: roleRaw,
        matchStrategy: role.matchStrategy,
      });
    } else if (role.status === "semantic_fallback") {
      semanticText = [semanticText, role.semanticText].filter(Boolean).join(" ").trim();
      labels.push({
        field: "role",
        label: roleRaw,
        operator: "semantic_match",
        rawValue: roleRaw,
        matchStrategy: "semantic_fallback",
      });
    }
  }

  // Company fields
  for (const field of [
    "company",
    "companyA",
    "companyB",
    "currentCompany",
    "previousCompany",
  ] as const) {
    const raw = constraintValue(plan, field);
    if (typeof raw !== "string") continue;
    const companyResult = await resolveCompanyConstraint(context.db, raw, context.userId);
    if (companyResult.status === "resolved") {
      if (field === "company" || field === "currentCompany" || field === "previousCompany") {
        resolved.companyIds = [companyResult.company.id];
      } else if (field === "companyA") {
        resolved.companyAIds = [companyResult.company.id];
      } else {
        resolved.companyBIds = [companyResult.company.id];
      }
      labels.push({
        field,
        label: companyResult.company.label,
        operator: "eq",
        rawValue: raw,
        matchStrategy: companyResult.company.matchStrategy,
      });
    } else if (companyResult.status === "ambiguous") {
      const questions = planClarifications({
        mode: plan.mode,
        unresolvedCompany: raw,
        companyCandidates: companyResult.candidates.map((c) => ({
          id: `entity:${c.id}`,
          label: c.label,
          description: c.description,
        })),
      });
      return persistClarificationSession(
        context.db,
        context,
        buildCanonicalPlanFromDraft(plan, resolved, labels),
        questions,
      );
    } else {
      const questions = planClarifications({
        mode: plan.mode,
        unresolvedCompany: raw,
        companyCandidates: [],
      });
      // No candidates: still ask with custom answer only
      questions.push({
        id: "company-custom-1",
        slot: field,
        prompt: `We could not match "${raw}". Enter the company name or domain.`,
        selection: "single_select",
        allowCustomAnswer: true,
        options: [],
      });
      return persistClarificationSession(
        context.db,
        context,
        buildCanonicalPlanFromDraft(plan, resolved, labels),
        questions.slice(0, 3),
      );
    }
  }

  // Person
  const personRaw = constraintValue(plan, "personName");
  if (typeof personRaw === "string") {
    const personResult = await resolvePersonConstraint(context.db, personRaw, context.userId);
    if (personResult.status === "resolved") {
      resolved.personIds = [personResult.person.id];
      labels.push({
        field: "personName",
        label: personResult.person.label,
        operator: "eq",
        rawValue: personRaw,
        matchStrategy: personResult.person.matchStrategy,
      });
    } else if (personResult.status === "ambiguous") {
      const questions = planClarifications({
        mode: plan.mode,
        personCandidates: personResult.candidates.map((c) => ({
          id: `entity:${c.id}`,
          label: c.label,
          description: c.description,
        })),
      });
      return persistClarificationSession(
        context.db,
        context,
        buildCanonicalPlanFromDraft(plan, resolved, labels),
        questions,
      );
    }
  }

  // Score / confidence labels
  const scoreRaw = constraintValue(plan, "score");
  const scoreOp = constraintOperator(plan, "score") ?? "gte";
  if (typeof scoreRaw === "number") {
    labels.push({
      field: "score",
      label: `score ${scoreOp} ${scoreRaw}`,
      operator: scoreOp,
      rawValue: scoreRaw,
    });
  }

  const workingPlan = buildCanonicalPlanFromDraft(
    { ...plan, semanticText },
    resolved,
    labels.length > 0 ? labels : plan.resolvedLabels,
  );

  // Semantic retrieval when needed
  let semanticLeadIds: string[] | undefined;
  const needsSemantic =
    Boolean(semanticText) || workingPlan.constraints.some((c) => c.operator === "semantic_match");

  if (needsSemantic) {
    const semantic = await retrieveSemanticLeadIds(context.db, {
      userId: context.userId,
      text: semanticText ?? String(roleRaw ?? ""),
      requestId: context.requestId,
      limit: 100,
    });
    if (semantic.status === "empty_index") {
      warnings.push("semantic_index_empty");
    } else if (semantic.status === "failed") {
      if (
        !workingPlan.constraints.some(
          (c) => c.field === "company" || c.field === "role" || c.field === "score",
        )
      ) {
        throw new NaturalSearchError(
          "SERVICE_UNAVAILABLE",
          "Semantic search is temporarily unavailable",
        );
      }
      warnings.push("semantic_retrieval_failed");
    } else if (semantic.status === "ok") {
      semanticLeadIds = semantic.leadIds;
      warnings.push(...(semantic.warnings ?? []));
    }
  }

  if (plan.mode === "leads") {
    const intent: LeadsSearchIntent = {
      mode: "leads",
      roles: resolved.roleTitles ?? (typeof roleRaw === "string" ? [roleRaw] : undefined),
      company:
        typeof constraintValue(plan, "company") === "string"
          ? (constraintValue(plan, "company") as string)
          : undefined,
      scoreThreshold: typeof scoreRaw === "number" ? scoreRaw : undefined,
      scoreOperator:
        typeof scoreRaw === "number" ? (scoreOp as "gt" | "gte" | "lt" | "lte") : undefined,
      confidenceThreshold:
        typeof constraintValue(plan, "confidence") === "number"
          ? (constraintValue(plan, "confidence") as number)
          : undefined,
      signalType:
        typeof constraintValue(plan, "signalType") === "string"
          ? (constraintValue(plan, "signalType") as string)
          : undefined,
      sortBy: plan.sortBy ?? undefined,
      sortOrder: plan.sortOrder ?? undefined,
      resolvedCompanyIds: resolved.companyIds,
      roleAliases: resolved.roleAliases,
      semanticLeadIds,
    };

    const items = await executeStructuredSearch(context.db, intent, {
      runId: context.runId,
      userId: context.userId,
      limit: plan.limit,
    });

    if (items.length === 0) {
      const wideningOptions = suggestWideningOptions({
        hasExactRole: Boolean(resolved.roleTitles?.length),
        hasScoreThreshold: typeof scoreRaw === "number",
        scoreThreshold: typeof scoreRaw === "number" ? scoreRaw : undefined,
        hasOptionalSignalOrDate: workingPlan.constraints.some(
          (c) => c.field === "signalType" || c.field === "dateRange",
        ),
      });
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      const sessionId = randomUUID();
      await context.db.insert(naturalSearchSessions).values({
        id: sessionId,
        userId: context.userId,
        runId: context.runId ?? null,
        originalQuery: context.query,
        partialPlan: workingPlan,
        pendingQuestions: [],
        answers: [],
        status: "no_results",
        version: 1,
        round: 1,
        expiresAt,
      });
      return buildNoResultsResponse({
        interpretationSummary: context.query,
        appliedFilters: toAppliedFilters(workingPlan),
        warnings,
        options: wideningOptions,
        sessionId,
        version: 1,
        expiresAt: expiresAt.toISOString(),
      });
    }

    return {
      status: "completed",
      interpretation: {
        summary: context.query,
        appliedFilters: toAppliedFilters(workingPlan),
        semanticPhrase: semanticText,
        warnings,
        widened: Boolean(context.widened),
      },
      result: { kind: "leads", items },
    };
  }

  if (plan.mode === "timeline") {
    const intent: TimelineSearchIntent = {
      mode: "timeline",
      personName:
        typeof constraintValue(plan, "personName") === "string"
          ? (constraintValue(plan, "personName") as string)
          : undefined,
      currentCompany:
        typeof constraintValue(plan, "currentCompany") === "string"
          ? (constraintValue(plan, "currentCompany") as string)
          : undefined,
      previousCompany:
        typeof constraintValue(plan, "previousCompany") === "string"
          ? (constraintValue(plan, "previousCompany") as string)
          : undefined,
    };
    const items = await executeTimelineSearch(context.db, intent, {
      runId: context.runId,
      userId: context.userId,
      limit: plan.limit,
    });
    return {
      status: "completed",
      interpretation: {
        summary: context.query,
        appliedFilters: toAppliedFilters(workingPlan),
        semanticPhrase: semanticText,
        warnings,
        widened: Boolean(context.widened),
      },
      result: { kind: "timelines", items },
    };
  }

  const companyA = constraintValue(plan, "companyA");
  if (typeof companyA !== "string") {
    throw new NaturalSearchError("SEARCH_NOT_UNDERSTOOD", "connections mode requires companyA");
  }
  const intent: ConnectionsSearchIntent = {
    mode: "connections",
    companyA,
    companyB:
      typeof constraintValue(plan, "companyB") === "string"
        ? (constraintValue(plan, "companyB") as string)
        : undefined,
    personName:
      typeof constraintValue(plan, "personName") === "string"
        ? (constraintValue(plan, "personName") as string)
        : undefined,
    minOverlapDays:
      typeof constraintValue(plan, "minOverlapDays") === "number"
        ? (constraintValue(plan, "minOverlapDays") as number)
        : undefined,
  };
  const items = await executeConnectionsSearch(context.db, intent, {
    runId: context.runId,
    userId: context.userId,
  });
  return {
    status: "completed",
    interpretation: {
      summary: context.query,
      appliedFilters: toAppliedFilters(workingPlan),
      semanticPhrase: semanticText,
      warnings,
      widened: Boolean(context.widened),
    },
    result: { kind: "connections", items },
  };
}
