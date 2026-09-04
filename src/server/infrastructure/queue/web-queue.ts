import PgBoss from "pg-boss";

import { getEnv } from "@/shared/config/server";

const QUEUE_NAME = "process-search-run";

let boss: PgBoss | null = null;

async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;

  const { DATABASE_URL } = getEnv();
  boss = new PgBoss(DATABASE_URL);

  boss.on("error", (err) => {
    console.error("[pg-boss]", err);
  });

  await boss.start();
  await boss.createQueue(QUEUE_NAME);

  return boss;
}

export async function enqueueRun(runId: string): Promise<string | null> {
  const queue = await getQueue();
  return queue.send(QUEUE_NAME, { runId }, { singletonKey: runId });
}

export async function cancelQueuedRun(runId: string): Promise<void> {
  try {
    const queue = await getQueue();
    // Best-effort: cooperative DB cancel is the source of truth. Job id may
    // differ from runId; singleton jobs are skipped once status is canceled.
    await queue.cancel(QUEUE_NAME, runId).catch(() => undefined);
  } catch {
    // Ignore queue cancel failures; worker will observe canceled status.
  }
}

export { QUEUE_NAME };
