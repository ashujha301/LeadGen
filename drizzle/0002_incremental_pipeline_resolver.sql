-- Incremental pipeline, resolver, experience, and high-value leads migration

CREATE TYPE "public"."enrichment_status" AS ENUM('pending', 'matched', 'not_found', 'redacted', 'failed');
CREATE TYPE "public"."role_match_tier" AS ENUM('exact', 'synonym', 'fallback', 'none');
CREATE TYPE "public"."run_event_type" AS ENUM(
  'run.progress',
  'company.updated',
  'lead.created',
  'lead.updated',
  'lead.merged',
  'run.completed',
  'run.failed'
);

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "professional_network_url" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "industry_source" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "industry_observed_at" timestamp with time zone;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "employee_count_observed_at" timestamp with time zone;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "provider_updated_at" timestamp with time zone;

ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "merged_into_person_id" uuid;
ALTER TABLE "people" ADD CONSTRAINT "people_merged_into_person_id_people_id_fk"
  FOREIGN KEY ("merged_into_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "employments" ALTER COLUMN "company_id" DROP NOT NULL;
ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "employer_name" text;
ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "employer_domain" text;
ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "employer_professional_network_url" text;
ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "provider_employment_id" text;
ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "provider_fingerprint" text;
ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "provider_updated_at" timestamp with time zone;

ALTER TABLE "lead_candidates" ADD COLUMN IF NOT EXISTS "score_version" integer NOT NULL DEFAULT 1;
ALTER TABLE "lead_candidates" ADD COLUMN IF NOT EXISTS "experience_score" numeric(5, 2) NOT NULL DEFAULT '0';
ALTER TABLE "lead_candidates" ADD COLUMN IF NOT EXISTS "role_match_tier" "role_match_tier" NOT NULL DEFAULT 'none';
ALTER TABLE "lead_candidates" ADD COLUMN IF NOT EXISTS "role_similarity" numeric(4, 3) NOT NULL DEFAULT '0';
ALTER TABLE "lead_candidates" ADD COLUMN IF NOT EXISTS "role_match_final" boolean NOT NULL DEFAULT false;
ALTER TABLE "lead_candidates" ADD COLUMN IF NOT EXISTS "enrichment_status" "enrichment_status" NOT NULL DEFAULT 'pending';

ALTER TABLE "connector_attempts" ADD COLUMN IF NOT EXISTS "endpoint" text;
ALTER TABLE "connector_attempts" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 1;
ALTER TABLE "connector_attempts" ADD COLUMN IF NOT EXISTS "cache_status" text;
ALTER TABLE "connector_attempts" ADD COLUMN IF NOT EXISTS "credits_used" integer;

CREATE TABLE IF NOT EXISTS "run_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "event_type" "run_event_type" NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "run_events_run_id_search_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."search_runs"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "person_external_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "provider" text NOT NULL DEFAULT 'crustdata',
  "provider_person_id" text,
  "profile_url" text,
  "normalized_profile_url" text,
  "provider_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "person_external_profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "company_external_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "provider" text NOT NULL DEFAULT 'crustdata',
  "provider_company_id" text,
  "profile_url" text,
  "normalized_profile_url" text,
  "provider_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_external_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "person_experience_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "person_id" uuid NOT NULL,
  "provider_experience_years" numeric(4, 1),
  "calculated_total_months" integer,
  "leadership_experience_months" integer,
  "relevant_role_experience_months" integer,
  "experience_confidence" numeric(4, 3) NOT NULL DEFAULT '0',
  "calculated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "person_experience_metrics_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "merge_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" "match_entity_type" NOT NULL,
  "survivor_id" uuid NOT NULL,
  "merged_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "source_documents_run_type_canonical_url_idx"
  ON "source_documents" ("run_id", "source_type", "canonical_url");

CREATE UNIQUE INDEX IF NOT EXISTS "person_external_profiles_provider_person_id_idx"
  ON "person_external_profiles" ("provider", "provider_person_id")
  WHERE "provider_person_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "person_external_profiles_normalized_profile_url_idx"
  ON "person_external_profiles" ("normalized_profile_url")
  WHERE "normalized_profile_url" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "employments_person_current_date_idx"
  ON "employments" ("person_id", "is_current", "start_date");

CREATE INDEX IF NOT EXISTS "lead_candidates_high_value_idx"
  ON "lead_candidates" ("company_id", "score_version", "role_match_final", "final_score", "confidence");

CREATE INDEX IF NOT EXISTS "run_events_run_id_id_idx"
  ON "run_events" ("run_id", "id");

CREATE INDEX IF NOT EXISTS "people_merged_into_person_id_idx"
  ON "people" ("merged_into_person_id");

UPDATE "lead_candidates" SET "score_version" = 1 WHERE "score_version" IS NULL;

INSERT INTO "person_external_profiles" ("person_id", "provider", "profile_url", "normalized_profile_url")
SELECT p.id, 'legacy', p.profile_url, lower(trim(trailing '/' from p.profile_url))
FROM "people" p
WHERE p.profile_url IS NOT NULL
  AND p.profile_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "person_external_profiles" pep
    WHERE pep.person_id = p.id AND pep.normalized_profile_url = lower(trim(trailing '/' from p.profile_url))
  );
