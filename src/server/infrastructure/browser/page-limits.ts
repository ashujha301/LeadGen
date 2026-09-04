import { getCrawlLimits } from "@/server/worker/config";

export type PageLimitState = {
  successfulPages: number;
  attempts: number;
  startedAt: number;
};

export function createPageLimitState(): PageLimitState {
  return { successfulPages: 0, attempts: 0, startedAt: Date.now() };
}

export function canAttemptNavigation(state: PageLimitState): boolean {
  const limits = getCrawlLimits();
  if (state.attempts >= limits.maxAttempts) {
    return false;
  }
  if (Date.now() - state.startedAt >= limits.totalTimeoutMs) {
    return false;
  }
  return true;
}

export function canRecordSuccessfulPage(state: PageLimitState): boolean {
  const limits = getCrawlLimits();
  return state.successfulPages < limits.maxSuccessfulPages;
}

export function recordAttempt(state: PageLimitState): void {
  state.attempts += 1;
}

export function recordSuccessfulPage(state: PageLimitState): void {
  state.successfulPages += 1;
}

export function isWithinDepth(currentDepth: number): boolean {
  return currentDepth <= getCrawlLimits().maxDepth;
}

/** @deprecated Use canAttemptNavigation instead. */
export function canVisitPage(state: PageLimitState): boolean {
  return canAttemptNavigation(state) && canRecordSuccessfulPage(state);
}

/** @deprecated Use recordAttempt and recordSuccessfulPage instead. */
export function recordPageVisit(state: PageLimitState): void {
  recordAttempt(state);
  recordSuccessfulPage(state);
}
