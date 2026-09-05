import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./helpers";
import { companies } from "./companies";
import { sourceDocuments } from "./source-documents";

export const businessSignals = pgTable(
  "business_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(),
    value: text("value").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull().default("0"),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("business_signals_company_id_idx").on(table.companyId),
    index("business_signals_signal_type_idx").on(table.signalType),
    index("business_signals_observed_at_idx").on(table.observedAt),
  ],
);

export type BusinessSignal = typeof businessSignals.$inferSelect;
export type NewBusinessSignal = typeof businessSignals.$inferInsert;
