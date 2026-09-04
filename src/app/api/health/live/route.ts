export const runtime = "nodejs";

import { jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";

export const GET = withRequestGuard(async (_request, requestId) => {
  return jsonSuccess({ status: "alive" }, requestId);
});
