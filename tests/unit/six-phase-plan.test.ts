import { describe, expect, it } from "vitest";

import {
  hasEmployeeRangeBounds,
  isEmployeeCountInRange,
  shouldExcludeByEmployeeRange,
} from "@/server/domain/employee-range";
import { isGenericCompanyLabel, pickCompanyName } from "@/server/domain/company-identity";
import { findExistingPersonByNameAtCompany } from "@/server/domain/entity-resolution/person-drafts";
import { HIGH_VALUE_LEAD_THRESHOLDS } from "@/shared/config/constants";
import { qualifiesAsHighValueLead } from "@/server/domain/roles/tier-matching";

describe("employee range hard filter", () => {
  it("supports min-only and max-only bounds", () => {
    expect(hasEmployeeRangeBounds({ min: 2 })).toBe(true);
    expect(hasEmployeeRangeBounds({ max: 10 })).toBe(true);
    expect(hasEmployeeRangeBounds({})).toBe(false);

    expect(isEmployeeCountInRange(5, { min: 2 })).toBe(true);
    expect(isEmployeeCountInRange(1, { min: 2 })).toBe(false);
    expect(isEmployeeCountInRange(14, { max: 10 })).toBe(false);
    expect(isEmployeeCountInRange(8, { max: 10 })).toBe(true);
  });

  it("excludes known headcount outside range and ignores unknown headcount", () => {
    expect(shouldExcludeByEmployeeRange(14, { min: 2, max: 10 })).toBe(true);
    expect(shouldExcludeByEmployeeRange(14, { max: 10 })).toBe(true);
    expect(shouldExcludeByEmployeeRange(null, { min: 2, max: 10 })).toBe(false);
  });
});

describe("company identity guards", () => {
  it("rejects generic company labels including Company", () => {
    expect(isGenericCompanyLabel("Company")).toBe(true);
    expect(isGenericCompanyLabel("About Us")).toBe(true);
    expect(isGenericCompanyLabel("Outcomes")).toBe(false);
  });

  it("prefers homepage name over generic inner-page labels", () => {
    expect(
      pickCompanyName(
        [
          { attribute: "name", rawValue: "Company", isHomepage: false },
          { attribute: "page_title", rawValue: "Outcomes AI | Agents", isHomepage: true },
        ],
        "outcomes.ai",
        "https://outcomes.ai/",
      ),
    ).toBe("Outcomes AI");
  });
});

describe("same-company name dedup", () => {
  it("merges near-duplicate names at the same company", () => {
    const match = findExistingPersonByNameAtCompany({ normalizedName: "kuldeep singh rajpuit" }, [
      { id: "p1", normalizedName: "kuldeep singh rajput" },
    ]);
    expect(match).toBe("p1");
  });
});

describe("lenient high value lead thresholds", () => {
  it("uses 35 score and 0.35 confidence", () => {
    expect(HIGH_VALUE_LEAD_THRESHOLDS.minScore).toBe(35);
    expect(HIGH_VALUE_LEAD_THRESHOLDS.minConfidence).toBe(0.35);
    expect(
      qualifiesAsHighValueLead({
        scoreVersion: 2,
        roleMatchFinal: false,
        roleMatch: false,
        finalScore: 36,
        confidence: 0.36,
        isStale: false,
        hasVerifiedCurrentEmployment: true,
      }),
    ).toBe(true);
  });
});

describe("role criteria title search terms", () => {
  it("expands default founder and c_suite chips into title filters", async () => {
    const { roleCriteriaToTitleSearchTerms } =
      await import("@/server/domain/roles/title-search-terms");
    const terms = roleCriteriaToTitleSearchTerms({
      seniorities: ["founder", "c_suite"],
      functions: [],
      customTitles: [],
    });
    expect(terms).toEqual(expect.arrayContaining(["founder", "ceo", "cto", "president"]));
  });
});
