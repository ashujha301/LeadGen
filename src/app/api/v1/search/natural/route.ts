export const runtime = "nodejs";

import { naturalSearchRequestSchema } from "@/shared/contracts";
import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { parseJsonBody, withRequestGuard } from "@/server/security/request-guard";
import { checkNaturalSearchLimit } from "@/server/security/rate-limit";
import { searchService } from "@/server/application/services/search-service";

export const POST = withRequestGuard(async (request, requestId, clientKey) => {
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

  const result = await searchService.naturalSearch(parsed.data);
  return jsonSuccess(result, requestId);
});
