import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";

export const requestLimits = pgTable(
  "request_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hashedIp: text("hashed_ip").notNull(),
    quotaWindowStart: timestamp("quota_window_start", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    runCount: integer("run_count").notNull().default(0),
    activeRunCount: integer("active_run_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("request_limits_ip_window_idx").on(
      table.hashedIp,
      table.quotaWindowStart,
    ),
    index("request_limits_hashed_ip_idx").on(table.hashedIp),
  ],
);

export type RequestLimit = typeof requestLimits.$inferSelect;
export type NewRequestLimit = typeof requestLimits.$inferInsert;
