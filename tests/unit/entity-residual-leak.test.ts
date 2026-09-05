import { beforeEach, describe, expect, it, vi } from "vitest";

const userOwnsCompany = vi.fn();
const userOwnsPerson = vi.fn();
const listOwnedPersonIdsForCompany = vi.fn();
const listOwnedCompanyIdsForPerson = vi.fn();
const getCompanyById = vi.fn();
const getPersonById = vi.fn();
const getEmploymentsByCompanyId = vi.fn();
const getEmploymentsByPersonId = vi.fn();
const getBusinessSignalsByCompanyId = vi.fn();
const getCompanyAliasesByCompanyId = vi.fn();
const getContactPointsByPersonId = vi.fn();
const findSourceDocumentsByDomainForUser = vi.fn();

vi.mock("@/server/infrastructure/db", () => ({
  getDb: () => ({}),
  userOwnsCompany: (...args: unknown[]) => userOwnsCompany(...args),
  userOwnsPerson: (...args: unknown[]) => userOwnsPerson(...args),
  listOwnedPersonIdsForCompany: (...args: unknown[]) => listOwnedPersonIdsForCompany(...args),
  listOwnedCompanyIdsForPerson: (...args: unknown[]) => listOwnedCompanyIdsForPerson(...args),
  entitiesRepo: {
    getCompanyById,
    getPersonById,
    getEmploymentsByCompanyId,
    getEmploymentsByPersonId,
    getBusinessSignalsByCompanyId,
    getCompanyAliasesByCompanyId,
    getContactPointsByPersonId,
  },
  sourcesRepo: {
    findSourceDocumentsByDomainForUser,
  },
}));

describe("entity detail residual leak hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getCompany only returns people the user owns via their leads", async () => {
    userOwnsCompany.mockResolvedValue(true);
    getCompanyById.mockResolvedValue({
      id: "c1",
      name: "Acme",
      normalizedDomain: "acme.com",
      industry: null,
      location: null,
      employeeCount: null,
      confidence: 1,
      freshness: 1,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
    getEmploymentsByCompanyId.mockResolvedValue([
      { personId: "p-owned", rawTitle: "CEO", isCurrent: true },
      { personId: "p-other", rawTitle: "CTO", isCurrent: true },
    ]);
    listOwnedPersonIdsForCompany.mockResolvedValue(["p-owned"]);
    getPersonById.mockImplementation(async (_db: unknown, id: string) => ({
      id,
      name: id === "p-owned" ? "Owned" : "Other",
    }));
    getBusinessSignalsByCompanyId.mockResolvedValue([]);
    getCompanyAliasesByCompanyId.mockResolvedValue([]);
    findSourceDocumentsByDomainForUser.mockResolvedValue([]);

    const { entityService } = await import("@/server/application/services/entity-service");
    const detail = await entityService.getCompany("c1", "user-a");

    expect(listOwnedPersonIdsForCompany).toHaveBeenCalledWith({}, "c1", "user-a");
    expect(findSourceDocumentsByDomainForUser).toHaveBeenCalledWith({}, "acme.com", "user-a");
    expect(detail?.people).toEqual([
      { id: "p-owned", name: "Owned", title: "CEO", isCurrent: true },
    ]);
  });

  it("getPerson only returns employments at companies the user owns", async () => {
    userOwnsPerson.mockResolvedValue(true);
    getPersonById.mockResolvedValue({
      id: "p1",
      name: "Pat",
      normalizedName: "pat",
      profileUrl: null,
      confidence: 1,
      freshness: 1,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
    getContactPointsByPersonId.mockResolvedValue([]);
    getEmploymentsByPersonId.mockResolvedValue([
      {
        companyId: "c-owned",
        rawTitle: "Eng",
        startDate: null,
        endDate: null,
        isCurrent: true,
        confidence: 1,
        employerName: null,
        employerDomain: null,
      },
      {
        companyId: "c-other",
        rawTitle: "Advisor",
        startDate: null,
        endDate: null,
        isCurrent: false,
        confidence: 1,
        employerName: null,
        employerDomain: null,
      },
    ]);
    listOwnedCompanyIdsForPerson.mockResolvedValue(["c-owned"]);
    getCompanyById.mockResolvedValue({ id: "c-owned", name: "Owned Co" });

    const { entityService } = await import("@/server/application/services/entity-service");
    const detail = await entityService.getPerson("p1", "user-a");

    expect(listOwnedCompanyIdsForPerson).toHaveBeenCalledWith({}, "p1", "user-a");
    expect(detail?.employments).toHaveLength(1);
    expect(detail?.employments[0]?.companyId).toBe("c-owned");
  });
});
