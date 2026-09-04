export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { leadService } from "@/server/application/services/lead-service";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  const limit = checkReadApiLimit(clientKey);
  if (!limit.allowed) {
    return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
  }

  const leadId = new URL(request.url).pathname.split("/").at(-1)!;
  const lead = await leadService.getLead(leadId);

  if (!lead) {
    return jsonError("NOT_FOUND", "Lead not found", requestId, 404);
  }

  return jsonSuccess(lead, requestId);
});
