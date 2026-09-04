import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { enrichmentStatusEnum, roleMatchTierEnum } from "./enums";
import { companies } from "./companies";
import { people } from "./people";
import { searchRuns } from "./search-runs";

export const leadCandidates = pgTable(
  "lead_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    icpFitScore: numeric("icp_fit_score", { precision: 5, scale: 2 }).notNull().default("0"),
    decisionAuthorityScore: numeric("decision_authority_score", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0"),
    businessSignalsScore: numeric("business_signals_score", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0"),
    contactabilityScore: numeric("contactability_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    evidenceQualityScore: numeric("evidence_quality_score", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    finalScore: numeric("final_score", { precision: 5, scale: 2 }).notNull().default("0"),
    contactability: numeric("contactability", { precision: 4, scale: 3 }).notNull().default("0"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    explanation: text("explanation"),
    isStale: boolean("is_stale").notNull().default(false),
    roleMatch: boolean("role_match").notNull().default(false),
    roleMatchReasons: jsonb("role_match_reasons").$type<string[]>().notNull().default([]),
    scoreVersion: integer("score_version").notNull().default(1),
    experienceScore: numeric("experience_score", { precision: 5, scale: 2 }).notNull().default("0"),
    roleMatchTier: roleMatchTierEnum("role_match_tier").notNull().default("none"),
    roleSimilarity: numeric("role_similarity", { precision: 4, scale: 3 }).notNull().default("0"),
    roleMatchFinal: boolean("role_match_final").notNull().default(false),
    enrichmentStatus: enrichmentStatusEnum("enrichment_status").notNull().default("pending"),
    ...timestamps,
  },
  (table) => [
    index("lead_candidates_run_id_idx").on(table.runId),
    index("lead_candidates_run_final_score_idx").on(table.runId, table.finalScore),
    index("lead_candidates_person_id_idx").on(table.personId),
    index("lead_candidates_company_id_idx").on(table.companyId),
    index("lead_candidates_role_match_idx").on(table.runId, table.roleMatch),
    index("lead_candidates_high_value_idx").on(
      table.companyId,
      table.scoreVersion,
      table.roleMatchFinal,
      table.finalScore,
      table.confidence,
    ),
    uniqueIndex("lead_candidates_run_person_company_idx").on(
      table.runId,
      table.personId,
      table.companyId,
    ),
  ],
);

export type LeadCandidate = typeof leadCandidates.$inferSelect;
export type NewLeadCandidate = typeof leadCandidates.$inferInsert;
