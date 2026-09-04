import { describe, expect, it } from "vitest";
import { createRunRequestSchema } from "@/shared/contracts";

describe("API validation", () => {
  it("accepts a valid create run request", () => {
    const result = createRunRequestSchema.safeParse({
      domain: "example.com",
      icp: {
        industries: ["B2B SaaS"],
        locations: ["United States"],
        employeeRange: { min: 10, max: 500 },
      },
      targetRoles: ["ceo", "founder"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid domains", () => {
    const result = createRunRequestSchema.safeParse({ domain: "not a domain!" });
    expect(result.success).toBe(false);
  });

  it("rejects domains that are too short", () => {
    const result = createRunRequestSchema.safeParse({ domain: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects negative employee minimums", () => {
    const result = createRunRequestSchema.safeParse({
      domain: "example.com",
      icp: { employeeRange: { min: -1 } },
    });
    expect(result.success).toBe(false);
  });
});
