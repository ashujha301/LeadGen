import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();
const parseMock = vi.fn();

vi.mock("@/shared/config/server", () => ({
  getEnv: () => ({
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-test",
    OPENAI_MAX_OUTPUT_TOKENS: 2000,
    OPENAI_TIMEOUT_MS: 1000,
  }),
}));

vi.mock("openai", () => {
  class OpenAI {
    responses = {
      create: createMock,
      parse: parseMock,
    };
  }
  return { default: OpenAI };
});

vi.mock("openai/helpers/zod", () => ({
  zodTextFormat: (schema: unknown, name: string) => ({
    type: "json_schema",
    name,
    strict: true,
    schema: { type: "object" },
  }),
}));

vi.mock("@/server/infrastructure/db", () => ({
  aiCallsRepo: {
    createAiCall: vi.fn(async () => ({ id: "ai-call-1" })),
    updateAiCallStatus: vi.fn(async () => ({ id: "ai-call-1" })),
  },
}));

import { createStructuredResponse, resetOpenAiClient } from "@/server/infrastructure/ai/client";
import { searchIntentAiTransportSchema } from "@/server/infrastructure/ai/schemas/search-intent";
import { z } from "zod";

describe("createStructuredResponse search error categorization", () => {
  beforeEach(() => {
    createMock.mockReset();
    parseMock.mockReset();
    resetOpenAiClient();
  });

  it("uses responses.parse and returns success for parsed output", async () => {
    parseMock.mockResolvedValue({
      id: "resp_1",
      output_parsed: {
        mode: "leads",
        roles: ["founder"],
        seniority: null,
        company: "Appknox",
        scoreThreshold: 30,
        confidenceThreshold: null,
        signalType: null,
        personName: null,
        currentCompany: null,
        previousCompany: null,
        companyA: null,
        companyB: null,
        minOverlapDays: null,
        dateRange: null,
        sortBy: null,
        sortOrder: null,
      },
      usage: { input_tokens: 10, output_tokens: 5 },
      status: "completed",
    });

    const result = await createStructuredResponse({
      operation: "parse_search_query",
      schema: searchIntentAiTransportSchema,
      schemaVersion: "search-intent.v3",
      prompt: "Founders at Appknox with score above 30",
    });

    expect(parseMock).toHaveBeenCalled();
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.mode).toBe("leads");
    }
  });

  it("maps timeout abort to timeout status", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    parseMock.mockRejectedValue(abortError);

    const result = await createStructuredResponse({
      operation: "parse_search_query",
      schema: z.object({ mode: z.string() }),
      schemaVersion: "v",
      prompt: "x",
    });

    expect(result.status).toBe("timeout");
  });

  it("maps authentication failures to unavailable", async () => {
    parseMock.mockRejectedValue(Object.assign(new Error("Incorrect API key"), { status: 401 }));

    const result = await createStructuredResponse({
      operation: "parse_search_query",
      schema: z.object({ mode: z.string() }),
      schemaVersion: "v",
      prompt: "x",
    });

    expect(result.status).toBe("unavailable");
  });

  it("maps rate limits and 5xx to service_unavailable", async () => {
    parseMock.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    let result = await createStructuredResponse({
      operation: "parse_search_query",
      schema: z.object({ mode: z.string() }),
      schemaVersion: "v",
      prompt: "x",
    });
    expect(result.status).toBe("service_unavailable");

    resetOpenAiClient();
    parseMock.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    result = await createStructuredResponse({
      operation: "parse_search_query",
      schema: z.object({ mode: z.string() }),
      schemaVersion: "v",
      prompt: "x",
    });
    expect(result.status).toBe("service_unavailable");
  });

  it("maps refusals and incomplete responses to error", async () => {
    parseMock.mockResolvedValue({
      id: "resp_refused",
      output_parsed: null,
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "nope" }] }],
    });

    let result = await createStructuredResponse({
      operation: "parse_search_query",
      schema: z.object({ mode: z.string() }),
      schemaVersion: "v",
      prompt: "DROP TABLE users",
    });
    expect(result.status).toBe("error");

    resetOpenAiClient();
    parseMock.mockResolvedValue({
      id: "resp_incomplete",
      output_parsed: null,
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [],
    });
    result = await createStructuredResponse({
      operation: "parse_search_query",
      schema: z.object({ mode: z.string() }),
      schemaVersion: "v",
      prompt: "x",
    });
    expect(result.status).toBe("error");
  });
});
