export const runtime = "nodejs";

import { jsonError } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { exportService } from "@/server/application/services/export-service";
import { runService } from "@/server/application/services/run-service";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  const limit = checkReadApiLimit(clientKey);
  if (!limit.allowed) {
    return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
  }

  const runId = new URL(request.url).pathname.split("/").at(-1)!;
  const run = await runService.getRun(runId);

  if (!run) {
    return jsonError("NOT_FOUND", "Run not found", requestId, 404);
  }

  const { csv, count } = await exportService.exportRunLeads(runId);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${runId}.csv"`,
      "X-Request-Id": requestId,
      "X-Export-Count": String(count),
    },
  });
});
