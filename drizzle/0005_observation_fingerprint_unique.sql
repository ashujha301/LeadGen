-- Make observation fingerprint uniqueness usable as an ON CONFLICT target.
-- 0004 created a partial unique index (WHERE fingerprint IS NOT NULL), which
-- Postgres will not match to ON CONFLICT (source_document_id, fingerprint).
-- A non-unique index with the same name may also already exist from schema push.

DROP INDEX IF EXISTS "observations_source_document_fingerprint_idx";

CREATE UNIQUE INDEX "observations_source_document_fingerprint_idx"
  ON "observations" ("source_document_id", "fingerprint");
