import { createHmac } from "node:crypto";

import { getEnv } from "./env";

/**
 * HMAC-SHA256 hash of a client IP using IP_HASH_SALT.
 */
export function hashClientIp(ip: string): string {
  const env = getEnv();
  return createHmac("sha256", env.IP_HASH_SALT).update(ip.trim()).digest("hex");
}

/**
 * Extract the client IP from request headers, honoring trusted proxy hops.
 */
export function extractClientIp(headers: Headers, trustedProxyHops?: number): string {
  const hops = trustedProxyHops ?? getEnv().TRUSTED_PROXY_HOPS;
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const index = Math.max(0, parts.length - hops);
    return parts[index] ?? "unknown";
  }

  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Reject cross-origin mutating requests when an Origin header is present.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  const host = request.headers.get("host");
  if (!host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
