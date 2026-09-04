#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { mapCompanyPageToObservations } from "@/server/infrastructure/connectors";
import { getDb, runsRepo, sourcesRepo } from "@/server/infrastructure/db";
import { normalizeDomain, normalizeName } from "@/server/domain";

const DEMO_DOMAIN = "acme-analytics.test";
const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/company-pages");

async function seedDemo() {
  const db = getDb();
  const normalizedDomain = normalizeDomain(DEMO_DOMAIN)!;
  const idempotencyKey = createHash("sha256").update(`seed:${normalizedDomain}`).digest("hex");

  const existing = await runsRepo.getRunByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    console.log(`Demo run already exists: ${existing.id}`);
    return;
  }

  const run = await runsRepo.createRun(db, {
    inputDomain: DEMO_DOMAIN,
    normalizedDomain,
    icp: {
      industries: ["B2B SaaS"],
      locations: ["United States"],
      employeeRange: { min: 10, max: 500 },
    },
    targetRoles: ["ceo", "vp sales"],
    idempotencyKey,
    hashedClientIp: createHash("sha256").update("seed-script").digest("hex"),
  });

  const fixtures = [
    { file: "homepage.html", path: "/" },
    { file: "team.html", path: "/team" },
    { file: "contact.html", path: "/contact" },
  ];

  for (const fixture of fixtures) {
    const html = readFileSync(resolve(FIXTURE_DIR, fixture.file), "utf8");
    const source = await sourcesRepo.createSourceDocument(db, {
      runId: run.id,
      sourceType: "website",
      sourceUrl: `https://${normalizedDomain}${fixture.path}`,
      canonicalUrl: `https://${normalizedDomain}${fixture.path}`,
      responseStatus: 200,
      contentHash: createHash("sha256").update(html).digest("hex"),
      excerpt: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
      fetchedAt: new Date(),
      extractionStatus: "completed",
    });

    const mapped = mapCompanyPageToObservations({
      url: source.sourceUrl,
      finalUrl: source.canonicalUrl,
      statusCode: 200,
      contentType: "text/html",
      html,
      fetchedAt: new Date().toISOString(),
    });

    await sourcesRepo.createObservations(
      db,
      mapped.map((obs) => ({
        sourceDocumentId: source.id,
        entityType: obs.entityType,
        attribute: obs.attribute,
        rawValue: obs.rawValue,
        normalizedValue: obs.normalizedValue ?? null,
        confidence: String(obs.confidence),
      })),
    );
  }

  const { entitiesRepo } = await import("@/server/infrastructure/db");
  const company = await entitiesRepo.createCompany(db, {
    name: "Acme Analytics",
    normalizedName: normalizeName("Acme Analytics"),
    normalizedDomain,
    industry: "B2B SaaS",
    location: "United States",
    employeeCount: 120,
    confidence: "0.82",
    freshness: "0.9",
  });

  const ceo = await entitiesRepo.createPerson(db, {
    name: "Jordan Lee",
    normalizedName: normalizeName("Jordan Lee"),
    confidence: "0.86",
    freshness: "0.9",
  });

  await entitiesRepo.createEmployment(db, {
    personId: ceo.id,
    companyId: company.id,
    rawTitle: "Chief Executive Officer",
    normalizedTitle: "chief executive officer",
    normalizedRole: "ceo",
    isCurrent: true,
    confidence: "0.86",
  });

  await entitiesRepo.createContactPoint(db, {
    personId: ceo.id,
    companyId: company.id,
    type: "email",
    rawValue: "jordan@acme-analytics.test",
    normalizedValue: "jordan@acme-analytics.test",
    verificationStatus: "unverified",
    confidence: "0.7",
    freshness: "0.9",
  });

  await runsRepo.completeRun(db, run.id);
  console.log(`Seeded demo run ${run.id} for ${normalizedDomain}`);
}

seedDemo()
  .then(async () => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
