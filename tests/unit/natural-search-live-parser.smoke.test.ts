import { describe, expect, it } from "vitest";

/**
 * Opt-in live OpenAI smoke test.
 * Enable with RUN_LIVE_NL_PARSER=1 and a configured OPENAI_API_KEY.
 */
const enabled = process.env.RUN_LIVE_NL_PARSER === "1" && Boolean(process.env.OPENAI_API_KEY);

describe.runIf(enabled)("live natural-search parser smoke", () => {
  it("parses lead, timeline, and connection queries without DB writes", async () => {
    const { parseSearchQuery } = await import("@/server/infrastructure/ai/parse-search-query");

    const lead = await parseSearchQuery({
      query: "Founders at Appknox with score above 30",
    });
    expect(lead.status).toBe("success");
    if (lead.status === "success") {
      expect(lead.data.mode).toBe("leads");
    }

    const timeline = await parseSearchQuery({
      query: "Show Subho Halder's employment timeline",
    });
    expect(timeline.status).toBe("success");
    if (timeline.status === "success") {
      expect(timeline.data.mode).toBe("timeline");
    }

    const connections = await parseSearchQuery({
      query: "People from Appknox who overlapped at Microsoft for 90 days",
    });
    expect(connections.status).toBe("success");
    if (connections.status === "success") {
      expect(connections.data.mode).toBe("connections");
    }
  }, 60_000);
});
