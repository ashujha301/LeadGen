import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { aiCallStatusEnum, aiOperationEnum } from "./enums";
import { createdAt } from "./helpers";
import { searchRuns } from "./search-runs";
import { users } from "./auth-users";

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => searchRuns.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    requestId: text("request_id"),
    operation: aiOperationEnum("operation").notNull(),
    model: text("model").notNull(),
    responseId: text("response_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    schemaVersion: text("schema_version").notNull(),
    status: aiCallStatusEnum("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    errorCategory: text("error_category"),
    createdAt,
  },
  (table) => [
    index("ai_calls_run_id_idx").on(table.runId),
    index("ai_calls_operation_idx").on(table.operation),
    index("ai_calls_status_idx").on(table.status),
    index("ai_calls_created_at_idx").on(table.createdAt),
    index("ai_calls_user_id_idx").on(table.userId),
    index("ai_calls_request_id_idx").on(table.requestId),
  ],
);

export type AiCall = typeof aiCalls.$inferSelect;
export type NewAiCall = typeof aiCalls.$inferInsert;
