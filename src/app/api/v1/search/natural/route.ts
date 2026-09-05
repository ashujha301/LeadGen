export const runtime = "nodejs";

import { naturalSearchRequestSchema } from "@/shared/contracts";
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

    const body = await parseJsonBody<unknown>(request);
    const parsed = naturalSearchRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        "VALIDATION_ERROR",
        parsed.error.errors[0]?.message ?? "Invalid search query",
        requestId,
        400,
        { issues: parsed.error.flatten() },
      );
    }

    try {
      const result = await searchService.naturalSearch(parsed.data, user.id);
      return jsonSuccess(result, requestId);
    } catch (error) {
      if (error instanceof NaturalSearchError) {
        const status =
          error.code === "AI_UNAVAILABLE"
            ? 503
            : error.code === "UPSTREAM_TIMEOUT"
              ? 504
              : error.code === "AMBIGUOUS_PERSON"
                ? 409
                : error.code === "NOT_FOUND"
                  ? 404
                  : 422;
        return jsonError(error.code, error.message, requestId, status, error.details);
      }
      throw error;
    }
  });
});
