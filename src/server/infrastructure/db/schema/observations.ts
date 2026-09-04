import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { observationEntityTypeEnum } from "./enums";
import { createdAt } from "./helpers";
import { sourceDocuments } from "./source-documents";

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    entityType: observationEntityTypeEnum("entity_type").notNull(),
    subjectKey: text("subject_key"),
    attribute: text("attribute").notNull(),
    rawValue: text("raw_value").notNull(),
    normalizedValue: text("normalized_value"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    evidenceSpan: jsonb("evidence_span").$type<{
      start: number;
      end: number;
      text: string;
    }>(),
    fingerprint: text("fingerprint"),
    resolvedEntityType: observationEntityTypeEnum("resolved_entity_type"),
    resolvedEntityId: uuid("resolved_entity_id"),
    resolvedField: text("resolved_field"),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt,
  },
  (table) => [
    index("observations_source_document_id_idx").on(table.sourceDocumentId),
    index("observations_entity_type_idx").on(table.entityType),
    index("observations_attribute_idx").on(table.attribute),
    index("observations_observed_at_idx").on(table.observedAt),
    index("observations_subject_key_idx").on(table.subjectKey),
    index("observations_resolved_entity_idx").on(
      table.resolvedEntityType,
      table.resolvedEntityId,
    ),
    index("observations_source_document_fingerprint_idx").on(
      table.sourceDocumentId,
      table.fingerprint,
    ),
  ],
);

export type Observation = typeof observations.$inferSelect;
export type NewObservation = typeof observations.$inferInsert;
