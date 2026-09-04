import type { BrowserContext, Route } from "playwright";

const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "stylesheet"]);

const BLOCKED_URL_PATTERNS = [
  /doubleclick\.net/i,
  /googlesyndication\.com/i,
  /google-analytics\.com/i,
  /facebook\.net/i,
];

export async function setupResourceBlocker(context: BrowserContext): Promise<void> {
  await context.route("**/*", (route: Route) => {
    const request = route.request();
    const resourceType = request.resourceType();
    const url = request.url();

    if (BLOCKED_RESOURCE_TYPES.has(resourceType)) {
      return route.abort();
    }

    if (BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(url))) {
      return route.abort();
    }

    return route.continue();
  });
}
