import { sql } from "drizzle-orm";
import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { searchRuns } from "./search-runs";

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    profileUrl: text("profile_url"),
    mergedIntoPersonId: uuid("merged_into_person_id"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    freshness: numeric("freshness", { precision: 4, scale: 3 }).notNull().default("0"),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true, mode: "date" }),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true, mode: "date" }),
    lastConfirmedRunId: uuid("last_confirmed_run_id").references(() => searchRuns.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("people_normalized_name_idx").on(table.normalizedName),
    index("people_profile_url_idx").on(table.profileUrl),
    index("people_merged_into_person_id_idx").on(table.mergedIntoPersonId),
    index("people_name_trgm_idx").using("gin", sql`${table.normalizedName} gin_trgm_ops`),
  ],
);

export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
