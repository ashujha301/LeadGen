import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKER_ROOT = join(process.cwd(), "src/server/worker");
const STAGES = [
  "discover",
  "extract",
  "normalize",
  "resolve",
  "enrich",
  "calculate-confidence",
  "score-leads",
];

describe("worker job characterization", () => {
  it("uses the process-search-run queue name", () => {
    const queueSource = readFileSync(
      join(WORKER_ROOT, "../infrastructure/queue/worker-queue.ts"),
      "utf8",
    );
    const configSource = readFileSync(join(WORKER_ROOT, "config.ts"), "utf8");
    expect(configSource).toContain("process-search-run");
    expect(queueSource).toContain("QUEUE_NAME");
  });

  it("defines all pipeline stages", () => {
    for (const stage of STAGES) {
      const path = join(WORKER_ROOT, "stages", `${stage}.ts`);
      const contents = readFileSync(path, "utf8");
      expect(contents.length).toBeGreaterThan(0);
    }
  });

  it("process-run delegates to the streaming coordinator", () => {
    const jobSource = readFileSync(join(WORKER_ROOT, "jobs/process-run.ts"), "utf8");
    expect(jobSource).toContain("runStreamingPipeline");
    const coordinatorSource = readFileSync(join(WORKER_ROOT, "jobs/streaming-coordinator.ts"), "utf8");
    expect(coordinatorSource).toContain("scoreLeadsIncremental");
    expect(coordinatorSource).toContain("runEventsRepo.createRunEvent");
    expect(coordinatorSource).toContain("providerTasks");
    expect(coordinatorSource).toContain("providerResults");
  });

  it("keeps the run page subscribed to incremental lead events", () => {
    const clientSource = readFileSync(
      join(process.cwd(), "src/features/runs/run-detail-client.tsx"),
      "utf8",
    );
    const eventsRoute = readFileSync(
      join(process.cwd(), "src/app/api/v1/runs/[runId]/events/route.ts"),
      "utf8",
    );

    expect(clientSource).toContain("new EventSource");
    expect(clientSource).toContain('addEventListener("lead.created"');
    expect(eventsRoute).toContain("getRunEventsAfterId");
  });
});
