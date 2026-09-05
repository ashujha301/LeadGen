export const runtime = "nodejs";

import { createRunRequestSchema } from "@/shared/contracts";
import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { parseJsonBody, withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { RunQuotaError, runService } from "@/server/application/services/run-service";
import { withApiUser } from "@/features/auth/with-api-user";

export const POST = withRequestGuard(async (request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const body = await parseJsonBody<unknown>(request);
    const parsed = createRunRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(
        "VALIDATION_ERROR",
        parsed.error.errors[0]?.message ?? "Invalid request body",
        requestId,
        400,
        { issues: parsed.error.flatten() },
      );
    }

    try {
      const idempotencyKey = request.headers.get("Idempotency-Key") ?? undefined;
      const run = await runService.createRun(parsed.data, user.id, clientKey, idempotencyKey);
      return jsonSuccess(run, requestId, undefined, 201);
    } catch (error) {
      if (error instanceof RunQuotaError) {
        return jsonError("QUOTA_EXCEEDED", error.message, requestId, 429);
      }
      throw error;
    }
  });
});

export const GET = withRequestGuard(async (_request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const limit = checkReadApiLimit(clientKey);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
    }

    const runs = await runService.listRecent(user.id);
    return jsonSuccess(runs, requestId);
  });
});
