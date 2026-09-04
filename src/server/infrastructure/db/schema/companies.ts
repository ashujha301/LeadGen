import { sql } from "drizzle-orm";
import {
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
import { searchRuns } from "./search-runs";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    normalizedDomain: text("normalized_domain").notNull(),
    industry: text("industry"),
    location: text("location"),
    employeeCount: integer("employee_count"),
    websiteUrl: text("website_url"),
    nameSource: text("name_source"),
    nameObservedAt: timestamp("name_observed_at", { withTimezone: true, mode: "date" }),
    professionalNetworkUrl: text("professional_network_url"),
    industrySource: text("industry_source"),
    industryObservedAt: timestamp("industry_observed_at", { withTimezone: true, mode: "date" }),
    employeeCountObservedAt: timestamp("employee_count_observed_at", {
      withTimezone: true,
      mode: "date",
    }),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: "date" }),
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
    uniqueIndex("companies_normalized_domain_idx").on(table.normalizedDomain),
    index("companies_normalized_name_idx").on(table.normalizedName),
    index("companies_name_trgm_idx").using(
      "gin",
      sql`${table.normalizedName} gin_trgm_ops`,
    ),
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
