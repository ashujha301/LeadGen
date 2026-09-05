import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { getQueue, QUEUE_NAME, stopQueue } from "@/server/infrastructure/queue/worker-queue";
import { processRun, type ProcessRunPayload } from "./jobs/process-run";
import { loadConfig } from "./config";

const HEARTBEAT_PATH = process.env.WORKER_HEARTBEAT_PATH ?? "/tmp/leadgen-worker-heartbeat";
const HEARTBEAT_INTERVAL_MS = 10_000;

function writeHeartbeat(): void {
  mkdirSync(dirname(HEARTBEAT_PATH), { recursive: true });
  writeFileSync(HEARTBEAT_PATH, `${Date.now()}\n`, "utf8");
}

async function main() {
  const config = loadConfig();
  const queue = await getQueue();

  writeHeartbeat();
  const heartbeatTimer = setInterval(() => {
    try {
      writeHeartbeat();
    } catch (err) {
      console.error("[worker] Failed to write heartbeat:", err);
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log(
    `[worker] Listening on queue "${QUEUE_NAME}" (concurrency: ${config.WORKER_CONCURRENCY})`,
  );

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
    clearInterval(heartbeatTimer);
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
