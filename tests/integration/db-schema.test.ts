import { describe, expect, it } from "vitest";
import * as schema from "@/server/infrastructure/db";

const EXPECTED_TABLES = [
  "searchRuns",
  "sourceDocuments",
  "observations",
  "companies",
  "companyAliases",
  "people",
  "employments",
  "contactPoints",
  "businessSignals",
  "entityMatches",
  "leadCandidates",
  "scoreComponents",
  "aiCalls",
  "requestLimits",
  "runEvents",
  "personExternalProfiles",
  "companyExternalProfiles",
  "personExperienceMetrics",
  "mergeAudits",
];

describe("database schema characterization", () => {
  it("exports all core tables", () => {
    for (const table of EXPECTED_TABLES) {
      expect(schema).toHaveProperty(table);
    }
  });

  it("exports repository helpers", () => {
    expect(schema).toHaveProperty("runsRepo");
    expect(schema).toHaveProperty("leadsRepo");
    expect(schema).toHaveProperty("entitiesRepo");
    expect(schema).toHaveProperty("getDb");
  });
});
