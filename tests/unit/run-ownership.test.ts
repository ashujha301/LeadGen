import { beforeEach, describe, expect, it, vi } from "vitest";

const getRunByIdForUser = vi.fn();
const listRecentRunsForUser = vi.fn();
const cancelRunIfActive = vi.fn();
const getActiveRunByDomainAndUser = vi.fn();
const getRunByIdempotencyKeyForUser = vi.fn();
const countActiveRunsByUser = vi.fn();
const getLatestCompletedRunByDomainForUser = vi.fn();
const createRun = vi.fn();
const countRunsCreatedSince = vi.fn();

vi.mock("@/server/infrastructure/db", () => ({
  getDb: () => ({}),
  runsRepo: {
    getRunByIdForUser,
    listRecentRunsForUser,
    cancelRunIfActive,
    getActiveRunByDomainAndUser,
    getRunByIdempotencyKeyForUser,
    countActiveRunsByUser,
    getLatestCompletedRunByDomainForUser,
    createRun,
    countRunsCreatedSince,
  },
  requestLimitsRepo: {
    getOrCreateRequestLimit: vi.fn().mockResolvedValue({ runCount: 0 }),
    incrementRunCount: vi.fn(),
    incrementActiveRunCount: vi.fn(),
    decrementActiveRunCount: vi.fn(),
  },
  startOfUtcDay: () => new Date("2026-01-01T00:00:00.000Z"),
}));

vi.mock("@/server/infrastructure/queue/web-queue", () => ({
  enqueueRun: vi.fn(),
  cancelQueuedRun: vi.fn(),
}));

vi.mock("@/server/infrastructure/run-abort", () => ({
  abortRunProcessing: vi.fn(),
}));

vi.mock("@/shared/config/server", () => ({
  getEnv: () => ({
    PUBLIC_ACTIVE_RUNS_PER_IP: 1,
    PUBLIC_RUN_LIMIT_PER_IP_DAY: 10,
    PUBLIC_GLOBAL_RUN_LIMIT_DAY: 100,
  }),
}));

function makeRun(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-01-02T12:00:00.000Z");
  return {
    id: "run-1",
    inputDomain: "example.com",
    normalizedDomain: "example.com",
    status: "completed",
    progress: { stage: "completed" },
    refreshOfRunId: null,
    errorCode: null,
    errorMessage: null,
    errorRecoverable: null,
    hashedClientIp: "hashed",
    userId: "user-a",
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    ...overrides,
  };
}

describe("run ownership scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("getRun returns null when the run is not owned by the user", async () => {
    getRunByIdForUser.mockResolvedValue(undefined);
    const { runService } = await import("@/server/application/services/run-service");

    await expect(runService.getRun("run-1", "user-b")).resolves.toBeNull();
    expect(getRunByIdForUser).toHaveBeenCalledWith({}, "run-1", "user-b");
  });

  it("getRun returns the run when the user owns it", async () => {
    getRunByIdForUser.mockResolvedValue(makeRun({ userId: "user-a" }));
    const { runService } = await import("@/server/application/services/run-service");

    const run = await runService.getRun("run-1", "user-a");
    expect(run).not.toBeNull();
    expect(run?.id).toBe("run-1");
    expect(run?.domain).toBe("example.com");
  });

  it("listRecent only queries runs for the requesting user", async () => {
    listRecentRunsForUser.mockResolvedValue([makeRun({ id: "run-owned" })]);
    const { runService } = await import("@/server/application/services/run-service");

    const runs = await runService.listRecent("user-a", 10);
    expect(listRecentRunsForUser).toHaveBeenCalledWith({}, "user-a", 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe("run-owned");
  });

  it("cancelRun returns null when another user tries to cancel the run", async () => {
    getRunByIdForUser.mockResolvedValue(undefined);
    const { runService } = await import("@/server/application/services/run-service");

    await expect(runService.cancelRun("run-1", "user-b")).resolves.toBeNull();
    expect(cancelRunIfActive).not.toHaveBeenCalled();
  });

  it("createRun persists the authenticated userId on the new run", async () => {
    getRunByIdempotencyKeyForUser.mockResolvedValue(undefined);
    getActiveRunByDomainAndUser.mockResolvedValue(undefined);
    countActiveRunsByUser.mockResolvedValue(0);
    countRunsCreatedSince.mockResolvedValue(0);
    getLatestCompletedRunByDomainForUser.mockResolvedValue(undefined);
    createRun.mockResolvedValue(makeRun({ status: "queued", userId: "user-a", completedAt: null }));

    const { runService } = await import("@/server/application/services/run-service");

    await runService.createRun(
      {
        domain: { input: "example.com", normalizedDomain: "example.com" },
      } as never,
      "user-a",
      "hashed-ip",
    );

    expect(createRun).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: "user-a",
        normalizedDomain: "example.com",
        hashedClientIp: "hashed-ip",
      }),
    );
  });
});
