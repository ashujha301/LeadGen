import { chromium, type Browser, type BrowserContext } from "playwright";
import { USER_AGENT } from "@/shared/config";
import { loadConfig } from "@/server/worker/config";
import { setupResourceBlocker } from "./resource-blocker";

export async function launchBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  const config = loadConfig();

  const browser = await chromium.launch({
    headless: config.PLAYWRIGHT_HEADLESS,
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: false,
  });

  await setupResourceBlocker(context);

  return { browser, context };
}

export async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
}
