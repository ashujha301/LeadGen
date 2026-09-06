import { beforeEach, describe, expect, it, vi } from "vitest";

const userOwnsPerson = vi.fn();
const getPersonById = vi.fn();
const getContactPointsByPersonId = vi.fn();
const enrichPerson = vi.fn();
const isCrustdataEnabled = vi.fn();
const persistPersonEnrichment = vi.fn();

vi.mock("@/server/infrastructure/db", () => ({
  getDb: () => ({}),
  userOwnsPerson,
  entitiesRepo: {
    getPersonById,
    getContactPointsByPersonId,
  },
}));

vi.mock("@/server/infrastructure/connectors", () => ({
  enrichPerson,
  isCrustdataEnabled,
}));

vi.mock("@/shared/config/server", () => ({
  getEnv: () => ({ CRUSTDATA_PEOPLE_TIMEOUT_MS: 5000 }),
}));

vi.mock("@/server/application/services/persist-person-enrichment", () => ({
  persistPersonEnrichment,
}));

describe("backfillPersonTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    userOwnsPerson.mockResolvedValue(true);
    isCrustdataEnabled.mockReturnValue(true);
    getPersonById.mockResolvedValue({
      id: "person-1",
      profileUrl: null,
    });
    getContactPointsByPersonId.mockResolvedValue([
      { type: "linkedin", rawValue: "https://linkedin.com/in/example" },
    ]);
  });

  it("re-runs Crustdata person enrich with cache bypass when timeline is empty", async () => {
    enrichPerson.mockResolvedValue({
      status: "success",
      data: [
        {
          status: "matched",
          experience: [{ companyName: "Acme", isCurrent: true }],
        },
      ],
    });
    persistPersonEnrichment.mockResolvedValue({
      timelineStatus: "available",
      employmentCount: 1,
      calculatedTotalMonths: 12,
      providerExperienceYears: 1,
      leadershipExperienceMonths: 0,
    });

    const { backfillPersonTimeline } = await import(
      "@/server/application/services/backfill-person-timeline"
    );
    const result = await backfillPersonTimeline("person-1", "user-a");

    expect(enrichPerson).toHaveBeenCalledWith(["https://linkedin.com/in/example"], {
      cacheBypass: true,
      timeoutMs: 5000,
    });
    expect(persistPersonEnrichment).toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      timelineStatus: "available",
      employmentCount: 1,
      calculatedTotalMonths: 12,
      providerExperienceYears: 1,
      leadershipExperienceMonths: 0,
    });
  });

  it("allows re-enrich when employment history already exists", async () => {
    enrichPerson.mockResolvedValue({
      status: "success",
      data: [{ status: "matched", experience: [{ companyName: "Acme", isCurrent: true }] }],
    });
    persistPersonEnrichment.mockResolvedValue({
      timelineStatus: "available",
      employmentCount: 2,
      calculatedTotalMonths: 24,
      providerExperienceYears: 2,
      leadershipExperienceMonths: 0,
    });

    const { backfillPersonTimeline } = await import(
      "@/server/application/services/backfill-person-timeline"
    );
    const result = await backfillPersonTimeline("person-1", "user-a");

    expect(result.ok).toBe(true);
    expect(enrichPerson).toHaveBeenCalled();
    expect(persistPersonEnrichment).toHaveBeenCalled();
  });

  it("requires a LinkedIn profile URL", async () => {
    getContactPointsByPersonId.mockResolvedValue([]);
    getPersonById.mockResolvedValue({ id: "person-1", profileUrl: null });
    const { backfillPersonTimeline } = await import(
      "@/server/application/services/backfill-person-timeline"
    );

    const result = await backfillPersonTimeline("person-1", "user-a");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("VALIDATION_ERROR");
    }
  });
});
