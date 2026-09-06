import { describe, expect, it, vi } from "vitest";

import {
  MAX_NATURAL_SEARCH_RESULTS,
  escapeIlikePattern,
  compileSearchIntent,
  executeStructuredSearch,
} from "@/server/application/search/structured-search";
import { NaturalSearchError } from "@/server/application/search/natural-search-error";

describe("natural search query execution hardening", () => {
  it("escapes LIKE wildcards for literal matching", () => {
    expect(escapeIlikePattern("100%_safe")).toBe("100\\%\\_safe");
    expect(escapeIlikePattern("Appknox")).toBe("Appknox");
  });

  it("caps natural search results at 50", () => {
    expect(MAX_NATURAL_SEARCH_RESULTS).toBe(50);
  });

  it("requires userId when compiling leads search", () => {
    expect(() =>
      compileSearchIntent(
        { mode: "leads", company: "Appknox" },
        // @ts-expect-error intentional missing userId
        { runId: undefined },
      ),
    ).toThrow(NaturalSearchError);
  });

  it("rejects executeStructuredSearch without userId", async () => {
    await expect(
      executeStructuredSearch(
        {} as never,
        { mode: "leads", company: "Appknox" },
        // @ts-expect-error intentional
        {},
      ),
    ).rejects.toThrow(NaturalSearchError);
  });

  it("wraps structured search in a read-only timed transaction", async () => {
    const execute = vi.fn(async () => undefined);
    const limit = vi.fn(async () => []);
    const orderBy = vi.fn(() => ({ limit }));
    const groupBy = vi.fn(() => ({ orderBy }));
    const where = vi.fn(() => ({ groupBy }));
    const leftJoin = vi.fn(() => ({ leftJoin, where }));
    const innerJoin = vi.fn(() => ({ innerJoin, leftJoin }));
    const from = vi.fn(() => ({ innerJoin }));
    const select = vi.fn(() => ({ from }));

    const tx = { execute, select };
    const db = {
      transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)),
    };

    await executeStructuredSearch(
      db as never,
      { mode: "leads", company: "Appknox" },
      { userId: "user-1", limit: 999 },
    );

    expect(db.transaction).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(3);
    const rendered = JSON.stringify(execute.mock.calls);
    expect(rendered).toMatch(/READ ONLY/i);
    expect(rendered).toMatch(/statement_timeout/i);
    expect(rendered).toMatch(/lock_timeout/i);
    expect(limit).toHaveBeenCalledWith(50);
  });
});
