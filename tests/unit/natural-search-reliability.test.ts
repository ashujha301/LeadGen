import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/infrastructure/ai", () => ({
  parseSearchQuery: vi.fn(),
}));

import { parseSearchQuery } from "@/server/infrastructure/ai";
import { runNaturalSearch, NaturalSearchError } from "@/server/application/search/natural-search";
import {
  intentHasMeaningfulConstraint,
  sanitizeSearchIntent,
} from "@/server/application/search/structured-search";

const parseSearchQueryMock = vi.mocked(parseSearchQuery);

describe("natural search reliability", () => {
  beforeEach(() => {
    parseSearchQueryMock.mockReset();
  });

  it("throws AI_UNAVAILABLE when OpenAI is disabled", async () => {
    parseSearchQueryMock.mockResolvedValue({
      status: "disabled",
      reason: "OpenAI API key is not configured",
    });

    await expect(
      runNaturalSearch({ query: "founders at appknox" }, { db: {} as never, userId: "user-1" }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" satisfies NaturalSearchError["code"] });
  });

  it("throws UPSTREAM_TIMEOUT on OpenAI timeout", async () => {
    parseSearchQueryMock.mockResolvedValue({
      status: "timeout",
      error: "aborted",
      durationMs: 10,
      errorCategory: "timeout",
    });

    await expect(
      runNaturalSearch({ query: "founders at appknox" }, { db: {} as never, userId: "user-1" }),
    ).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
  });

  it("throws SERVICE_UNAVAILABLE on provider rate limits", async () => {
    parseSearchQueryMock.mockResolvedValue({
      status: "service_unavailable",
      error: "rate limited",
      durationMs: 5,
      errorCategory: "rate_limit",
    });

    await expect(
      runNaturalSearch({ query: "founders at appknox" }, { db: {} as never, userId: "user-1" }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("throws SEARCH_NOT_UNDERSTOOD on invalid parser output", async () => {
    parseSearchQueryMock.mockResolvedValue({
      status: "error",
      error: "invalid json",
      durationMs: 5,
      errorCategory: "malformed",
    });

    await expect(
      runNaturalSearch({ query: "asdf" }, { db: {} as never, userId: "user-1" }),
    ).rejects.toMatchObject({ code: "SEARCH_NOT_UNDERSTOOD" });
  });

  it("rejects empty intent without executing search", async () => {
    parseSearchQueryMock.mockResolvedValue({
      status: "success",
      data: { mode: "leads" },
      responseId: null,
      durationMs: 1,
    });

    await expect(
      runNaturalSearch({ query: "hello" }, { db: {} as never, userId: "user-1" }),
    ).rejects.toMatchObject({ code: "SEARCH_NOT_UNDERSTOOD" });
  });

  it("sanitizes leads/timeline/connections intents", () => {
    expect(
      sanitizeSearchIntent({
        mode: "leads",
        roles: [" Founder "],
        company: " Appknox ",
        scoreThreshold: 30,
      }),
    ).toEqual({
      mode: "leads",
      roles: ["founder"],
      company: "Appknox",
      scoreThreshold: 30,
    });

    expect(
      intentHasMeaningfulConstraint({
        mode: "timeline",
        personName: "Subho Halder",
      }),
    ).toBe(true);

    expect(
      intentHasMeaningfulConstraint({
        mode: "connections",
        companyA: "Appknox",
        minOverlapDays: 90,
      }),
    ).toBe(true);
  });
});
