import { describe, expect, it } from "vitest";

import { filterRowsToOwnedPersonIds } from "@/server/domain/search/connection-search";

describe("overlap ownership filter", () => {
  it("keeps only rows whose personId is in the owned set", () => {
    const rows = [
      { personId: "p-owned", name: "A" },
      { personId: "p-other", name: "B" },
      { personId: "p-owned-2", name: "C" },
    ];

    expect(filterRowsToOwnedPersonIds(rows, ["p-owned", "p-owned-2"])).toEqual([
      { personId: "p-owned", name: "A" },
      { personId: "p-owned-2", name: "C" },
    ]);
  });

  it("returns no rows when ownedPersonIds is empty", () => {
    const rows = [{ personId: "p-1", name: "A" }];
    expect(filterRowsToOwnedPersonIds(rows, [])).toEqual([]);
  });

  it("does not filter when ownedPersonIds is undefined (legacy callers)", () => {
    const rows = [{ personId: "p-1", name: "A" }];
    expect(filterRowsToOwnedPersonIds(rows, undefined)).toEqual(rows);
  });
});
