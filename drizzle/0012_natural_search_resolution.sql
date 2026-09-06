-- Natural search resolution sessions + pgvector documents
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
ALTER TYPE "public"."ai_operation" ADD VALUE IF NOT EXISTS 'embed_search_documents';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "natural_search_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "run_id" uuid,
  "original_query" text NOT NULL,
  "partial_plan" jsonb NOT NULL,
  "pending_questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "answers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'pending_clarification',
  "version" integer NOT NULL DEFAULT 1,
  "round" integer NOT NULL DEFAULT 1,
  "expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "natural_search_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "person_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "lead_id" uuid,
  "content" text NOT NULL,
  "content_hash" text NOT NULL,
  "model" text NOT NULL,
  "dimensions" integer NOT NULL DEFAULT 512,
  "embedding" vector(512) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "natural_search_sessions"
    ADD CONSTRAINT "natural_search_sessions_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "natural_search_sessions"
    ADD CONSTRAINT "natural_search_sessions_run_id_search_runs_id_fk"
    FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "natural_search_documents"
    ADD CONSTRAINT "natural_search_documents_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "natural_search_documents"
    ADD CONSTRAINT "natural_search_documents_person_id_people_id_fk"
    FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "natural_search_documents"
    ADD CONSTRAINT "natural_search_documents_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "natural_search_documents"
    ADD CONSTRAINT "natural_search_documents_lead_id_lead_candidates_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."lead_candidates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "natural_search_sessions_user_id_idx"
  ON "natural_search_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "natural_search_sessions_expires_at_idx"
  ON "natural_search_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "natural_search_sessions_status_idx"
  ON "natural_search_sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "natural_search_documents_user_person_company_uidx"
  ON "natural_search_documents" USING btree ("user_id","person_id","company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "natural_search_documents_user_id_idx"
  ON "natural_search_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "natural_search_documents_person_id_idx"
  ON "natural_search_documents" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "natural_search_documents_company_id_idx"
  ON "natural_search_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "natural_search_documents_embedding_hnsw_idx"
  ON "natural_search_documents" USING hnsw ("embedding" vector_cosine_ops);
