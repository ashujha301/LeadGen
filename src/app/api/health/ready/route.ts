export const runtime = "nodejs";

import { getPool } from "@/server/infrastructure/db";
import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { QUEUE_NAME } from "@/server/infrastructure/queue/web-queue";

export const GET = withRequestGuard(async (_request, requestId) => {
  try {
    const pool = getPool();
    await pool.query("SELECT 1");

    return jsonSuccess(
      {
        status: "ready",
        checks: {
          database: "ok",
          queue: QUEUE_NAME,
        },
      },
      requestId,
    );
  } catch (error) {
    return jsonError(
      "SERVICE_UNAVAILABLE",
      error instanceof Error ? error.message : "Readiness check failed",
      requestId,
      503,
    );
  }
});
