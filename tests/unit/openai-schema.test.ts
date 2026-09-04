import { describe, expect, it } from "vitest";

import { pageExtractionSchema } from "@/shared/contracts/observation";

describe("OpenAI page extraction schema", () => {
  it("requires nullable person fields instead of optional properties", () => {
    const parsed = pageExtractionSchema.parse({
      companyFacts: [],
      people: [
        {
          name: "Jane Doe",
          title: null,
          email: null,
          phone: null,
          profileUrl: null,
          confidence: 0.8,
          evidenceSpan: null,
          currentCompanyAffiliation: true,
          relationshipToCompany: "employee",
        },
      ],
      businessSignals: [],
    });

    expect(parsed.people[0]?.title).toBeNull();
    expect(parsed.people[0]?.currentCompanyAffiliation).toBe(true);
  });

  it("rejects missing nullable keys", () => {
    expect(() =>
      pageExtractionSchema.parse({
        companyFacts: [],
        people: [{ name: "Jane Doe", confidence: 0.8 }],
        businessSignals: [],
      }),
    ).toThrow();
  });
});
