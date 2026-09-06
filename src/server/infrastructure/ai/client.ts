import { getEnv } from "@/shared/config/server";
import type { Db } from "@/server/infrastructure/db";
import { aiCallsRepo } from "@/server/infrastructure/db";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

export type AiOperation =
  "extract_page" | "parse_search_query" | "explain_lead" | "embed_search_documents";

export type StructuredAiRequest<TSchema extends z.ZodTypeAny> = {
  operation: AiOperation;
  schema: TSchema;
  schemaVersion: string;
  prompt: string;
  runId?: string;
  userId?: string;
  requestId?: string;
  db?: Db;
  signal?: AbortSignal;
};

export type StructuredAiResult<T> =
  | { status: "success"; data: T; responseId: string | null; durationMs: number }
  | { status: "disabled"; reason: string }
  | { status: "timeout"; error: string; durationMs: number; errorCategory: "timeout" }
  | {
      status: "unavailable";
      error: string;
      durationMs: number;
      errorCategory: "auth" | "invalid_model" | "disabled";
    }
  | {
      status: "service_unavailable";
      error: string;
      durationMs: number;
      errorCategory: "rate_limit" | "connection" | "provider_5xx";
    }
  | {
      status: "error";
      error: string;
      durationMs: number;
      errorCategory: "refusal" | "incomplete" | "malformed" | "unknown";
    };

let cachedClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI | null {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
    });
  }

  return cachedClient;
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("status" in error && typeof (error as { status: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return undefined;
}

function categorizeProviderError(error: unknown): {
  status: Exclude<StructuredAiResult<unknown>["status"], "success" | "disabled">;
  errorCategory:
    | "timeout"
    | "auth"
    | "invalid_model"
    | "rate_limit"
    | "connection"
    | "provider_5xx"
    | "refusal"
    | "incomplete"
    | "malformed"
    | "unknown";
  message: string;
} {
  const message = error instanceof Error ? error.message : "Unknown OpenAI error";
  const timedOut = error instanceof Error && error.name === "AbortError";
  if (timedOut) {
    return { status: "timeout", errorCategory: "timeout", message };
  }

  const status = getErrorStatus(error);
  if (status === 401 || status === 403) {
    return { status: "unavailable", errorCategory: "auth", message };
  }
  if (status === 404 || /model/i.test(message)) {
    // Only treat as invalid model when status suggests it or message is explicit.
    if (status === 404 || /invalid.*model|model.*not.*found/i.test(message)) {
      return { status: "unavailable", errorCategory: "invalid_model", message };
    }
  }
  if (status === 429) {
    return { status: "service_unavailable", errorCategory: "rate_limit", message };
  }
  if (status !== undefined && status >= 500) {
    return { status: "service_unavailable", errorCategory: "provider_5xx", message };
  }
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(message)) {
    return { status: "service_unavailable", errorCategory: "connection", message };
  }

  return { status: "error", errorCategory: "unknown", message };
}

function detectRefusalOrIncomplete(response: {
  status?: string | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string; refusal?: string }> }>;
  incomplete_details?: { reason?: string } | null;
}): "refusal" | "incomplete" | null {
  if (response.status === "incomplete") {
    return "incomplete";
  }
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "refusal") {
        return "refusal";
      }
    }
  }
  return null;
}

export async function createStructuredResponse<TSchema extends z.ZodTypeAny>(
  request: StructuredAiRequest<TSchema>,
): Promise<StructuredAiResult<z.infer<TSchema>>> {
  const env = getEnv();
  const client = getOpenAiClient();
  const startedAt = Date.now();

  if (!client) {
    return {
      status: "disabled",
      reason: "OpenAI API key is not configured",
    };
  }

  let aiCallId: string | undefined;

  if (request.db) {
    const aiCall = await aiCallsRepo.createAiCall(request.db, {
      runId: request.runId ?? null,
      userId: request.userId ?? null,
      requestId: request.requestId ?? null,
      operation: request.operation,
      model: env.OPENAI_MODEL,
      schemaVersion: request.schemaVersion,
      status: "pending",
    });
    aiCallId = aiCall.id;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.OPENAI_TIMEOUT_MS);
    const onExternalAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onExternalAbort, { once: true });
    if (request.signal?.aborted) {
      controller.abort();
    }

    let response: Awaited<ReturnType<typeof client.responses.parse>>;

    try {
      response = await client.responses.parse(
        {
          model: env.OPENAI_MODEL,
          input: request.prompt,
          store: false,
          max_output_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
          text: {
            format: zodTextFormat(request.schema, request.operation),
          },
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onExternalAbort);
    }

    const durationMs = Date.now() - startedAt;
    const refusalOrIncomplete = detectRefusalOrIncomplete(response);
    if (refusalOrIncomplete) {
      if (request.db && aiCallId) {
        await aiCallsRepo.updateAiCallStatus(request.db, aiCallId, {
          status: refusalOrIncomplete === "refusal" ? "refused" : "error",
          responseId: response.id ?? null,
          durationMs,
          errorMessage: refusalOrIncomplete,
          errorCategory: refusalOrIncomplete,
        });
      }
      return {
        status: "error",
        error: refusalOrIncomplete,
        durationMs,
        errorCategory: refusalOrIncomplete,
      };
    }

    const parsed = response.output_parsed;
    if (parsed == null) {
      if (request.db && aiCallId) {
        await aiCallsRepo.updateAiCallStatus(request.db, aiCallId, {
          status: "error",
          responseId: response.id ?? null,
          durationMs,
          errorMessage: "malformed",
          errorCategory: "malformed",
        });
      }
      return {
        status: "error",
        error: "OpenAI response did not include structured output",
        durationMs,
        errorCategory: "malformed",
      };
    }

    const data = request.schema.parse(parsed);

    if (request.db && aiCallId) {
      await aiCallsRepo.updateAiCallStatus(request.db, aiCallId, {
        status: "success",
        responseId: response.id ?? null,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        durationMs,
      });
    }

    return {
      status: "success",
      data,
      responseId: response.id ?? null,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const categorized = categorizeProviderError(error);

    if (request.db && aiCallId) {
      await aiCallsRepo.updateAiCallStatus(request.db, aiCallId, {
        status: categorized.status === "timeout" ? "timeout" : "error",
        durationMs,
        errorMessage: categorized.errorCategory,
        errorCategory: categorized.errorCategory,
      });
    }

    if (categorized.status === "timeout") {
      return {
        status: "timeout",
        error: categorized.message,
        durationMs,
        errorCategory: "timeout",
      };
    }
    if (categorized.status === "unavailable") {
      return {
        status: "unavailable",
        error: categorized.message,
        durationMs,
        errorCategory: categorized.errorCategory as "auth" | "invalid_model" | "disabled",
      };
    }
    if (categorized.status === "service_unavailable") {
      return {
        status: "service_unavailable",
        error: categorized.message,
        durationMs,
        errorCategory: categorized.errorCategory as "rate_limit" | "connection" | "provider_5xx",
      };
    }

    return {
      status: "error",
      error: categorized.message,
      durationMs,
      errorCategory: categorized.errorCategory as
        "refusal" | "incomplete" | "malformed" | "unknown",
    };
  }
}

export function resetOpenAiClient(): void {
  cachedClient = null;
}

export function isOpenAiEnabled(): boolean {
  return Boolean(getEnv().OPENAI_API_KEY);
}
