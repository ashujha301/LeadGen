CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TYPE "public"."ai_call_status" AS ENUM('success', 'error', 'timeout', 'refused');--> statement-breakpoint
CREATE TYPE "public"."ai_operation" AS ENUM('extract_page', 'parse_search_query', 'explain_lead');--> statement-breakpoint
CREATE TYPE "public"."alias_type" AS ENUM('name', 'domain');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('email', 'phone', 'linkedin', 'other');--> statement-breakpoint
CREATE TYPE "public"."entity_match_decision" AS ENUM('auto_merge', 'review', 'separate');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('pending', 'in_progress', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."match_entity_type" AS ENUM('company', 'person');--> statement-breakpoint
CREATE TYPE "public"."observation_entity_type" AS ENUM('company', 'person', 'employment', 'contact', 'signal');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'discovering', 'extracting', 'resolving', 'enriching', 'scoring', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('website', 'rdap', 'crustdata', 'email_verifier', 'manual');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('verified', 'unverified', 'invalid', 'disabled');--> statement-breakpoint
CREATE TABLE "search_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_domain" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"icp" jsonb,
	"target_roles" jsonb,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"progress" jsonb,
	"error_code" text,
	"error_message" text,
	"error_recoverable" boolean,
	"idempotency_key" text NOT NULL,
	"hashed_client_ip" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"response_status" integer,
	"content_hash" text,
	"excerpt" text,
	"fetched_at" timestamp with time zone,
	"extraction_status" "extraction_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"entity_type" "observation_entity_type" NOT NULL,
	"attribute" text NOT NULL,
	"raw_value" text NOT NULL,
	"normalized_value" text,
	"confidence" numeric(4, 3) NOT NULL,
	"evidence_span" jsonb,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"industry" text,
	"location" text,
	"employee_count" integer,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"freshness" numeric(4, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"alias_type" "alias_type" NOT NULL,
	"alias_value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"profile_url" text,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"freshness" numeric(4, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"raw_title" text,
	"normalized_title" text,
	"normalized_role" text,
	"seniority" text,
	"start_date" date,
	"end_date" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid,
	"company_id" uuid,
	"type" "contact_type" NOT NULL,
	"raw_value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"freshness" numeric(4, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"value" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"source_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "match_entity_type" NOT NULL,
	"candidate_a_id" uuid NOT NULL,
	"candidate_b_id" uuid NOT NULL,
	"match_score" numeric(4, 3) NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" "entity_match_decision" DEFAULT 'review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"icp_fit_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"decision_authority_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"business_signals_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"contactability_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"evidence_quality_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"final_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"contactability" numeric(4, 3) DEFAULT '0' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"explanation" text,
	"is_stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_candidate_id" uuid NOT NULL,
	"component_key" text NOT NULL,
	"weight" numeric(5, 2) NOT NULL,
	"raw_value" numeric(8, 4) NOT NULL,
	"contribution" numeric(5, 2) NOT NULL,
	"reason_code" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"operation" "ai_operation" NOT NULL,
	"model" text NOT NULL,
	"response_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"schema_version" text NOT NULL,
	"status" "ai_call_status" DEFAULT 'success' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hashed_ip" text NOT NULL,
	"quota_window_start" timestamp with time zone NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"active_run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_run_id_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_aliases" ADD CONSTRAINT "company_aliases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employments" ADD CONSTRAINT "employments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_points" ADD CONSTRAINT "contact_points_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_signals" ADD CONSTRAINT "business_signals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_signals" ADD CONSTRAINT "business_signals_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_run_id_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_candidates" ADD CONSTRAINT "lead_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_components" ADD CONSTRAINT "score_components_lead_candidate_id_lead_candidates_id_fk" FOREIGN KEY ("lead_candidate_id") REFERENCES "public"."lead_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_run_id_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_runs_idempotency_key_idx" ON "search_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "search_runs_normalized_domain_idx" ON "search_runs" USING btree ("normalized_domain");--> statement-breakpoint
CREATE INDEX "search_runs_status_idx" ON "search_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "search_runs_hashed_client_ip_idx" ON "search_runs" USING btree ("hashed_client_ip");--> statement-breakpoint
CREATE INDEX "search_runs_created_at_idx" ON "search_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "source_documents_run_id_idx" ON "source_documents" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "source_documents_extraction_status_idx" ON "source_documents" USING btree ("extraction_status");--> statement-breakpoint
CREATE INDEX "source_documents_content_hash_idx" ON "source_documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_documents_canonical_url_idx" ON "source_documents" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "observations_source_document_id_idx" ON "observations" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "observations_entity_type_idx" ON "observations" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "observations_attribute_idx" ON "observations" USING btree ("attribute");--> statement-breakpoint
CREATE INDEX "observations_observed_at_idx" ON "observations" USING btree ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_normalized_domain_idx" ON "companies" USING btree ("normalized_domain");--> statement-breakpoint
CREATE INDEX "companies_normalized_name_idx" ON "companies" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "companies_name_trgm_idx" ON "companies" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_aliases_company_id_idx" ON "company_aliases" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_aliases_type_value_idx" ON "company_aliases" USING btree ("alias_type","normalized_value");--> statement-breakpoint
CREATE INDEX "people_normalized_name_idx" ON "people" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "people_profile_url_idx" ON "people" USING btree ("profile_url");--> statement-breakpoint
CREATE INDEX "people_name_trgm_idx" ON "people" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "employments_person_id_idx" ON "employments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "employments_company_id_idx" ON "employments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "employments_is_current_idx" ON "employments" USING btree ("is_current");--> statement-breakpoint
CREATE INDEX "employments_company_person_idx" ON "employments" USING btree ("company_id","person_id");--> statement-breakpoint
CREATE INDEX "contact_points_person_id_idx" ON "contact_points" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "contact_points_company_id_idx" ON "contact_points" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "contact_points_type_idx" ON "contact_points" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_points_type_normalized_value_idx" ON "contact_points" USING btree ("type","normalized_value");--> statement-breakpoint
CREATE INDEX "business_signals_company_id_idx" ON "business_signals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "business_signals_signal_type_idx" ON "business_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "business_signals_observed_at_idx" ON "business_signals" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "entity_matches_entity_type_idx" ON "entity_matches" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "entity_matches_decision_idx" ON "entity_matches" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "entity_matches_candidate_pair_idx" ON "entity_matches" USING btree ("entity_type","candidate_a_id","candidate_b_id");--> statement-breakpoint
CREATE INDEX "lead_candidates_run_id_idx" ON "lead_candidates" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "lead_candidates_run_final_score_idx" ON "lead_candidates" USING btree ("run_id","final_score");--> statement-breakpoint
CREATE INDEX "lead_candidates_person_id_idx" ON "lead_candidates" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "lead_candidates_company_id_idx" ON "lead_candidates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "score_components_lead_candidate_id_idx" ON "score_components" USING btree ("lead_candidate_id");--> statement-breakpoint
CREATE INDEX "score_components_component_key_idx" ON "score_components" USING btree ("component_key");--> statement-breakpoint
CREATE INDEX "ai_calls_run_id_idx" ON "ai_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_calls_operation_idx" ON "ai_calls" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "ai_calls_status_idx" ON "ai_calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_calls_created_at_idx" ON "ai_calls" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "request_limits_ip_window_idx" ON "request_limits" USING btree ("hashed_ip","quota_window_start");--> statement-breakpoint
CREATE INDEX "request_limits_hashed_ip_idx" ON "request_limits" USING btree ("hashed_ip");