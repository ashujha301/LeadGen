export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { withApiUser } from "@/features/auth/with-api-user";
import { backfillPersonTimeline } from "@/server/application/services/backfill-person-timeline";

export const POST = withRequestGuard(async (request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const limit = checkReadApiLimit(clientKey);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
    }

    const segments = new URL(request.url).pathname.split("/");
    const personId = segments.at(-2)!;

    const result = await backfillPersonTimeline(personId, user.id);
    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return jsonError("NOT_FOUND", result.message, requestId, 404);
      }
      if (result.code === "VALIDATION_ERROR") {
        return jsonError("VALIDATION_ERROR", result.message, requestId, 400);
      }
      if (result.code === "SERVICE_UNAVAILABLE") {
        return jsonError("SERVICE_UNAVAILABLE", result.message, requestId, 503);
      }
      return jsonError("INTERNAL_ERROR", result.message, requestId, 502, {
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
      });
    }

    return jsonSuccess(
      {
        timelineStatus: result.timelineStatus,
        employmentCount: result.employmentCount,
        calculatedTotalMonths: result.calculatedTotalMonths,
        providerExperienceYears: result.providerExperienceYears,
      },
      requestId,
    );
  });
});
