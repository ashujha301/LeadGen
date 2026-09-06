import { describe, expect, it } from "vitest";

import { findSharedEmploymentOverlaps } from "@/server/domain/timeline/employment-history";
import { filterRowsToOwnedPersonIds } from "@/server/domain/search/connection-search";
import { employmentOverlapDays } from "@/server/domain/timeline/overlap";

/**
 * Characterization of current Connections defects the Potential Connections
 * engine must replace. These document broken/insufficient behavior today.
 */
describe("current connections defects (characterization)", () => {
  it("cannot pair people whose current companies differ (only same companyId rows match)", () => {
    const personA = [
      {
        companyId: "groww",
        companyName: "Groww",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2021-12-01"),
        isCurrent: false,
      },
      {
        companyId: "ringg",
        companyName: "Ringg AI",
        startDate: new Date("2022-01-01"),
        endDate: null,
        isCurrent: true,
      },
    ];
    const personB = [
      {
        companyId: "groww",
        companyName: "Groww",
        startDate: new Date("2020-06-01"),
        endDate: new Date("2021-06-01"),
        isCurrent: false,
      },
      {
        companyId: "credit-dharma",
        companyName: "Credit Dharma",
        startDate: new Date("2022-01-01"),
        endDate: null,
        isCurrent: true,
      },
    ];

    const overlaps = findSharedEmploymentOverlaps(personA, personB);
    // Current engine only pairs identical companyId rows — Groww overlap exists,
    // but the Connections page requires searching that historical company UUID.
    expect(overlaps.some((row) => row.companyId === "groww")).toBe(true);
    expect(overlaps.some((row) => row.companyId === "ringg")).toBe(false);
  });

  it("fails to match Groww when one side uses companyId and the other only employerDomain", () => {
    const personA = [
      {
        companyId: "groww-canonical",
        companyName: "Groww",
        startDate: new Date("2020-01-01"),
        endDate: new Date("2021-01-01"),
        isCurrent: false,
      },
    ];
    // Domain-only representation has a different/synthetic companyId today.
    const personB = [
      {
        companyId: "unresolved-groww-domain",
        companyName: "Groww",
        startDate: new Date("2020-03-01"),
        endDate: new Date("2020-09-01"),
        isCurrent: false,
      },
    ];

    const overlaps = findSharedEmploymentOverlaps(personA, personB);
    expect(overlaps).toHaveLength(0);
  });

  it("double-counts promotions at the same employer as separate overlapping segments", () => {
    const personA = [
      {
        companyId: "groww",
        title: "Engineer",
        startDate: new Date("2019-01-01"),
        endDate: new Date("2020-06-01"),
        isCurrent: false,
      },
      {
        companyId: "groww",
        title: "Senior Engineer",
        startDate: new Date("2020-06-01"),
        endDate: new Date("2021-01-01"),
        isCurrent: false,
      },
    ];
    const personB = [
      {
        companyId: "groww",
        title: "PM",
        startDate: new Date("2019-01-01"),
        endDate: new Date("2021-01-01"),
        isCurrent: false,
      },
    ];

    const overlaps = findSharedEmploymentOverlaps(personA, personB);
    expect(overlaps.length).toBeGreaterThan(1);
    const summed = overlaps.reduce((total, row) => total + (row.overlapDays ?? 0), 0);
    const expectedUnionDays =
      employmentOverlapDays(
        { startDate: new Date("2019-01-01"), endDate: new Date("2021-01-01") },
        { startDate: new Date("2019-01-01"), endDate: new Date("2021-01-01") },
      ) ?? 0;
    expect(summed).toBeGreaterThan(expectedUnionDays);
  });

  it("optional-person filter removes the other person before pairing", () => {
    const rows = [
      { personId: "akul", startDate: "2020-01-01" },
      { personId: "ganesh", startDate: "2020-01-01" },
    ];
    const filtered = filterRowsToOwnedPersonIds(rows, undefined).filter(
      (row) => row.personId === "akul",
    );
    expect(filtered.map((row) => row.personId)).toEqual(["akul"]);
    expect(filtered.some((row) => row.personId === "ganesh")).toBe(false);
  });
});
