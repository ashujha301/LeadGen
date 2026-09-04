import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { companies } from "./companies";
import { people } from "./people";
import { searchRuns } from "./search-runs";

export const employments = pgTable(
  "employments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    employerName: text("employer_name"),
    employerDomain: text("employer_domain"),
    employerProfessionalNetworkUrl: text("employer_professional_network_url"),
    providerEmploymentId: text("provider_employment_id"),
    providerFingerprint: text("provider_fingerprint"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: "date" }),
    rawTitle: text("raw_title"),
    normalizedTitle: text("normalized_title"),
    normalizedRole: text("normalized_role"),
    seniority: text("seniority"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    isCurrent: boolean("is_current").notNull().default(false),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    missedRefreshCount: integer("missed_refresh_count").notNull().default(0),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true, mode: "date" }),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true, mode: "date" }),
    lastConfirmedRunId: uuid("last_confirmed_run_id").references(() => searchRuns.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("employments_person_id_idx").on(table.personId),
    index("employments_company_id_idx").on(table.companyId),
    index("employments_is_current_idx").on(table.isCurrent),
    index("employments_company_person_idx").on(table.companyId, table.personId),
    index("employments_person_current_date_idx").on(
      table.personId,
      table.isCurrent,
      table.startDate,
    ),
    uniqueIndex("employments_current_person_company_idx")
      .on(table.personId, table.companyId)
      .where(sql`${table.isCurrent} = true`),
  ],
);

export type Employment = typeof employments.$inferSelect;
export type NewEmployment = typeof employments.$inferInsert;
