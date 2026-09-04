export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { leadService } from "@/server/application/services/lead-service";
import { runService } from "@/server/application/services/run-service";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  const limit = checkReadApiLimit(clientKey);
  if (!limit.allowed) {
    return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
  }

  const segments = new URL(request.url).pathname.split("/");
  const runId = segments.at(-2)!;
  const run = await runService.getRun(runId);

  if (!run) {
    return jsonError("NOT_FOUND", "Run not found", requestId, 404);
  }

  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  const scopeParam = new URL(request.url).searchParams.get("scope");
  const scope = scopeParam === "all" ? "all" : "matched";
  const { leads, nextCursor } = await leadService.getLeadsForRun(runId, cursor, scope);

  return jsonSuccess(leads, requestId, { nextCursor });
});
