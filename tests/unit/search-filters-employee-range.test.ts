import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("search filters without employee range", () => {
  it("removes Min/Max employee inputs from ICP filters UI", () => {
    const source = readFileSync(join(ROOT, "src/features/search/icp-filters.tsx"), "utf8");
    expect(source).toContain("Target industry preference");
    expect(source).toContain("Location");
    expect(source).toContain("sm:grid-cols-2");
    expect(source).not.toContain("Min employees");
    expect(source).not.toContain("Max employees");
    expect(source).not.toContain("icp-min-employees");
    expect(source).not.toContain("icp-max-employees");
    expect(source).not.toContain("lg:grid-cols-4");
  });

  it("does not send employeeRange in create-run payload construction", () => {
    const form = readFileSync(join(ROOT, "src/features/search/domain-search-form.tsx"), "utf8");
    const client = readFileSync(join(ROOT, "src/shared/utils/api-client.ts"), "utf8");
    expect(form).not.toContain("employeeRange");
    expect(client).not.toMatch(/createRun[\s\S]*employeeRange/);
  });
});
