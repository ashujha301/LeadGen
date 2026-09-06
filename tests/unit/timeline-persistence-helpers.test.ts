import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __test,
  buildEmploymentFingerprint,
  deriveTimelineStatus,
} from "@/server/application/services/persist-person-enrichment";
import { calculateExperienceMetrics } from "@/server/domain/timeline/experience-calculation";
import { entitiesRepo, type Db, type Employment } from "@/server/infrastructure/db";

describe("timeline persistence helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("recovers a current-employment collision without stealing provider identity", async () => {
    const canonical = {
      id: "canonical-employment",
      firstObservedAt: new Date("2025-01-01T00:00:00Z"),
      providerEmploymentId: null,
      providerFingerprint: null,
    } as Employment;
    vi.spyOn(entitiesRepo, "findCurrentEmployment").mockResolvedValue(canonical);
    const update = vi
      .spyOn(entitiesRepo, "updateEmployment")
      .mockResolvedValue({ ...canonical, rawTitle: "Executive" } as Employment);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const recovered = await __test.recoverCurrentEmploymentConflict({} as Db, {
      personId: "person-1",
      companyId: "company-1",
      payload: {
        rawTitle: "Executive",
        firstObservedAt: new Date("2026-01-01T00:00:00Z"),
        providerEmploymentId: "0",
        providerFingerprint: "incorrect-provider-match",
      },
    });

    expect(recovered.id).toBe("canonical-employment");
    expect(update).toHaveBeenCalledWith(
      expect.anything(),
      "canonical-employment",
      expect.objectContaining({
        rawTitle: "Executive",
        firstObservedAt: canonical.firstObservedAt,
        providerEmploymentId: null,
        providerFingerprint: null,
      }),
    );
  });
});
