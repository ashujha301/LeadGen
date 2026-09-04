const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "ref",
  "referrer",
]);

const ASSET_EXTENSIONS =
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|ico|css|js|woff2?|ttf|eot|zip|tar|gz|mp4|mp3|avi|mov)(\?|$)/i;

const SKIP_PATH_PATTERNS =
  /\/(login|logout|signin|signout|signup|register|cart|checkout|search|calendar)(\/|$|\?)/i;

const PROFILE_HOST_PATTERNS = [
  /^([a-z0-9-]+\.)?linkedin\.com$/i,
  /^([a-z0-9-]+\.)?twitter\.com$/i,
  /^([a-z0-9-]+\.)?x\.com$/i,
];

const PROFILE_PATH_PATTERNS = [
  /^\/in\//i,
  /^\/pub\//i,
  /^\/company\/[^/]+\/people/i,
];

const LINKEDIN_COMPANY_PROFILE_PATTERN = /^\/company\/[^/]+\/?$/i;

const LOW_VALUE_CONTENT_PATH_PATTERN =
  /\/(blog|resources|news|webinar|careers|press)(\/|$|\?)/i;

export function isLowValueContentPath(pathname: string): boolean {
  return LOW_VALUE_CONTENT_PATH_PATTERN.test(pathname);
}

export type DiscoveredLink = {
  href: string;
  anchorText: string;
  navContext?: string;
};

export type LinkPriority = 0 | 1 | 2 | 3 | 4 | 5;

const HIGHEST_KEYWORDS =
  /\b(team|leadership|founder|co-?founder|management|people|executive|humans|staff)\b/i;
const HIGH_KEYWORDS = /\b(about|company|contact|story|our-story)\b/i;
const MEDIUM_KEYWORDS =
  /\b(products?|solutions?|industries|customers?|case-studies?|case studies)\b/i;
const LOWER_KEYWORDS = /\b(careers?|news|press|blog)\b/i;
const SKIP_KEYWORDS = /\b(privacy|terms|cookies|cookie-policy|tags?)\b/i;
const PAGINATION_PATTERN = /[?&](page|p)=|\bpage-\d+\b/i;

export function normalizeDiscoveredUrl(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    if (!url.protocol.startsWith("http")) {
      return null;
    }

    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function classifyDiscoveredLink(
  pathname: string,
  anchorText: string,
  navContext?: string,
): LinkPriority {
  if (isLowValueContentPath(pathname)) {
    return 4;
  }

  const combined = `${pathname} ${anchorText} ${navContext ?? ""}`.toLowerCase();

  if (SKIP_KEYWORDS.test(combined) || PAGINATION_PATTERN.test(combined)) {
    return 4;
  }
  if (HIGHEST_KEYWORDS.test(combined)) {
    return 0;
  }
  if (HIGH_KEYWORDS.test(combined)) {
    return 1;
  }
  if (MEDIUM_KEYWORDS.test(combined)) {
    return 2;
  }
  if (LOWER_KEYWORDS.test(combined)) {
    return 3;
  }
  return 5;
}

export function shouldSkipDiscoveredUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return true;
  }

  if (/^(mailto:|tel:|javascript:)/i.test(trimmed)) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);

    if (ASSET_EXTENSIONS.test(parsed.pathname)) {
      return true;
    }

    if (SKIP_PATH_PATTERNS.test(`${parsed.pathname}${parsed.search}`)) {
      return true;
    }

    if (isLowValueContentPath(parsed.pathname)) {
      return true;
    }

    if (parsed.pathname.includes("/download") || parsed.searchParams.has("download")) {
      return true;
    }

    if (/linkedin\.com/i.test(parsed.hostname) && /\/follow/i.test(parsed.pathname)) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export function isLinkedInCompanyProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!/linkedin\.com$/i.test(host)) {
      return false;
    }
    return LINKEDIN_COMPANY_PROFILE_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isExternalProfileUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (!PROFILE_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
      return false;
    }

    if (/linkedin\.com$/i.test(host)) {
      if (isLinkedInCompanyProfileUrl(url)) {
        return true;
      }
      return PROFILE_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname));
    }

    return parsed.pathname.length > 1 && !parsed.pathname.startsWith("/search");
  } catch {
    return false;
  }
}

export function extractLinksFromHtml(html: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];
  const anchorRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1]?.trim();
    if (!href) {
      continue;
    }

    const anchorText = match[2]
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const prefix = html.slice(Math.max(0, match.index - 200), match.index);
    const navContext = /<nav\b/i.test(prefix) ? "nav" : undefined;

    links.push({
      href,
      anchorText: anchorText ?? "",
      navContext,
    });
  }

  return links;
}

export function extractLinksFromTuples(
  tuples: Array<[href: string, anchorText?: string, navContext?: string]>,
): DiscoveredLink[] {
  return tuples.map(([href, anchorText = "", navContext]) => ({
    href,
    anchorText,
    navContext,
  }));
}

export function parseSitemapUrlsFromRobots(robotsTxt: string): string[] {
  const sitemaps: string[] = [];

  for (const rawLine of robotsTxt.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    if (directive !== "sitemap") {
      continue;
    }

    const url = line.slice(colonIndex + 1).trim();
    if (url) {
      sitemaps.push(url);
    }
  }

  return sitemaps;
}

export function parseSitemapLocUrls(xml: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1]?.trim();
    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

export function compareLinkPriority(
  a: { priority: LinkPriority; depth: number },
  b: { priority: LinkPriority; depth: number },
): number {
  return a.priority - b.priority || a.depth - b.depth;
}

export function selectNextQueueItem<T extends { priority: LinkPriority; depth: number }>(
  queue: T[],
): T | undefined {
  if (queue.length === 0) {
    return undefined;
  }

  let bestIndex = 0;
  for (let index = 1; index < queue.length; index += 1) {
    if (compareLinkPriority(queue[index]!, queue[bestIndex]!) < 0) {
      bestIndex = index;
    }
  }

  return queue.splice(bestIndex, 1)[0];
}
