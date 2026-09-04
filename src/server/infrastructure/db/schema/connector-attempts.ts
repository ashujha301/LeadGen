import {
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt } from "./helpers";
import { searchRuns } from "./search-runs";

export const connectorAttempts = pgTable(
  "connector_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    connectorName: text("connector_name").notNull(),
    status: text("status").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    errorCode: text("error_code"),
    recordsReturned: integer("records_returned"),
    endpoint: text("endpoint"),
    attempts: integer("attempts").notNull().default(1),
    cacheStatus: text("cache_status"),
    creditsUsed: integer("credits_used"),
    createdAt,
  },
  (table) => [
    index("connector_attempts_run_id_idx").on(table.runId),
    index("connector_attempts_connector_name_idx").on(table.connectorName),
    index("connector_attempts_status_idx").on(table.status),
    index("connector_attempts_created_at_idx").on(table.createdAt),
  ],
);

export type ConnectorAttempt = typeof connectorAttempts.$inferSelect;
export type NewConnectorAttempt = typeof connectorAttempts.$inferInsert;
