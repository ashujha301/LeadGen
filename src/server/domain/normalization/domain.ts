/**
 * Normalize a domain or URL to a canonical registrable domain:
 * lowercase, strip www, decode/encode punycode via URL hostname parsing.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const withScheme = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
    const url = new URL(withScheme);
    let hostname = url.hostname.toLowerCase();

    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }

    if (!hostname || !hostname.includes(".")) {
      return null;
    }

    return hostname;
  } catch {
    const fallback = trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      ?.replace(/:\d+$/, "");

    if (!fallback || !fallback.includes(".")) {
      return null;
    }

    return fallback;
  }
}
