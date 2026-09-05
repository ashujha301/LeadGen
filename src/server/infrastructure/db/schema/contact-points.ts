import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { contactTypeEnum, verificationStatusEnum } from "./enums";
import { timestamps } from "./helpers";
import { companies } from "./companies";
import { people } from "./people";
import { searchRuns } from "./search-runs";

export const contactPoints = pgTable(
  "contact_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => people.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    type: contactTypeEnum("type").notNull(),
    rawValue: text("raw_value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
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
    index("contact_points_person_id_idx").on(table.personId),
    index("contact_points_company_id_idx").on(table.companyId),
    index("contact_points_type_idx").on(table.type),
    uniqueIndex("contact_points_type_normalized_value_idx").on(table.type, table.normalizedValue),
  ],
);

export type ContactPoint = typeof contactPoints.$inferSelect;
export type NewContactPoint = typeof contactPoints.$inferInsert;
