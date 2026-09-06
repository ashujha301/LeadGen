import { createHash } from "node:crypto";

import { getEnv } from "@/shared/config/server";
import type { Db } from "@/server/infrastructure/db";
import { aiCallsRepo } from "@/server/infrastructure/db";
import OpenAI from "openai";

export const EMBEDDING_DIMENSIONS = 512;
export const EMBEDDING_BATCH_SIZE = 64;

export type EmbedQueryResult =
  | { status: "success"; embedding: number[]; durationMs: number; model: string }
  | { status: "disabled"; error: string }
  | { status: "failed"; error: string };

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) return null;
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
    });
  }
  return cachedClient;
}

export function hashDocumentContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function embedQueryText(input: {
  text: string;
  userId?: string;
  requestId?: string;
  db?: Db;
}): Promise<EmbedQueryResult> {
  const env = getEnv();
  const model = env.OPENAI_EMBEDDING_MODEL;
  const client = getClient();
  if (!client) {
    return { status: "disabled", error: "OpenAI is not configured" };
  }

  const started = Date.now();
  let callId: string | null = null;
  if (input.db) {
    try {
      const pending = await aiCallsRepo.createAiCall(input.db, {
        operation: "embed_search_documents",
        model,
        schemaVersion: "embeddings.v1",
        userId: input.userId,
        requestId: input.requestId,
        status: "pending",
      });
      callId = pending.id;
    } catch {
      // best-effort diagnostics
    }
  }

  try {
    const response = await client.embeddings.create({
      model,
      input: input.text,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error("Unexpected embedding dimensions");
    }
    const durationMs = Date.now() - started;
    if (input.db && callId) {
      await aiCallsRepo.updateAiCallStatus(input.db, callId, {
        status: "success",
        durationMs,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: 0,
      });
    }
    return { status: "success", embedding, durationMs, model };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : "embedding failed";
    if (input.db && callId) {
      await aiCallsRepo.updateAiCallStatus(input.db, callId, {
        status: "error",
        durationMs,
        errorMessage: message.slice(0, 500),
        errorCategory: "unknown",
      });
    }
    return { status: "failed", error: message };
  }
}

export async function embedDocumentsBatch(input: {
  texts: string[];
  userId?: string;
  requestId?: string;
  db?: Db;
}): Promise<EmbedQueryResult & { embeddings?: number[][] }> {
  const env = getEnv();
  const model = env.OPENAI_EMBEDDING_MODEL;
  const client = getClient();
  if (!client) {
    return { status: "disabled", error: "OpenAI is not configured" };
  }
  if (input.texts.length === 0) {
    return { status: "success", embedding: [], embeddings: [], durationMs: 0, model };
  }

  const started = Date.now();
  try {
    const response = await client.embeddings.create({
      model,
      input: input.texts,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    const embeddings = response.data.sort((a, b) => a.index - b.index).map((row) => row.embedding);
    return {
      status: "success",
      embedding: embeddings[0] ?? [],
      embeddings,
      durationMs: Date.now() - started,
      model,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "embedding batch failed",
    };
  }
}
