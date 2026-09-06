import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  potentialConnectionsQuerySchema,
  potentialConnectionsResponseSchema,
} from "@/shared/contracts";

describe("potential connections API contracts", () => {
  it("accepts optional filters and coerces includeLimited", () => {
    const parsed = potentialConnectionsQuerySchema.safeParse({
      strengthBand: "strong",
      minOverlapDays: "90",
      includeLimited: "true",
      limit: "25",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.minOverlapDays).toBe(90);
      expect(parsed.data.includeLimited).toBe(true);
      expect(parsed.data.limit).toBe(25);
    }
  });

  it("rejects invalid strength bands and non-uuid currentCompanyId", () => {
    expect(potentialConnectionsQuerySchema.safeParse({ strengthBand: "elite" }).success).toBe(
      false,
    );
    expect(
      potentialConnectionsQuerySchema.safeParse({ currentCompanyId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("validates response shape used by the page", () => {
    const sample = {
      items: [],
      summary: { total: 0, strong: 0, moderate: 0, weak: 0 },
      facets: { currentCompanies: [], sharedEmployers: [] },
      hasActiveRuns: false,
      revision: "0:empty:2026-01-01T00:00",
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(potentialConnectionsResponseSchema.safeParse(sample).success).toBe(true);
  });
});

describe("potential connections UI", () => {
  it("loads automatically without UUID form fields", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/connections/potential-connections-client.tsx"),
      "utf8",
    );
    expect(source).toContain("listPotentialConnections");
    expect(source).toContain("Potential Connections");
    expect(source).toContain("Potential connection based on shared employment");
    expect(source).not.toContain("Company ID");
    expect(source).not.toContain("Person ID");
    expect(source).toContain('defaultValue="table"');
    expect(source).toContain("hasActiveRuns");
    expect(source).toContain("5000");
  });

  it("renames the sidebar item to Potential Connections", () => {
    const source = readFileSync(join(process.cwd(), "src/features/shell/app-shell.tsx"), "utf8");
    expect(source).toContain('label: "Potential Connections"');
  });
});
