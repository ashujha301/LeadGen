import { describe, expect, it } from "vitest";

import { planRunCreation } from "@/server/application/services/run-service";

describe("run cancel support", () => {
  it("treats canceled as a terminal run status in contracts", async () => {
    const { runStatusSchema } = await import("@/shared/contracts/run");
    expect(runStatusSchema.safeParse("canceled").success).toBe(true);
  });

  it("does not reuse an active run when creating a new one after cancel", () => {
    const plan = planRunCreation({
      clientIdempotencyKey: undefined,
      existingByIdempotencyKey: false,
      activeRunForDomainAndIp: false,
    });
    expect(plan.kind).toBe("create_new");
  });
});
