import { desc, eq } from "drizzle-orm";

import type { Db } from "../client";
import { aiCalls, type AiCall, type NewAiCall } from "../schema/ai-calls";

export async function createAiCall(db: Db, input: NewAiCall): Promise<AiCall> {
  const [call] = await db.insert(aiCalls).values(input).returning();
  if (!call) {
    throw new Error("Failed to create AI call record");
  }
  return call;
}

export async function updateAiCallStatus(
  db: Db,
  aiCallId: string,
  update: Pick<AiCall, "status"> &
    Partial<
      Pick<
        AiCall,
        | "responseId"
        | "inputTokens"
        | "outputTokens"
        | "durationMs"
        | "errorMessage"
        | "errorCategory"
        | "userId"
        | "requestId"
      >
    >,
): Promise<AiCall | undefined> {
  const [call] = await db.update(aiCalls).set(update).where(eq(aiCalls.id, aiCallId)).returning();
  return call;
}

export async function getAiCallsByRunId(db: Db, runId: string): Promise<AiCall[]> {
  return db.query.aiCalls.findMany({
    where: eq(aiCalls.runId, runId),
    orderBy: [desc(aiCalls.createdAt)],
  });
}

export async function getAiCallById(db: Db, aiCallId: string): Promise<AiCall | undefined> {
  return db.query.aiCalls.findFirst({
    where: eq(aiCalls.id, aiCallId),
  });
}
