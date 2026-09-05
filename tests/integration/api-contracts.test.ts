import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  createRunRequestSchema,
  errorCodeSchema,
  naturalSearchRequestSchema,
  overlapSearchParamsSchema,
  runStatusSchema,
} from "@/shared/contracts";

const API_ROOT = join(process.cwd(), "src/app/api");

function collectRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectRouteFiles(full));
    } else if (entry === "route.ts") {
      files.push(full);
    }
  }
  return files;
}

describe("API route contract characterization", () => {
  it("exposes all expected route handlers", () => {
    const routes = collectRouteFiles(API_ROOT).map((file) =>
      file.replace(`${API_ROOT}/`, "").replace("/route.ts", ""),
    );

    expect(routes.sort()).toEqual(
      [
        "auth/[...nextauth]",
        "health/live",
        "health/ready",
        "v1/companies/[companyId]",
        "v1/connections/overlap",
        "v1/entity-matches",
        "v1/exports/[runId]",
        "v1/high-value-leads/companies",
        "v1/high-value-leads/companies/[companyId]",
        "v1/leads/[leadId]",
        "v1/leads/[leadId]/graph",
        "v1/people/[personId]",
        "v1/runs",
        "v1/runs/[runId]",
        "v1/runs/[runId]/cancel",
        "v1/runs/[runId]/events",
        "v1/runs/[runId]/leads",
        "v1/search/natural",
      ].sort(),
    );
  });

  it("defines the run lifecycle statuses", () => {
    expect([...runStatusSchema.options].sort()).toEqual(
      [
        "queued",
        "discovering",
        "extracting",
        "resolving",
        "enriching",
        "scoring",
        "completed",
        "failed",
        "canceled",
      ].sort(),
    );
  });

  it("defines standard error codes", () => {
    expect(errorCodeSchema.options).toContain("VALIDATION_ERROR");
    expect(errorCodeSchema.options).toContain("RATE_LIMITED");
    expect(errorCodeSchema.options).toContain("QUOTA_EXCEEDED");
  });

  it("validates create run request shape", () => {
    const parsed = createRunRequestSchema.safeParse({
      domain: "example.com",
      targetRoles: ["ceo"],
    });
    expect(parsed.success).toBe(true);
  });

  it("validates natural search request shape", () => {
    const parsed = naturalSearchRequestSchema.safeParse({ query: "founders in SaaS" });
    expect(parsed.success).toBe(true);
  });

  it("validates overlap search params", () => {
    const parsed = overlapSearchParamsSchema.safeParse({
      companyId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(parsed.success).toBe(true);
  });

  it("route handlers export Node runtime", () => {
    const sampleRoutes = [
      "v1/runs/route.ts",
      "v1/leads/[leadId]/route.ts",
      "health/ready/route.ts",
    ];

    for (const route of sampleRoutes) {
      const contents = readFileSync(join(API_ROOT, route), "utf8");
      expect(contents).toContain('runtime = "nodejs"');
    }
  });
});
