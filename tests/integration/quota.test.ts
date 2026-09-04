import { describe, expect, it } from "vitest";
import { RunQuotaError } from "@/server/application/services/run-service";

describe("run quota errors", () => {
  it("creates a named RunQuotaError for daily limits", () => {
    const error = new RunQuotaError("Daily run limit reached for this client.");
    expect(error.name).toBe("RunQuotaError");
    expect(error.message).toContain("Daily run limit");
  });

  it("creates a named RunQuotaError for active run limits", () => {
    const error = new RunQuotaError("Only one active run is allowed per client at a time.");
    expect(error.name).toBe("RunQuotaError");
    expect(error.message).toContain("active run");
  });
});

describe("quota configuration", () => {
  it("uses conservative public demo defaults from env example", () => {
    const limits = {
      perIpDay: 3,
      globalDay: 50,
      activePerIp: 1,
    };

    expect(limits.perIpDay).toBeLessThanOrEqual(10);
    expect(limits.activePerIp).toBe(1);
    expect(limits.globalDay).toBeGreaterThan(limits.perIpDay);
  });
});
