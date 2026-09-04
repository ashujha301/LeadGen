import { describe, expect, it } from "vitest";
import { REASON_CODES, scoreLead, TOTAL_SCORE_MAX } from "@/server/domain/scoring";

describe("lead scoring", () => {
  it("returns deterministic total and components summing to total", () => {
    const input = {
      icp: {
        targetIndustries: ["b2b saas"],
        targetLocations: ["united states"],
        employeeRange: { min: 10, max: 500 },
        companyIndustry: "B2B SaaS",
        companyLocation: "United States",
        employeeCount: 120,
      },
      authority: {
        title: "Founder & CEO",
        isFounder: true,
      },
      signals: {
        signals: [{ type: "funding", confidence: 0.9 }],
      },
      contactability: {
        contacts: [
          {
            type: "email" as const,
            value: "ceo@acme.com",
            verificationStatus: "verified" as const,
          },
        ],
      },
      evidence: {
        evidence: [
          { sourceUrl: "https://acme.com/team", confidence: 0.9, freshness: 0.95 },
          { sourceUrl: "https://crunchbase.com/acme", confidence: 0.8, freshness: 0.8 },
        ],
      },
    };

    const first = scoreLead(input);
    const second = scoreLead(input);

    expect(first.total).toBe(second.total);
    expect(first.components).toHaveLength(6);

    const componentSum = first.components.reduce((sum, component) => sum + component.contribution, 0);
    expect(first.total).toBe(Math.round(componentSum * 100) / 100);
    expect(first.total).toBeLessThanOrEqual(TOTAL_SCORE_MAX);
    expect(first.keyReason).toBeTruthy();
  });

  it("assigns reason codes per component", () => {
    const result = scoreLead({
      icp: {
        targetIndustries: ["fintech"],
        companyIndustry: "fintech",
      },
      authority: { title: "Director of Operations" },
      signals: { signals: [] },
      contactability: { contacts: [] },
      evidence: { evidence: [] },
    });

    expect(result.components.map((component) => component.reasonCode)).toEqual(
      expect.arrayContaining([
        REASON_CODES.icp.industryMatch,
        REASON_CODES.authority.vpDirector,
        REASON_CODES.signals.none,
        REASON_CODES.contact.none,
        REASON_CODES.evidence.lowConfidence,
      ]),
    );
  });

  it("scores founder with verified email near maximum", () => {
    const result = scoreLead({
      icp: {
        targetIndustries: ["saas"],
        companyIndustry: "saas",
      },
      authority: { title: "Owner", isOwner: true },
      signals: { signals: [{ type: "hiring", confidence: 0.8 }] },
      contactability: {
        contacts: [{ type: "email", value: "owner@acme.com", verificationStatus: "verified" }],
      },
      evidence: {
        evidence: [{ sourceUrl: "https://acme.com/about", confidence: 0.95, freshness: 1 }],
      },
    });

    expect(result.total).toBeGreaterThan(70);
    expect(result.components.every((component) => component.contribution >= 0)).toBe(true);
  });
});
