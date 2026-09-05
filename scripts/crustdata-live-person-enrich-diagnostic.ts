#!/usr/bin/env tsx
/**
 * Gated one-person Crustdata live diagnostic.
 * Requires:
 *   CRUSTDATA_LIVE_TEST_RUN_ID
 *   CRUSTDATA_LIVE_TEST_PROFILE_URL
 * Rejects more than one URL. Does not run unless both env vars are set.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { enrichPerson, isCrustdataEnabled } from "../src/server/infrastructure/connectors";

async function main() {
  const runId = process.env.CRUSTDATA_LIVE_TEST_RUN_ID;
  const profileUrl = process.env.CRUSTDATA_LIVE_TEST_PROFILE_URL;

  if (!runId || !profileUrl) {
    console.error(
      "Refusing to run: set CRUSTDATA_LIVE_TEST_RUN_ID and CRUSTDATA_LIVE_TEST_PROFILE_URL",
    );
    process.exit(1);
  }

  if (profileUrl.includes(",")) {
    console.error("Refusing to run: only one profile URL is allowed");
    process.exit(1);
  }

  if (!isCrustdataEnabled()) {
    console.error("Crustdata is disabled or missing API key");
    process.exit(1);
  }

  const startedAt = Date.now();
  const result = await enrichPerson([profileUrl], { cacheBypass: true });
  const durationMs = Date.now() - startedAt;

  if (result.status !== "success") {
    console.error("Enrich failed", result);
    process.exit(1);
  }

  const person = result.data[0];
  const summary = {
    runId,
    profileUrl,
    durationMs,
    status: person?.status ?? null,
    locationShape: typeof (person?.raw as { basic_profile?: { location?: unknown } } | undefined)
      ?.basic_profile?.location,
    location: person?.location ?? null,
    currentRoleCount: person?.experience.filter((row) => row.isCurrent).length ?? 0,
    pastRoleCount: person?.experience.filter((row) => !row.isCurrent).length ?? 0,
    dateFormats: (person?.experience ?? []).map((row) => ({
      startDate: row.startDate,
      endDate: row.endDate,
    })),
  };

  const outPath = join(
    process.cwd(),
    "tests/fixtures/crustdata",
    `person-enrich-live-subho-summary-${Date.now()}.json`,
  );
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote summary to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
