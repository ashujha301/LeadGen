import { describe, expect, it } from "vitest";
import { qualifiesAsHighValueLead } from "@/server/domain/roles/tier-matching";
import { pickCanonicalLeadPerPerson } from "@/server/domain/leads/hvl-person-dedupe";
import { shouldMarkLeadStale } from "@/server/domain/leads/stale-policy";

describe("HVL AiPrise / score-gate regression", () => {
  it("accepts score>=35 without role match when not stale", () => {
    expect(
      qualifiesAsHighValueLead({
        scoreVersion: 2,
        roleMatch: false,
        roleMatchFinal: false,
        finalScore: 36,
        confidence: 0.99,
        isStale: false,
        hasVerifiedCurrentEmployment: true,
      }),
    ).toBe(true);
  });

  it("collapses Chaitanya twin lead rows to one canonical id", () => {
    const picked = pickCanonicalLeadPerPerson([
      {
        id: "43a8dd3b",
        personId: "add11280",
        finalScore: 54,
        updatedAt: new Date("2026-09-05T09:57:46Z"),
      },
      {
        id: "df903f1c",
        personId: "add11280",
        finalScore: 39,
        updatedAt: new Date("2026-09-05T10:30:31Z"),
      },
    ]);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.id).toBe("43a8dd3b");
  });

  it("stales the older sibling when a new lead id is kept", () => {
    expect(
      shouldMarkLeadStale({
        candidateLeadId: "43a8dd3b",
        candidatePersonId: "add11280",
        candidateCompanyId: "aiprise",
        activePersonId: "add11280",
        activeCompanyId: "aiprise",
        keepLeadId: "df903f1c",
      }),
    ).toBe(true);
  });
});
