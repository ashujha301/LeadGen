import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("employer-link repair utility", () => {
  it("defaults to report-only and requires --apply", () => {
    const source = readFileSync(join(process.cwd(), "scripts/repair-employer-links.ts"), "utf8");
    expect(source).toContain('process.argv.includes("--apply")');
    expect(source).toContain("Report-only");
    expect(source).toContain("provider_company_id");
    expect(source).toContain("employer_domain");
    expect(source).toContain("employer_linkedin_url");
    expect(source).not.toContain("normalizeName(");
  });
});
