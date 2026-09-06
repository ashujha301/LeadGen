import { describe, expect, it } from "vitest";
import { createRunRequestSchema } from "@/shared/contracts";

describe("API validation", () => {
  it("accepts a valid create run request with industries and locations only", () => {
    const result = createRunRequestSchema.safeParse({
      domain: "example.com",
      icp: {
        industries: ["B2B SaaS"],
        locations: ["United States"],
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

  it("rejects create-run requests that include employeeRange", () => {
    const result = createRunRequestSchema.safeParse({
      domain: "example.com",
      icp: {
        industries: ["B2B SaaS"],
        employeeRange: { min: 10, max: 500 },
      },
    });
    expect(result.success).toBe(false);
  });
});
