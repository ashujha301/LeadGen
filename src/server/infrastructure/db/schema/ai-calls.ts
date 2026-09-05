import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { aiCallStatusEnum, aiOperationEnum } from "./enums";
import { createdAt } from "./helpers";
import { searchRuns } from "./search-runs";

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => searchRuns.id, { onDelete: "set null" }),
    operation: aiOperationEnum("operation").notNull(),
    model: text("model").notNull(),
    responseId: text("response_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    schemaVersion: text("schema_version").notNull(),
    status: aiCallStatusEnum("status").notNull().default("success"),
    errorMessage: text("error_message"),
    createdAt,
  },
  (table) => [
    index("ai_calls_run_id_idx").on(table.runId),
    index("ai_calls_operation_idx").on(table.operation),
    index("ai_calls_status_idx").on(table.status),
    index("ai_calls_created_at_idx").on(table.createdAt),
  ],
);

export type AiCall = typeof aiCalls.$inferSelect;
export type NewAiCall = typeof aiCalls.$inferInsert;
