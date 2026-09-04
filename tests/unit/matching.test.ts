import { describe, expect, it } from "vitest";
import {
  classifyMatchDecision,
  matchPersons,
  resolveCompanyByDomain,
  type CompanyRecord,
} from "@/server/domain";

describe("company resolution", () => {
  const companies: CompanyRecord[] = [
    {
      id: "c1",
      name: "Acme",
      normalizedDomain: "acme.com",
      aliases: ["www.acme.com", "https://shop.acme.com"],
    },
    {
      id: "c2",
      name: "Beta",
      normalizedDomain: "beta.io",
    },
  ];

  it("matches by normalized domain", () => {
    const result = resolveCompanyByDomain("https://www.acme.com/about", companies);
    expect(result.status).toBe("matched");
    if (result.status === "matched") {
      expect(result.company.id).toBe("c1");
    }
  });

  it("matches alias domains", () => {
    const result = resolveCompanyByDomain("shop.acme.com", companies);
    expect(result.status).toBe("matched");
  });

  it("returns unmatched for unknown domain", () => {
    const result = resolveCompanyByDomain("unknown.com", companies);
    expect(result.status).toBe("unmatched");
    if (result.status === "unmatched") {
      expect(result.normalizedDomain).toBe("unknown.com");
    }
  });
});

describe("person matching", () => {
  it("auto merges on strong identifier match", () => {
    const result = matchPersons(
      {
        profileUrl: "https://linkedin.com/in/jane",
        email: "jane@acme.com",
        currentCompanyId: "c1",
        name: "Jane Doe",
        title: "CEO",
      },
      {
        profileUrl: "https://linkedin.com/in/jane/",
        email: "jane@acme.com",
        currentCompanyId: "c1",
        name: "Jane Doe",
        title: "Chief Executive Officer",
      },
    );

    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.decision).toBe("auto_merge");
  });

  it("marks ambiguous matches for review", () => {
    const result = matchPersons(
      {
        profileUrl: "https://linkedin.com/in/jane",
        email: "jane@acme.com",
      },
      {
        profileUrl: "https://linkedin.com/in/jane/",
        email: "jane@acme.com",
      },
    );

    expect(result.score).toBe(0.7);
    expect(result.decision).toBe("review");
  });

  it("keeps weak matches separate", () => {
    const result = matchPersons(
      { name: "Jane Doe", title: "Engineer" },
      { name: "John Smith", title: "Designer" },
    );

    expect(result.score).toBeLessThan(0.7);
    expect(result.decision).toBe("separate");
  });

  it("classifies threshold boundaries", () => {
    expect(classifyMatchDecision(0.9)).toBe("auto_merge");
    expect(classifyMatchDecision(0.89)).toBe("review");
    expect(classifyMatchDecision(0.7)).toBe("review");
    expect(classifyMatchDecision(0.69)).toBe("separate");
  });
});
