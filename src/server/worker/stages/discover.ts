import { getDb, runsRepo, sourcesRepo } from "@/server/infrastructure/db";

import { closeBrowser, launchBrowser } from "@/server/infrastructure/browser/launch-browser";
import {
  canAttemptNavigation,
  canRecordSuccessfulPage,
  createPageLimitState,
  isWithinDepth,
  recordAttempt,
  recordSuccessfulPage,
} from "@/server/infrastructure/browser/page-limits";
import { fetchRobotsData, isPathAllowed } from "@/server/infrastructure/browser/robots";
import { assertSafeNavigation } from "@/server/infrastructure/browser/ssrf-guard";
import {
  classifyDiscoveredLink,
  extractLinksFromHtml,
  isExternalProfileUrl,
  isLinkedInCompanyProfileUrl,
  normalizeDiscoveredUrl,
  parseSitemapLocUrls,
  parseSitemapUrlsFromRobots,
  selectNextQueueItem,
  shouldSkipDiscoveredUrl,
  type LinkPriority,
} from "@/server/infrastructure/browser/url-discovery";
import { USER_AGENT } from "@/shared/config";
import { buildWebsiteSourceKey } from "@/server/domain/source-keys";
import { getCrawlLimits } from "@/server/worker/config";
import { assertRunNotCanceled, getRunAbortSignal } from "@/server/worker/run-abort";
import type { MappedObservation } from "@/server/infrastructure/connectors";
import type { StageContext, StageResult } from "../jobs/process-run";
import {
  extractTextExcerpt,
  hashContent,
  isSameRegistrableDomain,
  persistMappedObservations,
} from "./helpers";

type QueueItem = {
  url: string;
  depth: number;
  priority: LinkPriority;
};

const MAX_PAGE_HTML_CHARS = 120_000;
const EARLY_STOP_SUCCESSFUL_PAGES = 5;
const EARLY_STOP_HIGH_PRIORITY_PAGES = 3;

function truncatePageHtml(html: string): string {
  return html.length > MAX_PAGE_HTML_CHARS ? html.slice(0, MAX_PAGE_HTML_CHARS) : html;
}

function shouldStopDiscovery(successfulPages: number, highPriorityPages: number): boolean {
  return (
    successfulPages >= EARLY_STOP_SUCCESSFUL_PAGES ||
    highPriorityPages >= EARLY_STOP_HIGH_PRIORITY_PAGES
  );
}

function canonicalizeUrl(url: URL): string {
  url.hash = "";
  return url.toString();
}

function buildQueueItem(
  url: string,
  depth: number,
  anchorText = "",
  navContext?: string,
): QueueItem {
  const pathname = new URL(url).pathname;
  return {
    url,
    depth,
    priority: classifyDiscoveredLink(pathname, anchorText, navContext),
  };
}

function enqueueDiscoveredLink(
  queue: QueueItem[],
  scheduled: Set<string>,
  url: string,
  depth: number,
  anchorText = "",
  navContext?: string,
): void {
  if (scheduled.has(url)) {
    return;
  }
  scheduled.add(url);
  queue.push(buildQueueItem(url, depth, anchorText, navContext));
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  try {
    const response = await fetch(sitemapUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return [];
    }
    const xml = await response.text();
    return parseSitemapLocUrls(xml);
  } catch {
    return [];
  }
}

function collectDiscoveredLinks(
  html: string,
  pageUrl: string,
  depth: number,
  normalizedDomain: string,
  queue: QueueItem[],
  scheduled: Set<string>,
  profileObservations: MappedObservation[],
): void {
  if (depth >= getCrawlLimits().maxDepth) {
    return;
  }

  for (const link of extractLinksFromHtml(html)) {
    const normalized = normalizeDiscoveredUrl(link.href, pageUrl);
    if (!normalized || shouldSkipDiscoveredUrl(normalized)) {
      continue;
    }

    if (isExternalProfileUrl(normalized)) {
      if (isLinkedInCompanyProfileUrl(normalized)) {
        profileObservations.push({
          entityType: "company",
          attribute: "professional_network_url",
          rawValue: normalized,
          normalizedValue: normalized.toLowerCase(),
          confidence: 0.75,
        });
      } else {
        profileObservations.push({
          entityType: "contact",
          attribute: "profile_url",
          rawValue: normalized,
          normalizedValue: normalized.toLowerCase(),
          confidence: 0.6,
        });
      }
      continue;
    }

    if (!isSameRegistrableDomain(normalized, normalizedDomain)) {
      continue;
    }

    enqueueDiscoveredLink(
      queue,
      scheduled,
      normalized,
      depth + 1,
      link.anchorText,
      link.navContext,
    );
  }
}

export async function discover(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  await runsRepo.updateRunStatus(db, ctx.runId, "discovering");

  const baseUrl = `https://${ctx.normalizedDomain}`;
  const { rules: robotsRules, rawContent: robotsContent } = await fetchRobotsData(baseUrl);
  const limitState = createPageLimitState();
  const scheduled = new Set<string>();
  const crawled = new Set<string>();
  const homepageItem = buildQueueItem(baseUrl, 0);
  scheduled.add(canonicalizeUrl(new URL(baseUrl)));
  const queue: QueueItem[] = [homepageItem];

  const sitemapUrls = parseSitemapUrlsFromRobots(robotsContent);
  let sitemapReleased = false;
  const homepageCanonical = canonicalizeUrl(new URL(baseUrl));

  let pagesDiscovered = 0;
  let highPriorityPagesCrawled = 0;
  let inFlight = 0;
  const { browser, context } = await launchBrowser();
  const crawlLimits = getCrawlLimits();
  const abortSignal = getRunAbortSignal(ctx.runId);
  const concurrency = Math.max(1, crawlLimits.concurrency);

  async function crawlOne(item: QueueItem): Promise<void> {
    await assertRunNotCanceled(ctx.runId);

    let safeUrl: URL;
    try {
      safeUrl = await assertSafeNavigation(item.url);
    } catch {
      return;
    }

    if (!isSameRegistrableDomain(safeUrl.toString(), ctx.normalizedDomain)) {
      return;
    }

    if (!isWithinDepth(item.depth)) {
      return;
    }

    const canonical = canonicalizeUrl(safeUrl);
    if (crawled.has(canonical)) {
      return;
    }

    if (!isPathAllowed(safeUrl.pathname, robotsRules)) {
      return;
    }

    crawled.add(canonical);
    recordAttempt(limitState);

    const page = await context.newPage();

    try {
      if (abortSignal?.aborted) {
        throw new Error("Run aborted");
      }
      const response = await page.goto(canonical, {
        timeout: crawlLimits.pageTimeoutMs,
        waitUntil: "domcontentloaded",
        ...(abortSignal ? { signal: abortSignal } : {}),
      });
      const responseStatus = response?.status() ?? null;
      const html = await page.content();

      if (!responseStatus || responseStatus >= 400) {
        return;
      }

      if (!canRecordSuccessfulPage(limitState)) {
        return;
      }

      const excerpt = extractTextExcerpt(html);
      const contentHash = hashContent(html);

      const document = await sourcesRepo.upsertSourceDocument(db, {
        runId: ctx.runId,
        sourceType: "website",
        sourceUrl: item.url,
        canonicalUrl: page.url(),
        sourceKey: buildWebsiteSourceKey(page.url()),
        responseStatus,
        contentHash,
        excerpt,
        pageHtml: truncatePageHtml(html),
        fetchedAt: new Date(),
        extractionStatus: "pending",
      });

      if (document.state === "already_completed") {
        return;
      }

      const profileObservations: MappedObservation[] = [];
      collectDiscoveredLinks(
        html,
        page.url(),
        item.depth,
        ctx.normalizedDomain,
        queue,
        scheduled,
        profileObservations,
      );

      if (profileObservations.length > 0) {
        await persistMappedObservations(db, document.document.id, profileObservations);
      }

      pagesDiscovered += 1;
      recordSuccessfulPage(limitState);
      if (item.priority <= 1) {
        highPriorityPagesCrawled += 1;
      }

      if (!sitemapReleased && canonical === homepageCanonical) {
        sitemapReleased = true;
        for (const sitemapUrl of sitemapUrls) {
          const locUrls = await fetchSitemapUrls(sitemapUrl);
          for (const locUrl of locUrls) {
            const normalized = normalizeDiscoveredUrl(locUrl, baseUrl);
            if (!normalized || shouldSkipDiscoveredUrl(normalized)) {
              continue;
            }
            if (!isSameRegistrableDomain(normalized, ctx.normalizedDomain)) {
              continue;
            }
            enqueueDiscoveredLink(queue, scheduled, normalized, 0);
          }
        }
      }
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }
      console.warn(`[discover] Failed to crawl ${canonical}:`, error);
    } finally {
      await page.close();
    }
  }

  try {
    const workers = Array.from({ length: concurrency }, async () => {
      while (true) {
        await assertRunNotCanceled(ctx.runId);
        if (shouldStopDiscovery(pagesDiscovered, highPriorityPagesCrawled)) {
          return;
        }
        if (!canAttemptNavigation(limitState)) {
          return;
        }
        const item = selectNextQueueItem(queue);
        if (!item) {
          if (inFlight === 0) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }
        inFlight += 1;
        try {
          await crawlOne(item);
        } finally {
          inFlight -= 1;
        }
      }
    });

    await Promise.all(workers);
  } finally {
    await closeBrowser(browser);
  }

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "discovering",
    pagesDiscovered,
  });

  return {
    stage: "discovering",
    success: true,
    metrics: { pagesDiscovered },
  };
}
