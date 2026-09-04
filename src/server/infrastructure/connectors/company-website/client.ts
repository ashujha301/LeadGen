import { USER_AGENT } from "@/shared/config";

import type { CompanyPageFetchResult, ConnectorResult } from "../types";
import { assertSafeUrl, resolveAndValidateHost, validateUrl } from "../ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export type FetchCompanyPageOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

async function validateRedirectTarget(location: string, baseUrl: URL): Promise<URL> {
  const nextUrl = new URL(location, baseUrl);
  const validated = validateUrl(nextUrl.toString());
  if (!validated.ok) {
    throw new Error(`SSRF guard: redirect ${validated.reason}`);
  }

  const resolved = await resolveAndValidateHost(validated.url);
  if (!resolved.ok) {
    throw new Error(`SSRF guard: redirect ${resolved.reason}`);
  }

  return validated.url;
}

export async function fetchCompanyPage(
  urlString: string,
  options: FetchCompanyPageOptions = {},
): Promise<ConnectorResult<CompanyPageFetchResult>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_HTML_BYTES;

  try {
    let currentUrl = await assertSafeUrl(urlString);
    let redirectCount = 0;
    let response: Response | undefined;

    while (redirectCount <= MAX_REDIRECTS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        response = await fetch(currentUrl.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": USER_AGENT,
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          return { status: "error", error: "Redirect response missing Location header" };
        }

        currentUrl = await validateRedirectTarget(location, currentUrl);
        redirectCount += 1;
        continue;
      }

      break;
    }

    if (!response) {
      return { status: "error", error: "No response received" };
    }

    if (redirectCount > MAX_REDIRECTS) {
      return { status: "error", error: "Too many redirects" };
    }

    const contentType = response.headers.get("content-type");
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > maxBytes) {
      return { status: "error", error: `Response exceeds ${maxBytes} byte limit` };
    }

    return {
      status: "success",
      data: {
        url: urlString,
        finalUrl: currentUrl.toString(),
        statusCode: response.status,
        contentType,
        html: buffer.toString("utf8"),
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    return { status: "error", error: message };
  }
}
