import PgBoss from "pg-boss";
import { loadConfig, QUEUE_NAME } from "@/server/worker/config";

let boss: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;

  const config = loadConfig();
  boss = new PgBoss(config.DATABASE_URL);

  boss.on("error", (err) => {
    console.error("[pg-boss]", err);
  });

  await boss.start();
  await boss.createQueue(QUEUE_NAME);

  return boss;
}

export async function enqueueRun(runId: string): Promise<string | null> {
  const queue = await getQueue();
  return queue.send(
    QUEUE_NAME,
    { runId },
    {
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 60 * 60,
    },
  );
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10_000 });
    boss = null;
  }
}

export { QUEUE_NAME };
