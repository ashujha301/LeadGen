import { describe, expect, it } from "vitest";
import type { NaturalSearchV2Response } from "@/shared/contracts/natural-search-v2";
import type { CanonicalSearchPlan } from "@/server/application/search/canonical-plan";

/**
 * Phase 1 characterization / contract tests for resolution + semantic NL search.
 * These define the target behavior and should fail until later phases land.
 */

describe("NL resolution semantic contracts (phase 1)", () => {
  it("returns Siddalingamurthy for CTO at Outcomes.ai with score above 55", async () => {
    const { runNaturalSearchV2 } = await import("@/server/application/search/natural-search-v2");

    const result = await runNaturalSearchV2(
      { query: "Chief Technology Officer at Outcomes.ai with score above 55" },
      {
        db: {} as never,
        userId: "user-1",
        deps: {
          parseDraft: async () => ({
            mode: "leads" as const,
            constraints: [
              {
                field: "role",
                operator: "eq" as const,
                rawValue: "Chief Technology Officer",
                source: "user" as const,
              },
              {
                field: "company",
                operator: "eq" as const,
                rawValue: "Outcomes.ai",
                source: "user" as const,
              },
              { field: "score", operator: "gt" as const, rawValue: 55, source: "user" as const },
            ],
            semanticText: null,
            sortBy: null,
            sortOrder: null,
            relationshipAmbiguous: false,
            limit: 50,
          }),
          resolveAndExecute: async (
            plan: CanonicalSearchPlan,
          ): Promise<NaturalSearchV2Response> => ({
            status: "completed",
            interpretation: {
              summary: "CTO at Outcomes.ai score>55",
              appliedFilters: [
                {
                  field: "role",
                  label: "Chief Technology Officer",
                  operator: "eq",
                  rawValue: "Chief Technology Officer",
                },
                { field: "company", label: "OutcomesAI", operator: "eq", rawValue: "Outcomes.ai" },
                { field: "score", label: "score > 55", operator: "gt", rawValue: 55 },
              ],
              semanticPhrase: null,
              warnings: [],
              widened: false,
            },
            result: {
              kind: "leads",
              items: [
                {
                  leadId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                  personName: "Siddalingamurthy BG",
                  companyName: "OutcomesAI",
                  score: 70.78,
                  confidence: 0.9,
                },
              ],
            },
            plan,
          }),
        },
      },
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.result.kind).toBe("leads");
    if (result.result.kind !== "leads") return;
    expect(result.result.items.some((item) => item.personName === "Siddalingamurthy BG")).toBe(
      true,
    );
    const hit = result.result.items.find((item) => item.personName === "Siddalingamurthy BG");
    expect(hit?.score).toBe(70.78);
    expect(result.interpretation.appliedFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "role",
          label: expect.stringMatching(/chief technology/i),
        }),
        expect.objectContaining({ field: "company", label: expect.stringMatching(/outcomes/i) }),
        expect.objectContaining({ field: "score", operator: "gt", rawValue: 55 }),
      ]),
    );
  });

  it("resolves CTO abbreviation to Chief Technology Officer", async () => {
    const { resolveRoleConstraint } =
      await import("@/server/application/search/resolution/resolve-role");

    const resolved = resolveRoleConstraint("CTO");
    expect(resolved.status).toBe("resolved");
    if (resolved.status !== "resolved") return;
    expect(resolved.canonicalTitle.toLowerCase()).toContain("chief technology officer");
    expect(resolved.aliases).toEqual(expect.arrayContaining(["cto"]));
  });

  it("maps above to gt and at least to gte", async () => {
    const { inferComparisonOperator } =
      await import("@/server/application/search/resolution/operators");

    expect(inferComparisonOperator("above 55")).toBe("gt");
    expect(inferComparisonOperator("score above 55")).toBe("gt");
    expect(inferComparisonOperator("at least 55")).toBe("gte");
    expect(inferComparisonOperator("score of at least 55")).toBe("gte");
  });

  it("does not invent signalType/seniority/dates absent from user text", async () => {
    const { mapDraftConstraintsFromTransport } =
      await import("@/server/application/search/canonical-plan");

    const draft = mapDraftConstraintsFromTransport({
      mode: "leads",
      constraints: [
        { field: "role", operator: "eq", rawValue: "CTO", source: "user" },
        { field: "company", operator: "eq", rawValue: "Outcomes.ai", source: "user" },
        { field: "score", operator: "gt", rawValue: 55, source: "user" },
      ],
      semanticText: null,
      sortBy: null,
      sortOrder: null,
      relationshipAmbiguous: false,
    });

    expect(draft.constraints.every((c) => c.source === "user")).toBe(true);
    expect(draft.constraints.some((c) => c.field === "signalType")).toBe(false);
    expect(draft.constraints.some((c) => c.field === "dateRange")).toBe(false);
  });

  it("asks a relationship clarification for ambiguous timeline from company", async () => {
    const { planClarifications } =
      await import("@/server/application/search/resolution/clarifications");

    const questions = planClarifications({
      mode: "timeline",
      personName: "Siddalingamurthy BG",
      unresolvedCompany: "outcomes.ai",
      relationshipAmbiguous: true,
    });

    expect(questions.length).toBeGreaterThan(0);
    expect(questions.some((q) => q.slot === "relationship")).toBe(true);
    expect(questions.every((q) => q.options.length <= 5)).toBe(true);
  });

  it("returns needs_clarification for similar company candidates instead of zero results", async () => {
    const { buildClarificationResponse } =
      await import("@/server/application/search/clarification/session");

    const response = buildClarificationResponse({
      sessionId: "11111111-1111-1111-1111-111111111111",
      version: 1,
      expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      questions: [
        {
          id: "company-1",
          slot: "company",
          prompt: "Which company did you mean?",
          selection: "single_select",
          allowCustomAnswer: true,
          options: [
            { id: "option-1", label: "OutcomesAI", description: "outcomes.ai" },
            { id: "option-2", label: "Outcomes Health", description: "outcomes.health" },
          ],
        },
      ],
    });

    expect(response.status).toBe("needs_clarification");
    expect(response.questions).toHaveLength(1);
  });

  it("returns no_results with unexecuted widening options", async () => {
    const { buildNoResultsResponse } = await import("@/server/application/search/widening/options");

    const response = buildNoResultsResponse({
      interpretationSummary: "CTO at Outcomes.ai score>90",
      options: [
        {
          id: "widen-role-family",
          label: "Expand role to c-suite / technology leaders",
          estimatedCount: 3,
        },
        {
          id: "widen-threshold",
          label: "Lower score threshold to 55",
          estimatedCount: 1,
        },
      ],
    });

    expect(response.status).toBe("no_results");
    expect(response.wideningOptions.every((o) => o.executed === false)).toBe(true);
  });
});
