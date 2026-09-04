import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { companies } from "./companies";

export const companyExternalProfiles = pgTable(
  "company_external_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("crustdata"),
    providerCompanyId: text("provider_company_id"),
    profileUrl: text("profile_url"),
    normalizedProfileUrl: text("normalized_profile_url"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    index("company_external_profiles_company_id_idx").on(table.companyId),
    index("company_external_profiles_provider_company_id_idx").on(
      table.provider,
      table.providerCompanyId,
    ),
  ],
);

export type CompanyExternalProfile = typeof companyExternalProfiles.$inferSelect;
export type NewCompanyExternalProfile = typeof companyExternalProfiles.$inferInsert;
