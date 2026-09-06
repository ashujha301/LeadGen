-- Natural-search provenance + AI call diagnostics
ALTER TYPE "public"."ai_call_status" ADD VALUE IF NOT EXISTS 'pending';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employment_run_provenance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employment_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "source_document_id" uuid,
  "first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "person_enrichment_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "source_document_id" uuid,
  "enrichment_status" "enrichment_status" NOT NULL,
  "provider_experience_years" numeric(6, 2),
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "employment_run_provenance"
  ADD CONSTRAINT "employment_run_provenance_employment_id_employments_id_fk"
  FOREIGN KEY ("employment_id") REFERENCES "public"."employments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_run_provenance"
  ADD CONSTRAINT "employment_run_provenance_run_id_search_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_run_provenance"
  ADD CONSTRAINT "employment_run_provenance_source_document_id_source_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_enrichment_runs"
  ADD CONSTRAINT "person_enrichment_runs_person_id_people_id_fk"
  FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_enrichment_runs"
  ADD CONSTRAINT "person_enrichment_runs_run_id_search_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_enrichment_runs"
  ADD CONSTRAINT "person_enrichment_runs_source_document_id_source_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employment_run_provenance_employment_run_uidx"
  ON "employment_run_provenance" USING btree ("employment_id","run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employment_run_provenance_run_id_idx"
  ON "employment_run_provenance" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employment_run_provenance_employment_id_idx"
  ON "employment_run_provenance" USING btree ("employment_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "person_enrichment_runs_person_run_uidx"
  ON "person_enrichment_runs" USING btree ("person_id","run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_enrichment_runs_run_id_idx"
  ON "person_enrichment_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "person_enrichment_runs_person_id_idx"
  ON "person_enrichment_runs" USING btree ("person_id");--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "request_id" text;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN IF NOT EXISTS "error_category" text;--> statement-breakpoint
ALTER TABLE "ai_calls"
  ADD CONSTRAINT "ai_calls_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_calls_user_id_idx" ON "ai_calls" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_calls_request_id_idx" ON "ai_calls" USING btree ("request_id");--> statement-breakpoint
INSERT INTO "employment_run_provenance" (
  "employment_id",
  "run_id",
  "source_document_id",
  "first_observed_at",
  "last_observed_at"
)
SELECT DISTINCT ON (o.resolved_entity_id, sd.run_id)
  o.resolved_entity_id,
  sd.run_id,
  sd.id,
  COALESCE(o.created_at, now()),
  COALESCE(o.created_at, now())
FROM "observations" o
INNER JOIN "source_documents" sd ON sd.id = o.source_document_id
WHERE o.resolved_entity_type = 'employment'
  AND o.resolved_entity_id IS NOT NULL
  AND sd.run_id IS NOT NULL
ON CONFLICT ("employment_id", "run_id") DO NOTHING;--> statement-breakpoint
-- Fallback: last_confirmed_run_id when no observation provenance exists
INSERT INTO "employment_run_provenance" (
  "employment_id",
  "run_id",
  "first_observed_at",
  "last_observed_at"
)
SELECT
  e.id,
  e.last_confirmed_run_id,
  COALESCE(e.first_observed_at, e.created_at, now()),
  COALESCE(e.last_observed_at, e.updated_at, now())
FROM "employments" e
WHERE e.last_confirmed_run_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "employment_run_provenance" erp
    WHERE erp.employment_id = e.id
      AND erp.run_id = e.last_confirmed_run_id
  )
ON CONFLICT ("employment_id", "run_id") DO NOTHING;
