export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { entityService } from "@/server/application/services/entity-service";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  const limit = checkReadApiLimit(clientKey);
  if (!limit.allowed) {
    return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
  }

  const companyId = new URL(request.url).pathname.split("/").at(-1)!;
  const company = await entityService.getCompany(companyId);

  if (!company) {
    return jsonError("NOT_FOUND", "Company not found", requestId, 404);
  }

  return jsonSuccess(company, requestId);
});
