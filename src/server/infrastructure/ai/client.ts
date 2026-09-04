import { getEnv } from "@/shared/config/server";
import type { Db } from "@/server/infrastructure/db";
import { aiCallsRepo } from "@/server/infrastructure/db";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

export type AiOperation = "extract_page" | "parse_search_query" | "explain_lead";

export type StructuredAiRequest<TSchema extends z.ZodTypeAny> = {
  operation: AiOperation;
  schema: TSchema;
  schemaVersion: string;
  prompt: string;
  runId?: string;
  db?: Db;
  signal?: AbortSignal;
};

export type StructuredAiResult<T> =
  | { status: "success"; data: T; responseId: string | null; durationMs: number }
  | { status: "disabled"; reason: string }
  | { status: "error"; error: string; durationMs: number };

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

function extractResponseText(response: OpenAI.Responses.Response): string | null {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content) {
      if (content.type === "output_text" && content.text.trim()) {
        return content.text;
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
      operation: request.operation,
      model: env.OPENAI_MODEL,
      schemaVersion: request.schemaVersion,
      status: "success",
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

    let response: OpenAI.Responses.Response;

    try {
      response = await client.responses.create(
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
    const outputText = extractResponseText(response);

    if (!outputText) {
      throw new Error("OpenAI response did not include structured output text");
    }

    const parsed = request.schema.parse(JSON.parse(outputText));

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
      data: parsed,
      responseId: response.id ?? null,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "Unknown OpenAI error";
    const status = error instanceof Error && error.name === "AbortError" ? "timeout" : "error";

    if (request.db && aiCallId) {
      await aiCallsRepo.updateAiCallStatus(request.db, aiCallId, {
        status,
        durationMs,
        errorMessage: message,
      });
    }

    return {
      status: "error",
      error: message,
      durationMs,
    };
  }
}

export function resetOpenAiClient(): void {
  cachedClient = null;
}

export function isOpenAiEnabled(): boolean {
  return Boolean(getEnv().OPENAI_API_KEY);
}
