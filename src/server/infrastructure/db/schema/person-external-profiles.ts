import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { timestamps } from "./helpers";
import { people } from "./people";

export const personExternalProfiles = pgTable(
  "person_external_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("crustdata"),
    providerPersonId: text("provider_person_id"),
    profileUrl: text("profile_url"),
    normalizedProfileUrl: text("normalized_profile_url"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("person_external_profiles_provider_person_id_idx")
      .on(table.provider, table.providerPersonId)
      .where(sql`${table.providerPersonId} IS NOT NULL`),
    uniqueIndex("person_external_profiles_normalized_profile_url_idx")
      .on(table.normalizedProfileUrl)
      .where(sql`${table.normalizedProfileUrl} IS NOT NULL`),
    index("person_external_profiles_person_id_idx").on(table.personId),
  ],
);

export type PersonExternalProfile = typeof personExternalProfiles.$inferSelect;
export type NewPersonExternalProfile = typeof personExternalProfiles.$inferInsert;
