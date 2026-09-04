import { getDb, runsRepo } from "@/server/infrastructure/db";

export class RunCanceledError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} was canceled`);
    this.name = "RunCanceledError";
  }
}

type AbortEntry = {
  controller: AbortController;
  pollTimer: ReturnType<typeof setInterval> | null;
};

const abortEntries = new Map<string, AbortEntry>();

const CANCEL_POLL_MS = 750;

export function registerRunAbort(runId: string): AbortSignal {
  const existing = abortEntries.get(runId);
  if (existing) {
    return existing.controller.signal;
  }

  const controller = new AbortController();
  const entry: AbortEntry = { controller, pollTimer: null };
  abortEntries.set(runId, entry);

  // Worker and API are separate processes; poll DB so in-flight Playwright /
  // OpenAI / Crustdata AbortSignals abort when the user cancels.
  entry.pollTimer = setInterval(() => {
    void (async () => {
      try {
        const run = await runsRepo.getRunById(getDb(), runId);
        if (run?.status === "canceled") {
          abortRunProcessing(runId);
        }
      } catch {
        // Ignore transient poll failures; assertRunNotCanceled remains the backstop.
      }
    })();
  }, CANCEL_POLL_MS);
  entry.pollTimer.unref?.();

  return controller.signal;
}

export function getRunAbortSignal(runId: string): AbortSignal | undefined {
  return abortEntries.get(runId)?.controller.signal;
}

export function abortRunProcessing(runId: string): void {
  const entry = abortEntries.get(runId);
  if (!entry) {
    return;
  }
  if (entry.pollTimer) {
    clearInterval(entry.pollTimer);
    entry.pollTimer = null;
  }
  if (!entry.controller.signal.aborted) {
    entry.controller.abort();
  }
  abortEntries.delete(runId);
}

export function clearRunAbort(runId: string): void {
  const entry = abortEntries.get(runId);
  if (!entry) {
    return;
  }
  if (entry.pollTimer) {
    clearInterval(entry.pollTimer);
  }
  abortEntries.delete(runId);
}

export async function assertRunNotCanceled(runId: string): Promise<void> {
  const signal = getRunAbortSignal(runId);
  if (signal?.aborted) {
    throw new RunCanceledError(runId);
  }

  const db = getDb();
  const run = await runsRepo.getRunById(db, runId);
  if (run?.status === "canceled") {
    abortRunProcessing(runId);
    throw new RunCanceledError(runId);
  }
}
