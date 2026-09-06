import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("timeline Crustdata backfill UI", () => {
  it("offers re-enrich for empty and non-empty timelines when personId is known", () => {
    const timeline = readFileSync(
      join(process.cwd(), "src/features/entities/employment-timeline.tsx"),
      "utf8",
    );
    const button = readFileSync(
      join(process.cwd(), "src/features/entities/timeline-backfill-button.tsx"),
      "utf8",
    );

    expect(timeline).toContain("personId");
    expect(timeline.match(/TimelineBackfillButton/g)?.length).toBeGreaterThanOrEqual(2);
    expect(button).toContain("Re-run Crustdata enrich");
    expect(button).toContain("backfillPersonTimeline");
  });
});
