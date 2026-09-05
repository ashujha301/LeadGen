import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

const PRIVATE_IPV4_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
];

const PRIVATE_IPV6_PATTERNS = [/^::1$/, /^fc/i, /^fd/i, /^fe80/i];

function isPrivateIp(address: string): boolean {
  if (PRIVATE_IPV6_PATTERNS.some((p) => p.test(address))) return true;
  return PRIVATE_IPV4_RANGES.some((p) => p.test(address));
}

export function validateUrl(
  urlString: string,
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, reason: "Only HTTP(S) protocols are allowed" };
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".local")) {
    return { ok: false, reason: "Blocked hostname" };
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { ok: false, reason: "Private IP addresses are not allowed" };
    }
    return { ok: true, url };
  }

  return { ok: true, url };
}

export async function resolveAndValidateHost(
  url: URL,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const hostname = url.hostname;

  if (isIP(hostname)) {
    return isPrivateIp(hostname) ? { ok: false, reason: "Private IP address" } : { ok: true };
  }

  try {
    const addresses = await lookup(hostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        return { ok: false, reason: `Hostname resolves to private IP: ${address}` };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "DNS resolution failed" };
  }
}

export async function assertSafeNavigation(urlString: string): Promise<URL> {
  const validated = validateUrl(urlString);
  if (!validated.ok) {
    throw new Error(`SSRF guard: ${validated.reason}`);
  }

  const resolved = await resolveAndValidateHost(validated.url);
  if (!resolved.ok) {
    throw new Error(`SSRF guard: ${resolved.reason}`);
  }

  return validated.url;
}
