import { getQueue, QUEUE_NAME, stopQueue } from "@/server/infrastructure/queue/worker-queue";
import { processRun, type ProcessRunPayload } from "./jobs/process-run";
import { loadConfig } from "./config";

async function main() {
  const config = loadConfig();
  const queue = await getQueue();

  console.log(`[worker] Listening on queue "${QUEUE_NAME}" (concurrency: ${config.WORKER_CONCURRENCY})`);

  await queue.work<ProcessRunPayload>(QUEUE_NAME, async (jobs) => {
    for (const job of jobs) {
      if (!job.data?.runId) {
        throw new Error("Missing runId in job payload");
      }
      await processRun(job.data);
    }
  });

  const shutdown = async (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down...`);
    await stopQueue();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
