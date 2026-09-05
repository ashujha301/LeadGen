import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { runStatusEnum } from "./enums";
import { timestamps } from "./helpers";

export type RoleCriteria = {
  seniorities: Array<"founder" | "owner" | "c_suite" | "vp" | "head" | "director" | "manager">;
  functions: Array<
    | "executive"
    | "sales"
    | "engineering"
    | "product"
    | "marketing"
    | "customer_success"
    | "operations"
    | "finance"
    | "people"
  >;
  customTitles: string[];
};

export const searchRuns = pgTable(
  "search_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inputDomain: text("input_domain").notNull(),
    normalizedDomain: text("normalized_domain").notNull(),
    icp: jsonb("icp").$type<{
      industries?: string[];
      locations?: string[];
      employeeRange?: { min?: number; max?: number };
    }>(),
    targetRoles: jsonb("target_roles").$type<string[]>(),
    roleCriteria: jsonb("role_criteria").$type<RoleCriteria>(),
    refreshOfRunId: uuid("refresh_of_run_id").references((): AnyPgColumn => searchRuns.id, {
      onDelete: "set null",
    }),
    status: runStatusEnum("status").notNull().default("queued"),
    progress: jsonb("progress").$type<{
      stage: string;
      pagesDiscovered?: number;
      pagesExtracted?: number;
      peopleResolved?: number;
      leadsScored?: number;
    }>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    errorRecoverable: boolean("error_recoverable"),
    idempotencyKey: text("idempotency_key").notNull(),
    hashedClientIp: text("hashed_client_ip").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("search_runs_idempotency_key_idx").on(table.idempotencyKey),
    index("search_runs_normalized_domain_idx").on(table.normalizedDomain),
    index("search_runs_status_idx").on(table.status),
    index("search_runs_hashed_client_ip_idx").on(table.hashedClientIp),
    index("search_runs_created_at_idx").on(table.createdAt),
    index("search_runs_refresh_of_run_id_idx").on(table.refreshOfRunId),
  ],
);

export type SearchRun = typeof searchRuns.$inferSelect;
export type NewSearchRun = typeof searchRuns.$inferInsert;
