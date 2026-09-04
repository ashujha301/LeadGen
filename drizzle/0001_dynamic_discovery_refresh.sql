-- Step 9: Dynamic discovery, refresh, roles, and enrichment schema additions.
-- Additive only: no historical runs, observations, or lead scores are deleted or rewritten.
--
-- Backfill note: existing search_runs.target_roles values are copied into
-- role_criteria.customTitles (seniorities/functions default to empty arrays).

ALTER TABLE "search_runs" ADD COLUMN "role_criteria" jsonb;--> statement-breakpoint
ALTER TABLE "search_runs" ADD COLUMN "refresh_of_run_id" uuid;--> statement-breakpoint
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_refresh_of_run_id_search_runs_id_fk" FOREIGN KEY ("refresh_of_run_id") REFERENCES "public"."search_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_runs_refresh_of_run_id_idx" ON "search_runs" USING btree ("refresh_of_run_id");--> statement-breakpoint
UPDATE "search_runs"
SET "role_criteria" = jsonb_build_object(
  'seniorities', '[]'::jsonb,
  'functions', '[]'::jsonb,
  'customTitles', COALESCE("target_roles", '[]'::jsonb)
)
WHERE "role_criteria" IS NULL;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "subject_key" text;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "resolved_entity_type" "observation_entity_type";--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "resolved_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "observations" ADD COLUMN "resolved_field" text;--> statement-breakpoint
CREATE INDEX "observations_subject_key_idx" ON "observations" USING btree ("subject_key");--> statement-breakpoint
CREATE INDEX "observations_resolved_entity_idx" ON "observations" USING btree ("resolved_entity_type","resolved_entity_id");--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "first_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "last_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "last_confirmed_run_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_last_confirmed_run_id_search_runs_id_fk" FOREIGN KEY ("last_confirmed_run_id") REFERENCES "public"."search_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "first_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "last_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "last_confirmed_run_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_last_confirmed_run_id_search_runs_id_fk" FOREIGN KEY ("last_confirmed_run_id") REFERENCES "public"."search_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "missed_refresh_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "first_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "last_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employments" ADD COLUMN "last_confirmed_run_id" uuid;--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_last_confirmed_run_id_search_runs_id_fk" FOREIGN KEY ("last_confirmed_run_id") REFERENCES "public"."search_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_points" ADD COLUMN "first_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_points" ADD COLUMN "last_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_points" ADD COLUMN "last_confirmed_run_id" uuid;--> statement-breakpoint
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_last_confirmed_run_id_search_runs_id_fk" FOREIGN KEY ("last_confirmed_run_id") REFERENCES "public"."search_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD COLUMN "role_match" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD COLUMN "role_match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "lead_candidates_role_match_idx" ON "lead_candidates" USING btree ("run_id","role_match");--> statement-breakpoint
DELETE FROM "lead_candidates"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "run_id", "person_id", "company_id"
        ORDER BY "final_score" DESC, "created_at" ASC
      ) AS "rn"
    FROM "lead_candidates"
  ) "ranked"
  WHERE "rn" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "lead_candidates_run_person_company_idx" ON "lead_candidates" USING btree ("run_id","person_id","company_id");--> statement-breakpoint
UPDATE "employments"
SET "is_current" = false
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      ROW_NUMBER() OVER (
        PARTITION BY "person_id", "company_id"
        ORDER BY "updated_at" DESC, "created_at" DESC
      ) AS "rn"
    FROM "employments"
    WHERE "is_current" = true
  ) "ranked"
  WHERE "rn" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "employments_current_person_company_idx" ON "employments" USING btree ("person_id","company_id") WHERE "is_current" = true;--> statement-breakpoint
CREATE TABLE "connector_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"connector_name" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"records_returned" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector_attempts" ADD CONSTRAINT "connector_attempts_run_id_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_attempts_run_id_idx" ON "connector_attempts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "connector_attempts_connector_name_idx" ON "connector_attempts" USING btree ("connector_name");--> statement-breakpoint
CREATE INDEX "connector_attempts_status_idx" ON "connector_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "connector_attempts_created_at_idx" ON "connector_attempts" USING btree ("created_at");
