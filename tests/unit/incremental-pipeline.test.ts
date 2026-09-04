import { describe, expect, it } from "vitest";
import { resolveCanonicalIndustry } from "@/server/domain/industry/resolution";
import { validatePersonMention } from "@/server/domain/entity-resolution/mention-validation";
import { findExistingPersonByNameAtCompany } from "@/server/domain/entity-resolution/person-drafts";
import { shouldExcludeByEmployeeRange } from "@/server/domain/employee-range";
import { matchRoleWithTier, qualifiesAsHighValueLead } from "@/server/domain/roles/tier-matching";
import { calculateExperienceMetrics } from "@/server/domain/timeline/experience-calculation";
import { scoreLead, TOTAL_SCORE_MAX_V2 } from "@/server/domain/scoring";
import { pickCompanyName } from "@/server/worker/stages/resolve";
import { HIGH_VALUE_LEAD_THRESHOLDS } from "@/shared/config";

describe("incremental pipeline domain modules", () => {
  it("derives a clean company name instead of storing the full page title", () => {
    expect(
      pickCompanyName(
        [
          {
            attribute: "page_title",
            rawValue: "Appknox | Mobile App Security Testing Platform",
          },
        ],
        "appknox.com",
      ),
    ).toBe("Appknox");
  });

  it("prefers an explicit provider company name over page metadata", () => {
    expect(
      pickCompanyName(
        [
          { attribute: "page_title", rawValue: "Security platform for modern teams" },
          { attribute: "name", rawValue: "Appknox" },
        ],
        "appknox.com",
      ),
    ).toBe("Appknox");
  });

  it("prefers exact-domain Crustdata industry over weaker sources", () => {
    const result = resolveCanonicalIndustry(
      [
        {
          value: "Computer and Network Security",
          source: "crustdata:company_enrich",
          confidence: 0.9,
          observedAt: new Date("2025-08-01"),
        },
        {
          value: "Software",
          source: "website:jsonld",
          confidence: 0.7,
          observedAt: new Date("2025-08-01"),
        },
      ],
      null,
    );

    expect(result.canonicalIndustry).toBe("Computer and Network Security");
    expect(result.industrySource).toBe("crustdata:company_enrich");
  });

  it("rejects CTA-prefixed and collective person mentions", () => {
    expect(validatePersonMention("Connect John Smith").valid).toBe(true);
    expect(validatePersonMention("Meet the Team").valid).toBe(false);
    expect(validatePersonMention("CEO").valid).toBe(false);
  });

  it("finalizes exact role matches immediately", () => {
    const result = matchRoleWithTier("CEO", {
      seniorities: [],
      functions: [],
      customTitles: ["CEO"],
    });
    expect(result.roleMatchTier).toBe("exact");
    expect(result.roleMatchFinal).toBe(true);
  });

  it("keeps fallback candidates provisional when exact peers exist", () => {
    const result = matchRoleWithTier(
      "Founder",
      { seniorities: [], functions: [], customTitles: ["CEO"] },
      { hasExactOrSynonymPeer: true },
    );
    expect(result.roleMatchTier).toBe("fallback");
    expect(result.roleMatchFinal).toBe(false);
  });

  it("unions overlapping employment intervals without double counting", () => {
    const metrics = calculateExperienceMetrics([
      {
        startDate: "2020-01-01",
        endDate: "2022-01-01",
        isLeadership: true,
      },
      {
        startDate: "2021-06-01",
        endDate: "2023-01-01",
        isLeadership: false,
      },
    ]);

    expect(metrics.calculatedTotalMonths).toBeGreaterThan(24);
    expect(metrics.calculatedTotalMonths).toBeLessThan(48);
  });

  it("scores version 2 leads with experience component", () => {
    const result = scoreLead({
      scoreVersion: 2,
      icp: { companyIndustry: "saas", targetIndustries: ["saas"] },
      authority: { title: "Founder" },
      signals: { signals: [] },
      contactability: { contacts: [] },
      evidence: { evidence: [] },
      experience: {
        totalExperienceYears: 8,
        leadershipExperienceYears: 4,
        experienceConfidence: 0.9,
      },
    });

    expect(result.components.some((component) => component.key === "experience")).toBe(true);
    expect(result.total).toBeLessThanOrEqual(TOTAL_SCORE_MAX_V2);
  });

  it("qualifies high value leads only with version 2 gates", () => {
    expect(
      qualifiesAsHighValueLead({
        scoreVersion: 2,
        roleMatchFinal: true,
        roleMatch: true,
        finalScore: HIGH_VALUE_LEAD_THRESHOLDS.minScore,
        confidence: HIGH_VALUE_LEAD_THRESHOLDS.minConfidence,
        isStale: false,
        hasVerifiedCurrentEmployment: true,
      }),
    ).toBe(true);

    expect(
      qualifiesAsHighValueLead({
        scoreVersion: 1,
        roleMatchFinal: true,
        roleMatch: true,
        finalScore: 90,
        confidence: 0.9,
        isStale: false,
        hasVerifiedCurrentEmployment: true,
      }),
    ).toBe(false);
  });

  it("merges people at the same company when names are highly similar", () => {
    expect(
      findExistingPersonByNameAtCompany(
        { normalizedName: "jane oneil" },
        [{ id: "p1", normalizedName: "jane o'neil" }],
      ),
    ).toBe("p1");
  });

  it("skips scoring when employee count is outside configured ICP range", () => {
    expect(shouldExcludeByEmployeeRange(1200, { min: 10, max: 500 })).toBe(true);
    expect(shouldExcludeByEmployeeRange(120, { min: 10, max: 500 })).toBe(false);
    expect(shouldExcludeByEmployeeRange(null, { min: 10, max: 500 })).toBe(false);
  });
});
