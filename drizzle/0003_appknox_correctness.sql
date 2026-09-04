-- Run event ordering and canonical company identity fields

ALTER TABLE "run_events" ADD COLUMN IF NOT EXISTS "sequence" bigint;

CREATE SEQUENCE IF NOT EXISTS run_events_sequence_seq;

UPDATE "run_events"
SET "sequence" = nextval('run_events_sequence_seq')
WHERE "sequence" IS NULL;

ALTER TABLE "run_events" ALTER COLUMN "sequence" SET NOT NULL;
ALTER TABLE "run_events" ALTER COLUMN "sequence" SET DEFAULT nextval('run_events_sequence_seq');

CREATE INDEX IF NOT EXISTS "run_events_run_id_sequence_idx" ON "run_events" ("run_id", "sequence");

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "website_url" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "name_source" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "name_observed_at" timestamp with time zone;
