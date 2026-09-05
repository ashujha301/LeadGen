import { describe, expect, it, vi } from "vitest";

import { userOwnsCompany, userOwnsPerson } from "@/server/infrastructure/db/repositories/ownership";

type FakeDbOptions = {
  rows: Array<{ id: string }>;
};

function createFakeDb({ rows }: FakeDbOptions) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));

  return {
    db: { select } as never,
    select,
    from,
    innerJoin,
    where,
    limit,
  };
}

describe("ownership helpers", () => {
  it("userOwnsPerson is true when a lead on the user's runs exists", async () => {
    const { db, limit } = createFakeDb({ rows: [{ id: "lead-1" }] });

    await expect(userOwnsPerson(db, "person-1", "user-a")).resolves.toBe(true);
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("userOwnsPerson is false when no matching lead exists", async () => {
    const { db } = createFakeDb({ rows: [] });

    await expect(userOwnsPerson(db, "person-1", "user-b")).resolves.toBe(false);
  });

  it("userOwnsCompany is true when a lead on the user's runs exists", async () => {
    const { db } = createFakeDb({ rows: [{ id: "lead-2" }] });

    await expect(userOwnsCompany(db, "company-1", "user-a")).resolves.toBe(true);
  });

  it("userOwnsCompany is false when no matching lead exists", async () => {
    const { db } = createFakeDb({ rows: [] });

    await expect(userOwnsCompany(db, "company-1", "user-b")).resolves.toBe(false);
  });
});
