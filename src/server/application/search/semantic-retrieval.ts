import { eq, sql } from "drizzle-orm";

import { embedQueryText } from "@/server/infrastructure/ai/embeddings";
import type { Db } from "@/server/infrastructure/db";
import { naturalSearchDocuments } from "@/server/infrastructure/db/schema";

export type SemanticRetrievalResult =
  | { status: "ok"; leadIds: string[]; similarities?: number[]; warnings?: string[] }
  | { status: "empty_index"; warnings?: string[] }
  | { status: "failed"; error: string; warnings?: string[] }
  | { status: "skipped" };

/**
 * Hybrid semantic retrieval over user-scoped natural_search_documents.
 */
export async function retrieveSemanticLeadIds(
  db: Db,
  input: {
    userId: string;
    text: string;
    requestId?: string;
    limit?: number;
  },
): Promise<SemanticRetrievalResult> {
  if (!input.text.trim()) {
    return { status: "skipped" };
  }

  try {
    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(naturalSearchDocuments)
      .where(eq(naturalSearchDocuments.userId, input.userId));

    const count = Number(countRows[0]?.count ?? 0);
    if (count === 0) {
      return { status: "empty_index", warnings: ["semantic_index_empty"] };
    }

    const embedded = await embedQueryText({
      text: input.text,
      userId: input.userId,
      requestId: input.requestId,
      db,
    });

    if (embedded.status !== "success") {
      return {
        status: "failed",
        error: embedded.error,
        warnings: ["semantic_retrieval_failed"],
      };
    }

    const vectorLiteral = `[${embedded.embedding.join(",")}]`;
    const limit = Math.min(input.limit ?? 100, 100);

    const result = await db.execute(sql`
      select lead_id, (embedding <=> ${vectorLiteral}::vector) as distance
      from natural_search_documents
      where user_id = ${input.userId}
        and lead_id is not null
        and (embedding <=> ${vectorLiteral}::vector) <= ${1 - 0.45}
      order by embedding <=> ${vectorLiteral}::vector asc
      limit ${limit}
    `);

    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as Array<{
      lead_id: string | null;
    }>;

    const leadIds = rows.map((row) => row.lead_id).filter((id): id is string => Boolean(id));

    return { status: "ok", leadIds };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "semantic retrieval failed",
      warnings: ["semantic_retrieval_failed"],
    };
  }
}
