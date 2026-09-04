import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { extractionStatusEnum, sourceTypeEnum } from "./enums";
import { timestamps } from "./helpers";
import { searchRuns } from "./search-runs";

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    sourceType: sourceTypeEnum("source_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    sourceKey: text("source_key").notNull(),
    responseStatus: integer("response_status"),
    contentHash: text("content_hash"),
    excerpt: text("excerpt"),
    pageHtml: text("page_html"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" }),
    extractionStatus: extractionStatusEnum("extraction_status")
      .notNull()
      .default("pending"),
    ...timestamps,
  },
  (table) => [
    index("source_documents_run_id_idx").on(table.runId),
    index("source_documents_extraction_status_idx").on(table.extractionStatus),
    index("source_documents_content_hash_idx").on(table.contentHash),
    index("source_documents_canonical_url_idx").on(table.canonicalUrl),
    uniqueIndex("source_documents_run_type_source_key_idx").on(
      table.runId,
      table.sourceType,
      table.sourceKey,
    ),
  ],
);

export type SourceDocument = typeof sourceDocuments.$inferSelect;
export type NewSourceDocument = typeof sourceDocuments.$inferInsert;
