import {
  index,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt } from "./helpers";
import { leadCandidates } from "./lead-candidates";

export const scoreComponents = pgTable(
  "score_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadCandidateId: uuid("lead_candidate_id")
      .notNull()
      .references(() => leadCandidates.id, { onDelete: "cascade" }),
    componentKey: text("component_key").notNull(),
    weight: numeric("weight", { precision: 5, scale: 2 }).notNull(),
    rawValue: numeric("raw_value", { precision: 8, scale: 4 }).notNull(),
    contribution: numeric("contribution", { precision: 5, scale: 2 }).notNull(),
    reasonCode: text("reason_code").notNull(),
    label: text("label"),
    createdAt,
  },
  (table) => [
    index("score_components_lead_candidate_id_idx").on(table.leadCandidateId),
    index("score_components_component_key_idx").on(table.componentKey),
  ],
);

export type ScoreComponentRow = typeof scoreComponents.$inferSelect;
export type NewScoreComponentRow = typeof scoreComponents.$inferInsert;
