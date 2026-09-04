import { extractClientIp, hashClientIp, isSameOriginRequest } from "@/shared/config/server";

import { createRequestId, jsonError } from "@/shared/utils/api-response";

type Handler = (request: Request, requestId: string, clientKey: string) => Promise<Response>;

export function withRequestGuard(handler: Handler): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const requestId = createRequestId();
    const clientIp = extractClientIp(request.headers);
    const clientKey = hashClientIp(clientIp);

    try {
      if (request.method !== "GET" && request.method !== "HEAD" && !isSameOriginRequest(request)) {
        return jsonError("CONFLICT", "Cross-origin request rejected", requestId, 403);
      }

      return await handler(request, requestId, clientKey);
    } catch (err) {
      console.error(`[${requestId}]`, err);
      return jsonError(
        "INTERNAL_ERROR",
        err instanceof Error ? err.message : "An unexpected error occurred",
        requestId,
        500,
      );
    }
  };
}

export async function parseJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export { extractClientIp, hashClientIp };
