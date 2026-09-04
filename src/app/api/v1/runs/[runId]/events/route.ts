export const runtime = "nodejs";

import { jsonError } from "@/shared/utils/api-response";
import { withRequestGuard } from "@/server/security/request-guard";
import { checkReadApiLimit } from "@/server/security/rate-limit";
import { getDb, runEventsRepo, runsRepo } from "@/server/infrastructure/db";

const HEARTBEAT_MS = 15_000;
const POLL_MS = 1_000;
const TERMINAL_EVENTS = new Set(["run.completed", "run.failed"]);

export const GET = withRequestGuard(async (request, requestId, clientKey) => {
  const limit = checkReadApiLimit(clientKey);
  if (!limit.allowed) {
    return jsonError("RATE_LIMITED", "Too many requests", requestId, 429);
  }

  const url = new URL(request.url);
  const runId = url.pathname.split("/").slice(-2)[0]!;
  const lastEventId = request.headers.get("Last-Event-ID") ?? undefined;

  const db = getDb();
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const closeStream = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = undefined;
        }
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = undefined;
        }
        try {
          controller.close();
        } catch {
          // Ignore close races.
        }
      };

      const send = (event: string, id: string, data: unknown) => {
        if (closed) {
          return;
        }
        controller.enqueue(
          encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      heartbeatTimer = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        }
      }, HEARTBEAT_MS);

      let lastSequence: number | undefined;
      const backlog = await runEventsRepo.getRunEventsAfterId(db, runId, lastEventId);
      for (const event of backlog) {
        send(event.eventType, String(event.sequence), event.payload);
        lastSequence = event.sequence;
        if (TERMINAL_EVENTS.has(event.eventType)) {
          closeStream();
          return;
        }
      }

      const poll = async () => {
        if (closed) {
          return;
        }

        try {
          const run = await runsRepo.getRunById(db, runId);
          const events = await runEventsRepo.getRunEventsAfterSequence(db, runId, lastSequence);

          for (const event of events) {
            send(event.eventType, String(event.sequence), event.payload);
            lastSequence = event.sequence;
            if (TERMINAL_EVENTS.has(event.eventType)) {
              closeStream();
              return;
            }
          }

          if (run && (run.status === "completed" || run.status === "failed") && events.length === 0) {
            closeStream();
            return;
          }
        } catch {
          closeStream();
          return;
        }

        pollTimer = setTimeout(() => {
          void poll();
        }, POLL_MS);
      };

      pollTimer = setTimeout(() => {
        void poll();
      }, POLL_MS);
    },
    cancel() {
      closed = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
