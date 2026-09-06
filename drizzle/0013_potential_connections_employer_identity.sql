-- Potential connections employer identity + enrichment confidence support.
ALTER TABLE "employments" ADD COLUMN IF NOT EXISTS "provider_company_id" text;
ALTER TABLE "person_enrichment_runs" ADD COLUMN IF NOT EXISTS "provider_match_confidence" numeric(4, 3);

CREATE INDEX IF NOT EXISTS "employments_employer_domain_idx" ON "employments" ("employer_domain");
CREATE INDEX IF NOT EXISTS "employments_provider_company_id_idx" ON "employments" ("provider_company_id");
CREATE INDEX IF NOT EXISTS "employments_person_start_date_idx" ON "employments" ("person_id", "start_date");
