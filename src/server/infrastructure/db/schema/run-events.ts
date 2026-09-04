import { sql } from "drizzle-orm";
import { bigint, index, jsonb, pgTable, uuid } from "drizzle-orm/pg-core";

import { runEventTypeEnum } from "./enums";
import { createdAt } from "./helpers";
import { searchRuns } from "./search-runs";

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    eventType: runEventTypeEnum("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    sequence: bigint("sequence", { mode: "number" })
      .notNull()
      .default(sql`nextval('run_events_sequence_seq')`),
    createdAt,
  },
  (table) => [
    index("run_events_run_id_id_idx").on(table.runId, table.id),
    index("run_events_run_id_sequence_idx").on(table.runId, table.sequence),
  ],
);

export type RunEvent = typeof runEvents.$inferSelect;
export type NewRunEvent = typeof runEvents.$inferInsert;
