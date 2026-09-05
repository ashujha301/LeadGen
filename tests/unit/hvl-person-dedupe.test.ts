import { describe, expect, it } from "vitest";
import { pickCanonicalLeadPerPerson } from "@/server/domain/leads/hvl-person-dedupe";

describe("pickCanonicalLeadPerPerson", () => {
  it("keeps the higher-scoring Chaitanya row when two non-stale leads exist", () => {
    const picked = pickCanonicalLeadPerPerson([
      {
        id: "old-54",
        personId: "chaitanya",
        finalScore: 54,
        updatedAt: new Date("2026-09-05T09:57:00Z"),
      },
      {
        id: "new-39",
        personId: "chaitanya",
        finalScore: 39,
        updatedAt: new Date("2026-09-05T10:30:00Z"),
      },
      {
        id: "rushabh",
        personId: "rushabh",
        finalScore: 39,
        updatedAt: new Date("2026-09-05T10:00:00Z"),
      },
    ]);
    expect(picked.map((l) => l.id).sort()).toEqual(["old-54", "rushabh"].sort());
  });
});
