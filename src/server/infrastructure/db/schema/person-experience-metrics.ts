import { index, integer, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { people } from "./people";

export const personExperienceMetrics = pgTable(
  "person_experience_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    providerExperienceYears: numeric("provider_experience_years", { precision: 4, scale: 1 }),
    calculatedTotalMonths: integer("calculated_total_months"),
    leadershipExperienceMonths: integer("leadership_experience_months"),
    relevantRoleExperienceMonths: integer("relevant_role_experience_months"),
    experienceConfidence: numeric("experience_confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [index("person_experience_metrics_person_id_idx").on(table.personId)],
);

export type PersonExperienceMetrics = typeof personExperienceMetrics.$inferSelect;
export type NewPersonExperienceMetrics = typeof personExperienceMetrics.$inferInsert;
