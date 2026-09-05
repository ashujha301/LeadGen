import { afterEach, describe, expect, it, vi } from "vitest";

describe("env DATABASE_URL during next build", () => {
  const originalPhase = process.env.NEXT_PHASE;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalPhase === undefined) {
      delete process.env.NEXT_PHASE;
    } else {
      process.env.NEXT_PHASE = originalPhase;
    }
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    // Force re-import with fresh module state after each case.
    return import("@/shared/config/env").then(({ resetEnvCache }) => {
      resetEnvCache();
    });
  });

  it("allows getEnv without DATABASE_URL when NEXT_PHASE is production build", async () => {
    delete process.env.DATABASE_URL;
    process.env.NEXT_PHASE = "phase-production-build";

    vi.resetModules();
    const { getEnv, resetEnvCache } = await import("@/shared/config/env");
    resetEnvCache();

    const env = getEnv();
    expect(env.DATABASE_URL).toMatch(/^postgresql:\/\//);
  });

  it("still requires DATABASE_URL outside production build", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.NEXT_PHASE;

    vi.resetModules();
    const { getEnv, resetEnvCache } = await import("@/shared/config/env");
    resetEnvCache();

    expect(() => getEnv()).toThrow(/DATABASE_URL/);
  });
});
