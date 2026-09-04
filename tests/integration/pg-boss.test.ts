import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import PgBoss from "pg-boss";

const DATABASE_URL = process.env.DATABASE_URL;
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb("pg-boss queue", () => {
  it("creates a queue and enqueues a process-search-run job", async () => {
    const boss = new PgBoss(DATABASE_URL!);
    boss.on("error", () => {});
    await boss.start();

    const queueName = "process-search-run";
    await boss.createQueue(queueName);

    const runId = randomUUID();
    const jobId = await boss.send(queueName, { runId });

    expect(jobId).toBeTruthy();

    const job = await boss.getJobById(queueName, jobId!);
    expect(job?.data).toEqual({ runId });

    await boss.stop({ graceful: true, timeout: 5000 });
  }, 30000);
});
