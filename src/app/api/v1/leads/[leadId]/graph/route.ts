export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { leadService } from "@/server/application/services/lead-service";
import { withApiUser } from "@/features/auth/with-api-user";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const limit = checkReadApiLimit(clientKey);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
    }

    const segments = new URL(request.url).pathname.split("/");
    const leadId = segments.at(-2)!;
    const lead = await leadService.getLead(leadId, user.id);

    if (!lead) {
      return jsonError("NOT_FOUND", "Lead not found", requestId, 404);
    }

    const graph = await leadService.getLeadGraph(leadId, user.id);
    return jsonSuccess(graph, requestId);
  });
});
