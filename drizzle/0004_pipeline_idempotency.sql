-- Source and observation idempotency for pipeline retries

ALTER TABLE "source_documents" ADD COLUMN IF NOT EXISTS "source_key" text;

UPDATE "source_documents"
SET "source_key" = CONCAT("source_type", ':', "canonical_url")
WHERE "source_key" IS NULL;

ALTER TABLE "source_documents" ALTER COLUMN "source_key" SET NOT NULL;

DROP INDEX IF EXISTS "source_documents_run_type_canonical_url_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "source_documents_run_type_source_key_idx"
  ON "source_documents" ("run_id", "source_type", "source_key");

CREATE INDEX IF NOT EXISTS "source_documents_source_key_idx" ON "source_documents" ("source_key");

ALTER TABLE "observations" ADD COLUMN IF NOT EXISTS "fingerprint" text;

CREATE UNIQUE INDEX IF NOT EXISTS "observations_source_document_fingerprint_idx"
  ON "observations" ("source_document_id", "fingerprint")
  WHERE "fingerprint" IS NOT NULL;
