export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { getDb, highValueLeadsRepo } from "@/server/infrastructure/db";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  const limit = checkReadApiLimit(clientKey);
  if (!limit.allowed) {
    return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
  }

  const db = getDb();
  const companies = await highValueLeadsRepo.listHighValueCompanies(db);

  return jsonSuccess(
    {
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name,
        domain: company.normalizedDomain,
        industry: company.industry,
        headcount: company.employeeCount,
        professionalNetworkUrl: company.professionalNetworkUrl,
        qualifyingLeadCount: company.qualifyingLeadCount,
        topScore: company.topScore,
        hasActiveRun: company.hasActiveRun,
        lastEnrichmentAt: company.lastEnrichmentAt?.toISOString() ?? null,
        industrySource: company.industrySource,
        industryObservedAt: company.industryObservedAt?.toISOString() ?? null,
        providerUpdatedAt: company.providerUpdatedAt?.toISOString() ?? null,
      })),
    },
    requestId,
  );
});
