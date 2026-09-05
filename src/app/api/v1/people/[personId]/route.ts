export const runtime = "nodejs";

import { jsonError, jsonSuccess } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { entityService } from "@/server/application/services/entity-service";
import { withApiUser } from "@/features/auth/with-api-user";

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  return withApiUser(requestId, async (user) => {
    const limit = checkReadApiLimit(clientKey);
    if (!limit.allowed) {
      return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
    }

    const personId = new URL(request.url).pathname.split("/").at(-1)!;
    const person = await entityService.getPerson(personId, user.id);

    if (!person) {
      return jsonError("NOT_FOUND", "Person not found", requestId, 404);
    }

    return jsonSuccess(person, requestId);
  });
});
