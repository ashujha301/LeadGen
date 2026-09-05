-- Unique protection for Crustdata employment upserts.
-- Do not apply to shared/production databases without review.

CREATE UNIQUE INDEX IF NOT EXISTS employments_person_provider_employment_id_uidx
  ON employments (person_id, provider_employment_id)
  WHERE provider_employment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employments_person_provider_fingerprint_uidx
  ON employments (person_id, provider_fingerprint)
  WHERE provider_fingerprint IS NOT NULL;
