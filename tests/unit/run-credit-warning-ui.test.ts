import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("run detail Crustdata credit warning UI", () => {
  it("shows a persistent alert above discovered people for credit warnings", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/runs/run-detail-client.tsx"),
      "utf8",
    );

    expect(source).toContain("Crustdata enrichment unavailable");
    expect(source).toContain(
      "Crustdata credits are exhausted. Check your Crustdata account. Website results will continue, but LinkedIn and employment enrichment may be incomplete.",
    );
    expect(source).toContain("run.warnings");
    expect(source.indexOf("Crustdata enrichment unavailable")).toBeLessThan(
      source.indexOf("Discovered people") > -1
        ? source.indexOf("Discovered people")
        : source.indexOf("Live discovered people"),
    );
  });
});
