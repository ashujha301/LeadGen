import { describe, expect, it } from "vitest";
import { CONFIDENCE_CAP, FRESHNESS_HALF_LIFE_DAYS } from "@/shared/config";
import { ageInDays, calculateFreshness, combineConfidence } from "@/server/domain";

describe("freshness decay", () => {
  it("returns 1 at age zero", () => {
    expect(calculateFreshness(0, "contact")).toBe(1);
  });

  it("halves at the configured half-life", () => {
    expect(calculateFreshness(FRESHNESS_HALF_LIFE_DAYS.contact, "contact")).toBeCloseTo(0.5, 5);
    expect(calculateFreshness(FRESHNESS_HALF_LIFE_DAYS.employment, "employment")).toBeCloseTo(
      0.5,
      5,
    );
    expect(calculateFreshness(FRESHNESS_HALF_LIFE_DAYS.company, "company")).toBeCloseTo(0.5, 5);
  });

  it("computes age in days", () => {
    const observed = new Date("2026-01-01T00:00:00.000Z");
    const reference = new Date("2026-01-31T00:00:00.000Z");
    expect(ageInDays(observed, reference)).toBe(30);
  });
});

describe("confidence combination", () => {
  it("combines independent evidence", () => {
    const combined = combineConfidence([
      { sourceConfidence: 0.8, freshness: 1 },
      { sourceConfidence: 0.6, freshness: 0.5 },
    ]);

    expect(combined).toBeCloseTo(0.86, 2);
  });

  it("caps combined confidence", () => {
    const combined = combineConfidence([
      { sourceConfidence: 0.99, freshness: 1 },
      { sourceConfidence: 0.99, freshness: 1 },
      { sourceConfidence: 0.99, freshness: 1 },
    ]);

    expect(combined).toBe(CONFIDENCE_CAP);
  });

  it("returns zero for empty sources", () => {
    expect(combineConfidence([])).toBe(0);
  });
});
