import { index, numeric, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { enrichmentStatusEnum } from "./enums";
import { employments } from "./employments";
import { people } from "./people";
import { searchRuns } from "./search-runs";
import { sourceDocuments } from "./source-documents";

export const employmentRunProvenance = pgTable(
  "employment_run_provenance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employmentId: uuid("employment_id")
      .notNull()
      .references(() => employments.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, {
      onDelete: "set null",
    }),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("employment_run_provenance_employment_run_uidx").on(
      table.employmentId,
      table.runId,
    ),
    index("employment_run_provenance_run_id_idx").on(table.runId),
    index("employment_run_provenance_employment_id_idx").on(table.employmentId),
  ],
);

export const personEnrichmentRuns = pgTable(
  "person_enrichment_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, {
      onDelete: "set null",
    }),
    enrichmentStatus: enrichmentStatusEnum("enrichment_status").notNull(),
    providerExperienceYears: numeric("provider_experience_years", { precision: 6, scale: 2 }),
    providerMatchConfidence: numeric("provider_match_confidence", { precision: 4, scale: 3 }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("person_enrichment_runs_person_run_uidx").on(table.personId, table.runId),
    index("person_enrichment_runs_run_id_idx").on(table.runId),
    index("person_enrichment_runs_person_id_idx").on(table.personId),
  ],
);

export type EmploymentRunProvenance = typeof employmentRunProvenance.$inferSelect;
export type NewEmploymentRunProvenance = typeof employmentRunProvenance.$inferInsert;
export type PersonEnrichmentRun = typeof personEnrichmentRuns.$inferSelect;
export type NewPersonEnrichmentRun = typeof personEnrichmentRuns.$inferInsert;
