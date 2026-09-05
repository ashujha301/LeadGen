import { describe, expect, it } from "vitest";
import { qualifiesAsHighValueLead } from "@/server/domain/roles/tier-matching";
import { passesHighValueScoreGates } from "@/server/domain/leads/hvl-score-gates";
import { HIGH_VALUE_LEAD_THRESHOLDS } from "@/shared/config";

describe("qualifiesAsHighValueLead (score gate without role)", () => {
  const base = {
    scoreVersion: 2,
    roleMatchFinal: false,
    roleMatch: false,
    finalScore: HIGH_VALUE_LEAD_THRESHOLDS.minScore,
    confidence: HIGH_VALUE_LEAD_THRESHOLDS.minConfidence,
    isStale: false,
    hasVerifiedCurrentEmployment: true,
  };

  it("qualifies when score and confidence pass even if role does not match", () => {
    expect(qualifiesAsHighValueLead(base)).toBe(true);
  });

  it("rejects below score threshold", () => {
    expect(qualifiesAsHighValueLead({ ...base, finalScore: 34.99 })).toBe(false);
  });

  it("rejects below confidence threshold", () => {
    expect(qualifiesAsHighValueLead({ ...base, confidence: 0.34 })).toBe(false);
  });

  it("rejects stale leads", () => {
    expect(qualifiesAsHighValueLead({ ...base, isStale: true })).toBe(false);
  });

  it("rejects scoreVersion 1", () => {
    expect(
      qualifiesAsHighValueLead({ ...base, scoreVersion: 1, finalScore: 90, confidence: 0.9 }),
    ).toBe(false);
  });

  it("score gates ignore role fields", () => {
    expect(
      passesHighValueScoreGates({
        scoreVersion: 2,
        finalScore: 39,
        confidence: 0.99,
        isStale: false,
      }),
    ).toBe(true);
  });
});
