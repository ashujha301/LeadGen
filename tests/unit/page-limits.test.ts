import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  canAttemptNavigation,
  canRecordSuccessfulPage,
  createPageLimitState,
  recordAttempt,
  recordSuccessfulPage,
} from "@/server/infrastructure/browser/page-limits";
import { resetEnvCache } from "@/shared/config/env";

describe("page limit state", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  });

  afterEach(() => {
    resetEnvCache();
    delete process.env.CRAWL_MAX_SUCCESSFUL_PAGES;
    delete process.env.CRAWL_MAX_ATTEMPTS;
    delete process.env.CRAWL_TIMEOUT_MS;
  });

  it("tracks attempts separately from successful pages", () => {
    const state = createPageLimitState();

    recordAttempt(state);
    expect(state.attempts).toBe(1);
    expect(state.successfulPages).toBe(0);
    expect(canRecordSuccessfulPage(state)).toBe(true);
  });

  it("does not consume successful-page capacity for failed attempts", () => {
    process.env.CRAWL_MAX_SUCCESSFUL_PAGES = "10";
    process.env.CRAWL_MAX_ATTEMPTS = "25";
    resetEnvCache();

    const state = createPageLimitState();

    for (let index = 0; index < 15; index += 1) {
      recordAttempt(state);
    }

    expect(state.attempts).toBe(15);
    expect(state.successfulPages).toBe(0);
    expect(canRecordSuccessfulPage(state)).toBe(true);
    expect(canAttemptNavigation(state)).toBe(true);
  });

  it("stops successful pages at the configured limit while attempts remain", () => {
    process.env.CRAWL_MAX_SUCCESSFUL_PAGES = "10";
    process.env.CRAWL_MAX_ATTEMPTS = "25";
    resetEnvCache();

    const state = createPageLimitState();

    for (let index = 0; index < 10; index += 1) {
      recordAttempt(state);
      recordSuccessfulPage(state);
    }

    expect(canRecordSuccessfulPage(state)).toBe(false);
    expect(canAttemptNavigation(state)).toBe(true);

    recordAttempt(state);
    expect(state.attempts).toBe(11);
    expect(state.successfulPages).toBe(10);
  });

  it("stops navigation when attempt limit is reached even with successful capacity left", () => {
    process.env.CRAWL_MAX_SUCCESSFUL_PAGES = "10";
    process.env.CRAWL_MAX_ATTEMPTS = "25";
    resetEnvCache();

    const state = createPageLimitState();

    for (let index = 0; index < 25; index += 1) {
      recordAttempt(state);
    }

    expect(canAttemptNavigation(state)).toBe(false);
    expect(canRecordSuccessfulPage(state)).toBe(true);
  });
});
