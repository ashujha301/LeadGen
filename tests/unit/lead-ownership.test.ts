import { beforeEach, describe, expect, it, vi } from "vitest";

const getLeadById = vi.fn();
const getRunByIdForUser = vi.fn();

vi.mock("@/server/infrastructure/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    query: {
      personExternalProfiles: {
        findFirst: async () => null,
      },
    },
  }),
  leadsRepo: {
    getLeadById,
  },
  runsRepo: {
    getRunByIdForUser,
  },
  entitiesRepo: {
    getContactPointsByPersonId: vi.fn().mockResolvedValue([]),
    getEmploymentsByPersonId: vi.fn().mockResolvedValue([]),
    getBusinessSignalsByCompanyId: vi.fn().mockResolvedValue([]),
    getCompanyById: vi.fn(),
  },
  sourcesRepo: {
    getSourceDocumentsByRunId: vi.fn().mockResolvedValue([]),
  },
}));

describe("lead ownership scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getLead returns null when the lead's run is not owned by the user", async () => {
    getLeadById.mockResolvedValue({
      id: "lead-1",
      runId: "run-1",
      personId: "person-1",
      companyId: "company-1",
    });
    getRunByIdForUser.mockResolvedValue(undefined);

    const { leadService } = await import("@/server/application/services/lead-service");
    await expect(leadService.getLead("lead-1", "user-b")).resolves.toBeNull();
    expect(getRunByIdForUser).toHaveBeenCalledWith(expect.anything(), "run-1", "user-b");
  });

  it("getLeadGraph returns null when the lead's run is not owned by the user", async () => {
    getLeadById.mockResolvedValue({
      id: "lead-1",
      runId: "run-1",
      personId: "person-1",
      companyId: "company-1",
      person: { id: "person-1" },
      company: { id: "company-1" },
    });
    getRunByIdForUser.mockResolvedValue(undefined);

    const { leadService } = await import("@/server/application/services/lead-service");
    await expect(leadService.getLeadGraph("lead-1", "user-b")).resolves.toBeNull();
  });
});
