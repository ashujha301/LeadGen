import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyDiscoveredLink,
  compareLinkPriority,
  extractLinksFromHtml,
  isExternalProfileUrl,
  isLinkedInCompanyProfileUrl,
  normalizeDiscoveredUrl,
  parseSitemapLocUrls,
  parseSitemapUrlsFromRobots,
  selectNextQueueItem,
  shouldSkipDiscoveredUrl,
} from "@/server/infrastructure/browser/url-discovery";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/company-pages");

describe("normalizeDiscoveredUrl", () => {
  it("strips fragments and tracking parameters", () => {
    expect(
      normalizeDiscoveredUrl("/team?utm_source=newsletter#leadership", "https://acme.test"),
    ).toBe("https://acme.test/team");
  });

  it("rejects non-http schemes", () => {
    expect(normalizeDiscoveredUrl("mailto:founder@acme.test", "https://acme.test")).toBeNull();
    expect(normalizeDiscoveredUrl("tel:+15551234567", "https://acme.test")).toBeNull();
  });
});

describe("classifyDiscoveredLink", () => {
  it("prioritizes leadership and people paths highest", () => {
    expect(classifyDiscoveredLink("/humans", "Humans")).toBe(0);
    expect(classifyDiscoveredLink("/team", "Meet the team")).toBe(0);
  });

  it("deprioritizes low-value content paths before keyword matching", () => {
    expect(classifyDiscoveredLink("/blog", "Leadership Team")).toBe(4);
    expect(classifyDiscoveredLink("/press", "Press")).toBe(4);
  });

  it("classifies about-like paths as high priority", () => {
    expect(classifyDiscoveredLink("/our-story", "Our Story")).toBe(1);
    expect(classifyDiscoveredLink("/about-us", "About")).toBe(1);
  });

  it("deprioritizes legal pages", () => {
    expect(classifyDiscoveredLink("/privacy", "Privacy Policy")).toBe(4);
    expect(classifyDiscoveredLink("/terms", "Terms of Service")).toBe(4);
  });
});

describe("shouldSkipDiscoveredUrl", () => {
  it("skips low-value content paths during discovery", () => {
    expect(shouldSkipDiscoveredUrl("https://acme.test/careers")).toBe(true);
    expect(shouldSkipDiscoveredUrl("https://acme.test/blog/post-1")).toBe(true);
  });

  it("rejects assets, auth flows, and search pages", () => {
    expect(shouldSkipDiscoveredUrl("https://acme.test/assets/logo.png")).toBe(true);
    expect(shouldSkipDiscoveredUrl("https://acme.test/login")).toBe(true);
    expect(shouldSkipDiscoveredUrl("https://acme.test/search?q=ceo")).toBe(true);
    expect(shouldSkipDiscoveredUrl("https://acme.test/cart")).toBe(true);
  });

  it("rejects linkedin follow links", () => {
    expect(shouldSkipDiscoveredUrl("https://www.linkedin.com/company/acme/follow?trk=abc")).toBe(
      true,
    );
  });

  it("allows normal internal pages", () => {
    expect(shouldSkipDiscoveredUrl("https://acme.test/our-story")).toBe(false);
    expect(shouldSkipDiscoveredUrl("https://acme.test/humans")).toBe(false);
  });
});

describe("isExternalProfileUrl", () => {
  it("detects linkedin profile URLs", () => {
    expect(isExternalProfileUrl("https://www.linkedin.com/in/jane-founder")).toBe(true);
    expect(isExternalProfileUrl("https://www.linkedin.com/company/acme")).toBe(true);
  });

  it("detects linkedin company profile URLs", () => {
    expect(isLinkedInCompanyProfileUrl("https://www.linkedin.com/company/acme")).toBe(true);
    expect(isLinkedInCompanyProfileUrl("https://www.linkedin.com/company/acme/people")).toBe(false);
  });
});

describe("dynamic homepage fixture", () => {
  it("extracts only linked paths from the homepage fixture", () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "dynamic-home.html"), "utf8");
    const baseUrl = "https://dynamic-discovery.test";
    const internalLinks = extractLinksFromHtml(html)
      .map((link) => normalizeDiscoveredUrl(link.href, baseUrl))
      .filter((url): url is string => Boolean(url))
      .filter((url) => !shouldSkipDiscoveredUrl(url))
      .filter((url) => url.startsWith(baseUrl));

    expect(internalLinks).toEqual(
      expect.arrayContaining([
        "https://dynamic-discovery.test/our-story",
        "https://dynamic-discovery.test/humans",
      ]),
    );
    expect(internalLinks.some((url) => url.includes("/careers"))).toBe(false);
    expect(internalLinks.some((url) => url.includes("/about"))).toBe(false);
    expect(internalLinks.some((url) => url.includes("/team"))).toBe(false);
  });

  it("does not treat linkedin profiles as crawl targets", () => {
    const html = readFileSync(resolve(FIXTURE_DIR, "dynamic-home.html"), "utf8");
    const profileLinks = extractLinksFromHtml(html)
      .map((link) => normalizeDiscoveredUrl(link.href, "https://dynamic-discovery.test"))
      .filter((url): url is string => Boolean(url))
      .filter((url) => isExternalProfileUrl(url));

    expect(profileLinks).toEqual(["https://www.linkedin.com/in/jane-founder"]);
  });
});

describe("priority queue helpers", () => {
  it("processes high priority links before low priority candidates", () => {
    const queue = [
      { url: "https://acme.test/careers", depth: 1, priority: 3 as const },
      { url: "https://acme.test/team", depth: 1, priority: 0 as const },
      { url: "https://acme.test/blog", depth: 1, priority: 3 as const },
    ];

    const first = selectNextQueueItem(queue);
    expect(first?.url).toBe("https://acme.test/team");
    expect(compareLinkPriority(queue[0]!, { priority: 0, depth: 1 })).toBeGreaterThan(0);
  });
});

describe("robots sitemap parsing", () => {
  it("returns only advertised sitemap URLs", () => {
    const robots = `
User-agent: *
Disallow: /admin
Sitemap: https://acme.test/sitemap.xml
Sitemap: https://acme.test/sitemap-news.xml
`;
    expect(parseSitemapUrlsFromRobots(robots)).toEqual([
      "https://acme.test/sitemap.xml",
      "https://acme.test/sitemap-news.xml",
    ]);
  });

  it("extracts loc entries from sitemap XML", () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url><loc>https://acme.test/our-story</loc></url>
        <url><loc>https://acme.test/humans</loc></url>
      </urlset>
    `;
    expect(parseSitemapLocUrls(xml)).toEqual([
      "https://acme.test/our-story",
      "https://acme.test/humans",
    ]);
  });
});

describe("discover stage contract", () => {
  it("does not seed guessed priority paths", () => {
    const discoverSource = readFileSync(
      resolve(process.cwd(), "src/server/worker/stages/discover.ts"),
      "utf8",
    );
    expect(discoverSource).not.toContain("CRAWL_PRIORITY_PATHS");
  });
});
