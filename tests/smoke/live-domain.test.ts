import { describe, expect, it } from "vitest";

const LIVE_DOMAIN = process.env.SMOKE_DOMAIN;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const describeSmoke = LIVE_DOMAIN && process.env.RUN_SMOKE === "true" ? describe : describe.skip;

describeSmoke("live domain smoke", () => {
  it("creates a run against a controlled live domain", async () => {
    const res = await fetch(`${APP_URL}/api/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: LIVE_DOMAIN,
        targetRoles: ["ceo", "founder"],
      }),
    });

    expect(res.status).toBeLessThan(500);
    const body = await res.json();

    if (res.ok) {
      expect(body.data.id).toBeTruthy();
      expect(body.data.normalizedDomain).toBeTruthy();
    } else {
      // Quota or validation failures are acceptable in shared demo environments
      expect(body.error?.code).toBeTruthy();
    }
  }, 60000);

  it("health endpoints respond", async () => {
    const live = await fetch(`${APP_URL}/api/health/live`);
    expect(live.ok).toBe(true);

    const ready = await fetch(`${APP_URL}/api/health/ready`);
    expect([200, 503]).toContain(ready.status);
  });
});
