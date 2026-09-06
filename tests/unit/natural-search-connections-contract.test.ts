import { describe, expect, it } from "vitest";

import { escapeIlikePattern, MAX_NATURAL_SEARCH_RESULTS } from "@/server/application/search";

describe("connection semantics contract", () => {
  it("keeps hard result cap at 50", () => {
    expect(MAX_NATURAL_SEARCH_RESULTS).toBe(50);
  });

  it("escapes company B wildcard characters", () => {
    expect(escapeIlikePattern("Acme_%")).toBe("Acme\\_\\%");
  });
});
