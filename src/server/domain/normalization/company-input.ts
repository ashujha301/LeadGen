import { normalizeDomain } from "./domain";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^\[::1\]$/,
];

export type NormalizedCompanyInput = {
  input: string;
  normalizedDomain: string;
  homepageUrl: string;
};

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Normalize a bare domain or HTTP(S) company URL into crawl/provider identity.
 */
export function normalizeCompanyInput(raw: string): NormalizedCompanyInput | null {
  const input = raw.trim();
  if (!input) {
    return null;
  }

  const lower = input.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("ftp:") || lower.startsWith("file:")) {
    return null;
  }

  if (input.includes("@")) {
    return null;
  }

  const withScheme = input.includes("://") ? input : `https://${input}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  const normalizedDomain = normalizeDomain(input);
  if (!normalizedDomain || isPrivateHost(normalizedDomain)) {
    return null;
  }

  const homepageUrl = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}/`;

  return {
    input,
    normalizedDomain,
    homepageUrl,
  };
}
