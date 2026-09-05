import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("HVL navigation characterization", () => {
  it("company HVL table links to nested company-scoped lead route", () => {
    const src = readFileSync(join(root, "src/app/high-value-leads/[companyId]/page.tsx"), "utf8");
    expect(src).toMatch(/\/high-value-leads\/\$\{companyId\}\/leads\/\$\{lead\.id\}/);
  });

  it("generic lead detail still offers View person -> /people/[personId]", () => {
    const src = readFileSync(join(root, "src/app/leads/[leadId]/page.tsx"), "utf8");
    expect(src).toMatch(/\/people\/\$\{lead\.personId\}/);
    expect(src).toMatch(/View person/);
  });

  it("person page hardcodes Back to /", () => {
    const src = readFileSync(join(root, "src/app/people/[personId]/page.tsx"), "utf8");
    expect(src).toMatch(/href="\/"/);
  });
});
