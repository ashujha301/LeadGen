import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth-users";
import { companies } from "./companies";
import { createdAt, updatedAt } from "./helpers";
import { leadCandidates } from "./lead-candidates";
import { people } from "./people";
import { searchRuns } from "./search-runs";

const vector512 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(512)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    const trimmed = value.replace(/^\[/, "").replace(/\]$/, "");
    if (!trimmed) return [];
    return trimmed.split(",").map((part) => Number(part));
  },
});

export const naturalSearchSessions = pgTable(
  "natural_search_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => searchRuns.id, { onDelete: "set null" }),
    originalQuery: text("original_query").notNull(),
    partialPlan: jsonb("partial_plan").notNull().$type<Record<string, unknown>>(),
    pendingQuestions: jsonb("pending_questions").notNull().default([]).$type<unknown[]>(),
    answers: jsonb("answers").notNull().default([]).$type<unknown[]>(),
    status: text("status").notNull().default("pending_clarification"),
    version: integer("version").notNull().default(1),
    round: integer("round").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("natural_search_sessions_user_id_idx").on(table.userId),
    index("natural_search_sessions_expires_at_idx").on(table.expiresAt),
    index("natural_search_sessions_status_idx").on(table.status),
  ],
);

export const naturalSearchDocuments = pgTable(
  "natural_search_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leadCandidates.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull().default(512),
    embedding: vector512("embedding").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("natural_search_documents_user_person_company_uidx").on(
      table.userId,
      table.personId,
      table.companyId,
    ),
    index("natural_search_documents_user_id_idx").on(table.userId),
    index("natural_search_documents_person_id_idx").on(table.personId),
    index("natural_search_documents_company_id_idx").on(table.companyId),
  ],
);

export type NaturalSearchSession = typeof naturalSearchSessions.$inferSelect;
export type NewNaturalSearchSession = typeof naturalSearchSessions.$inferInsert;
export type NaturalSearchDocument = typeof naturalSearchDocuments.$inferSelect;
export type NewNaturalSearchDocument = typeof naturalSearchDocuments.$inferInsert;
