import {
  index,
  jsonb,
  numeric,
  pgTable,
  uuid,
} from "drizzle-orm/pg-core";

import { entityMatchDecisionEnum, matchEntityTypeEnum } from "./enums";
import { timestamps } from "./helpers";

export const entityMatches = pgTable(
  "entity_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: matchEntityTypeEnum("entity_type").notNull(),
    candidateAId: uuid("candidate_a_id").notNull(),
    candidateBId: uuid("candidate_b_id").notNull(),
    matchScore: numeric("match_score", { precision: 4, scale: 3 }).notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    decision: entityMatchDecisionEnum("decision").notNull().default("review"),
    ...timestamps,
  },
  (table) => [
    index("entity_matches_entity_type_idx").on(table.entityType),
    index("entity_matches_decision_idx").on(table.decision),
    index("entity_matches_candidate_pair_idx").on(
      table.entityType,
      table.candidateAId,
      table.candidateBId,
    ),
  ],
);

export type EntityMatch = typeof entityMatches.$inferSelect;
export type NewEntityMatch = typeof entityMatches.$inferInsert;
