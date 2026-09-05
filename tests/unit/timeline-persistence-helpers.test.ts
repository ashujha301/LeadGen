import { describe, expect, it } from "vitest";

import {
  buildEmploymentFingerprint,
  deriveTimelineStatus,
} from "@/server/application/services/persist-person-enrichment";
import { calculateExperienceMetrics } from "@/server/domain/timeline/experience-calculation";

describe("timeline persistence helpers", () => {
  it("builds stable fingerprints for idempotent upserts", () => {
    const left = buildEmploymentFingerprint({
      personId: "p1",
      companyId: null,
      employerName: "Appknox",
      employerDomain: "appknox.com",
      employerProfessionalNetworkUrl: null,
      title: "Founder",
      startDate: "2014-01-01",
      endDate: null,
      isCurrent: true,
    });
    const right = buildEmploymentFingerprint({
      personId: "p1",
      companyId: null,
      employerName: "Appknox",
      employerDomain: "appknox.com",
      employerProfessionalNetworkUrl: null,
      title: "Founder",
      startDate: "2014-01-01",
      endDate: null,
      isCurrent: true,
    });
    expect(left).toBe(right);
  });

  it("merges overlapping intervals when calculating experience", () => {
    const result = calculateExperienceMetrics([
      {
        startDate: new Date("2010-01-01"),
        endDate: new Date("2012-01-01"),
        isLeadership: false,
      },
      {
        startDate: new Date("2011-01-01"),
        endDate: new Date("2013-01-01"),
        isLeadership: true,
      },
    ]);

    expect(result.calculatedTotalMonths).toBeGreaterThan(24);
    expect(result.calculatedTotalMonths).toBeLessThan(48);
    expect(result.leadershipExperienceMonths).toBeGreaterThan(0);
  });

  it("derives timeline statuses from enrichment outcomes", () => {
    expect(deriveTimelineStatus({ enrichmentStatus: "not_found", employmentCount: 0 })).toBe(
      "not_found",
    );
    expect(deriveTimelineStatus({ enrichmentStatus: "matched", employmentCount: 2 })).toBe(
      "available",
    );
    expect(deriveTimelineStatus({ enrichmentStatus: "matched", employmentCount: 0 })).toBe(
      "no_history",
    );
  });
});
