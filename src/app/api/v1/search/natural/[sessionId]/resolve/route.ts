export const runtime = "nodejs";

import { naturalSearchResolveRequestSchema } from "@/shared/contracts/natural-search-v2";
import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { parseJsonBody, withRequestGuard } from "@/server/security/request-guard";
import { checkNaturalSearchLimit } from "@/server/security/rate-limit";
import { searchService } from "@/server/application/services/search-service";
import { NaturalSearchError } from "@/server/application/search/natural-search";
import { withApiUser } from "@/features/auth/with-api-user";

export const POST = withRequestGuard(async (request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const limit = checkNaturalSearchLimit(clientKey);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", "Natural search rate limit exceeded", requestId, 429);
    }

    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    // .../search/natural/{sessionId}/resolve
    const resolveIdx = parts.lastIndexOf("resolve");
    const sessionId = resolveIdx > 0 ? parts[resolveIdx - 1] : "";
    if (!sessionId) {
      return jsonError("VALIDATION_ERROR", "Missing session id", requestId, 400);
    }

    const body = await parseJsonBody<unknown>(request);
    const parsed = naturalSearchResolveRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        "VALIDATION_ERROR",
        parsed.error.errors[0]?.message ?? "Invalid clarification answers",
        requestId,
        422,
        { issues: parsed.error.flatten() },
      );
    }

    try {
      const result = await searchService.resolveNaturalSearch(
        sessionId,
        parsed.data,
        user.id,
        requestId,
      );
      return jsonSuccess(result, requestId);
    } catch (error) {
      if (error instanceof NaturalSearchError) {
        const status =
          error.code === "NOT_FOUND"
            ? 404
            : error.code === "VERSION_CONFLICT"
              ? 409
              : error.code === "SESSION_EXPIRED"
                ? 410
                : error.code === "AI_UNAVAILABLE" || error.code === "SERVICE_UNAVAILABLE"
                  ? 503
                  : error.code === "UPSTREAM_TIMEOUT"
                    ? 504
                    : 422;
        const safeDetails = error.details
          ? { category: error.details.category, forbidden: error.details.forbidden }
          : undefined;
        return jsonError(error.code, error.message, requestId, status, safeDetails);
      }
      throw error;
    }
  });
});
