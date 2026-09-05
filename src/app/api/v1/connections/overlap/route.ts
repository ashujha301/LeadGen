export const runtime = "nodejs";

import { overlapSearchParamsSchema } from "@/shared/contracts";
import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { searchService } from "@/server/application/services/search-service";
import { withApiUser } from "@/features/auth/with-api-user";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const limit = checkReadApiLimit(clientKey);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
    }

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = overlapSearchParamsSchema.safeParse(params);

    if (!parsed.success) {
      return jsonError(
        "VALIDATION_ERROR",
        parsed.error.errors[0]?.message ?? "Invalid overlap search params",
        requestId,
        400,
        { issues: parsed.error.flatten() },
      );
    }

    const results = await searchService.findOverlaps(parsed.data, user.id);
    return jsonSuccess(results, requestId);
  });
});
