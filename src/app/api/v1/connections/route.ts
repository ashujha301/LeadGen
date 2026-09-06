export const runtime = "nodejs";

import { potentialConnectionsQuerySchema } from "@/shared/contracts";
import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { potentialConnectionsService } from "@/server/application/services/potential-connections-service";
import { withApiUser } from "@/features/auth/with-api-user";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const limit = checkReadApiLimit(clientKey);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
    }

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = potentialConnectionsQuerySchema.safeParse(params);

    if (!parsed.success) {
      return jsonError(
        "VALIDATION_ERROR",
        parsed.error.errors[0]?.message ?? "Invalid connections query",
        requestId,
        400,
        { issues: parsed.error.flatten() },
      );
    }

    const result = await potentialConnectionsService.listForUser(user.id, parsed.data);
    return jsonSuccess(result, requestId);
  });
});
