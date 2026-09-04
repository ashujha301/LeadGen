import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { matchEntityTypeEnum } from "./enums";
import { createdAt } from "./helpers";

export const mergeAudits = pgTable("merge_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: matchEntityTypeEnum("entity_type").notNull(),
  survivorId: uuid("survivor_id").notNull(),
  mergedId: uuid("merged_id").notNull(),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdAt,
});

export type MergeAudit = typeof mergeAudits.$inferSelect;
export type NewMergeAudit = typeof mergeAudits.$inferInsert;
