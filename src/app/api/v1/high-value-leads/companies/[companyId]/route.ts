export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { getDb, highValueLeadsRepo } from "@/server/infrastructure/db";
import { leadService } from "@/server/application/services/lead-service";
import { withApiUser } from "@/features/auth/with-api-user";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const limit = checkReadApiLimit(clientKey);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
    }

    const url = new URL(request.url);
    const companyId = url.pathname.split("/").at(-1)!;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitParam = Number(url.searchParams.get("limit") ?? "20");

    const db = getDb();
    const company = await highValueLeadsRepo.getHighValueCompanyById(db, companyId, user.id);
    if (!company) {
      return jsonError("NOT_FOUND", "Company not found", requestId, 404);
    }

    const page = await highValueLeadsRepo.getHighValueLeadsByCompanyId(db, companyId, {
      cursor,
      limit: Number.isFinite(limitParam) ? limitParam : 20,
      userId: user.id,
    });

    const leads = await Promise.all(
      page.leads.map((lead) => leadService.getLead(lead.id, user.id)),
    );

    return jsonSuccess(
      {
        company: {
          id: company.id,
          name: company.name,
          domain: company.normalizedDomain,
          industry: company.industry,
          location: company.location,
          headcount: company.employeeCount,
          professionalNetworkUrl: company.professionalNetworkUrl,
          qualifyingLeadCount: company.qualifyingLeadCount,
          industrySource: company.industrySource,
          industryObservedAt: company.industryObservedAt?.toISOString() ?? null,
          providerUpdatedAt: company.providerUpdatedAt?.toISOString() ?? null,
        },
        leads: leads.filter(Boolean),
        nextCursor: page.nextCursor,
      },
      requestId,
    );
  });
});
