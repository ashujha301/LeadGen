export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { runService } from "@/server/application/services/run-service";

export const POST = withRequestGuard(async (request, requestId, clientKey) => {
  const limit = checkReadApiLimit(clientKey);
  if (!limit.allowed) {
    return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
  }

  const runId = new URL(request.url).pathname.split("/").at(-2)!;

  try {
    const run = await runService.cancelRun(runId);
    if (!run) {
      return jsonError("NOT_FOUND", "Run not found", requestId, 404);
    }
    return jsonSuccess(run, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel run";
    if (message.includes("terminal")) {
      return jsonError("CONFLICT", message, requestId, 409);
    }
    return jsonError("INTERNAL_ERROR", message, requestId, 500);
  }
});
