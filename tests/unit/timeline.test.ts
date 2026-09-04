import { describe, expect, it } from "vitest";
import {
  employmentRangesOverlap,
  findSharedEmploymentOverlaps,
  buildEmploymentHistory,
} from "@/server/domain";

describe("employment overlap", () => {
  it("detects overlapping ranges", () => {
    expect(
      employmentRangesOverlap(
        { startDate: new Date("2020-01-01"), endDate: new Date("2022-01-01") },
        { startDate: new Date("2021-01-01"), endDate: new Date("2023-01-01") },
      ),
    ).toBe(true);
  });

  it("treats missing dates as open-ended", () => {
    expect(
      employmentRangesOverlap(
        { startDate: null, endDate: new Date("2021-01-01") },
        { startDate: new Date("2020-06-01"), endDate: null },
      ),
    ).toBe(true);
  });

  it("returns false for non-overlapping ranges", () => {
    expect(
      employmentRangesOverlap(
        { startDate: new Date("2018-01-01"), endDate: new Date("2019-01-01") },
        { startDate: new Date("2020-01-01"), endDate: new Date("2021-01-01") },
      ),
    ).toBe(false);
  });

  it("finds shared company overlaps between people", () => {
    const overlaps = findSharedEmploymentOverlaps(
      [
        {
          companyId: "c1",
          companyName: "Acme",
          startDate: new Date("2020-01-01"),
          endDate: new Date("2022-06-01"),
        },
      ],
      [
        {
          companyId: "c1",
          companyName: "Acme",
          startDate: new Date("2021-01-01"),
          endDate: new Date("2023-01-01"),
        },
      ],
    );

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.companyId).toBe("c1");
    expect(overlaps[0]?.overlapDays).toBeGreaterThan(0);
  });

  it("sorts employment history newest first", () => {
    const history = buildEmploymentHistory([
      {
        companyId: "c1",
        startDate: new Date("2018-01-01"),
        endDate: new Date("2020-01-01"),
      },
      {
        companyId: "c2",
        startDate: new Date("2021-01-01"),
        endDate: null,
        isCurrent: true,
      },
    ]);

    expect(history[0]?.companyId).toBe("c2");
  });
});
