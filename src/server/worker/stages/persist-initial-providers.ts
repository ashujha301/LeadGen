import {
  buildCompanyEnrichSourceKey,
  buildPersonSearchSourceKey,
  buildRdapSourceKey,
  hashRoleCriteria,
} from "@/server/domain/source-keys";
import type { ConnectorResult } from "@/server/infrastructure/connectors";
import {
  mapCrustdataPeopleToObservations,
  mapCrustdataToObservations,
  mapRdapToObservations,
} from "@/server/infrastructure/connectors";
import type {
  CrustdataCompanyResult,
  CrustdataPeopleSearchResult,
  RdapDomainResult,
} from "@/server/infrastructure/connectors/types";
import {
  connectorAttemptsRepo,
  entitiesRepo,
  getDb,
  runsRepo,
  sourcesRepo,
} from "@/server/infrastructure/db";

import type { StageContext } from "../jobs/process-run";
import { persistMappedObservations } from "./helpers";

type ProviderResults = {
  rdap: ConnectorResult<RdapDomainResult> | null;
  crustdataCompany: ConnectorResult<CrustdataCompanyResult> | null;
  crustdataPersonSearch: ConnectorResult<CrustdataPeopleSearchResult> | null;
};

async function recordConnectorAttempt(
  runId: string,
  connectorName: string,
  endpoint: string,
  result: ConnectorResult<unknown>,
  startedAt: number,
  recordsReturned?: number,
): Promise<void> {
  const db = getDb();
  const durationMs = Date.now() - startedAt;
  const status =
    result.status === "success"
      ? "success"
      : result.status === "disabled"
        ? "skipped"
        : /abort|timeout/i.test(result.error)
          ? "timeout"
          : "failed";

  await connectorAttemptsRepo.createConnectorAttempt(db, {
    runId,
    connectorName,
    endpoint,
    status,
    durationMs,
    errorCode:
      result.status === "error"
        ? (result.errorCode ?? result.error)
        : result.status === "disabled"
          ? "disabled"
          : null,
    recordsReturned: recordsReturned ?? null,
    attempts: 1,
  });
}

async function persistRdap(
  ctx: StageContext,
  result: ConnectorResult<RdapDomainResult>,
): Promise<void> {
  if (result.status !== "success") {
    return;
  }

  const db = getDb();
  const sourceKey = buildRdapSourceKey(ctx.normalizedDomain);
  const upsert = await sourcesRepo.upsertSourceDocument(db, {
    runId: ctx.runId,
    sourceType: "rdap",
    sourceUrl: `https://rdap.org/domain/${ctx.normalizedDomain}`,
    canonicalUrl: `https://rdap.org/domain/${ctx.normalizedDomain}`,
    sourceKey,
    responseStatus: 200,
    fetchedAt: new Date(),
    extractionStatus: "completed",
  });

  if (upsert.state !== "already_completed") {
    await persistMappedObservations(db, upsert.document.id, mapRdapToObservations(result.data));
    await sourcesRepo.updateExtractionStatus(db, upsert.document.id, "completed");
  }
}

async function persistCrustdataCompany(
  ctx: StageContext,
  result: ConnectorResult<CrustdataCompanyResult>,
): Promise<void> {
  if (result.status !== "success") {
    return;
  }

  const db = getDb();
  const sourceKey = buildCompanyEnrichSourceKey(ctx.normalizedDomain);
  const upsert = await sourcesRepo.upsertSourceDocument(db, {
    runId: ctx.runId,
    sourceType: "crustdata",
    sourceUrl: "https://api.crustdata.com/company/enrich",
    canonicalUrl: `https://api.crustdata.com/company/enrich/${ctx.normalizedDomain}`,
    sourceKey,
    responseStatus: 200,
    fetchedAt: new Date(),
    extractionStatus: "completed",
  });

  if (upsert.state !== "already_completed") {
    await persistMappedObservations(
      db,
      upsert.document.id,
      mapCrustdataToObservations(result.data),
    );
    await sourcesRepo.updateExtractionStatus(db, upsert.document.id, "completed");
  }

  const company =
    (ctx.companyId ? await entitiesRepo.getCompanyById(db, ctx.companyId) : undefined) ??
    (await entitiesRepo.findCompanyByDomain(db, ctx.normalizedDomain));

  if (!company) {
    return;
  }

  ctx.companyId = company.id;
  const data = result.data;
  if (data.name) {
    await entitiesRepo.updateCompany(db, company.id, { name: data.name });
  }
  if (data.industry) {
    await entitiesRepo.updateCompany(db, company.id, { industry: data.industry });
  }
  if (data.location) {
    await entitiesRepo.updateCompany(db, company.id, { location: data.location });
  }
  if (data.employeeCount != null) {
    await entitiesRepo.updateCompany(db, company.id, { employeeCount: data.employeeCount });
  }
  if (data.linkedinUrl) {
    await entitiesRepo.updateCompany(db, company.id, { professionalNetworkUrl: data.linkedinUrl });
  }
}

async function persistCrustdataPersonSearch(
  ctx: StageContext,
  result: ConnectorResult<CrustdataPeopleSearchResult>,
  criteriaHash: string,
): Promise<void> {
  if (result.status !== "success") {
    return;
  }

  const db = getDb();
  const sourceKey = buildPersonSearchSourceKey(ctx.normalizedDomain, criteriaHash);
  const upsert = await sourcesRepo.upsertSourceDocument(db, {
    runId: ctx.runId,
    sourceType: "crustdata",
    sourceUrl: "https://api.crustdata.com/person/search",
    canonicalUrl: `https://api.crustdata.com/person/search/${ctx.normalizedDomain}`,
    sourceKey,
    responseStatus: 200,
    fetchedAt: new Date(),
    extractionStatus: "completed",
  });

  if (upsert.state !== "already_completed") {
    await persistMappedObservations(
      db,
      upsert.document.id,
      mapCrustdataPeopleToObservations(result.data),
    );
    await sourcesRepo.updateExtractionStatus(db, upsert.document.id, "completed");
  }
}

export async function persistInitialProviderResults(
  ctx: StageContext,
  results: ProviderResults,
  timings: {
    rdapStarted: number;
    crustdataCompanyStarted: number;
    crustdataPersonSearchStarted: number;
  },
): Promise<void> {
  const db = getDb();
  const run = await runsRepo.getRunById(db, ctx.runId);
  const criteriaHash = hashRoleCriteria(run?.roleCriteria);

  if (results.rdap) {
    await recordConnectorAttempt(
      ctx.runId,
      "rdap",
      "/rdap/domain",
      results.rdap,
      timings.rdapStarted,
      results.rdap.status === "success" ? 1 : undefined,
    );
    await persistRdap(ctx, results.rdap);
  }

  if (results.crustdataCompany) {
    await recordConnectorAttempt(
      ctx.runId,
      "crustdata_company",
      "/company/enrich",
      results.crustdataCompany,
      timings.crustdataCompanyStarted,
      results.crustdataCompany.status === "success" ? 1 : undefined,
    );
    await persistCrustdataCompany(ctx, results.crustdataCompany);
    if (results.crustdataCompany.status === "success") {
      ctx.providerCompany = results.crustdataCompany.data;
    }
  }

  if (results.crustdataPersonSearch) {
    await recordConnectorAttempt(
      ctx.runId,
      "crustdata_person_search",
      "/person/search",
      results.crustdataPersonSearch,
      timings.crustdataPersonSearchStarted,
      results.crustdataPersonSearch.status === "success"
        ? results.crustdataPersonSearch.data.people.length
        : undefined,
    );
    await persistCrustdataPersonSearch(ctx, results.crustdataPersonSearch, criteriaHash);
    if (results.crustdataPersonSearch.status === "success") {
      ctx.providerPeople = results.crustdataPersonSearch.data;
    }
  }

  ctx.providersPersisted = true;
}
