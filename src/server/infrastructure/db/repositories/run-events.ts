import { and, eq, gt } from "drizzle-orm";

import type { Db } from "../client";
import { runEvents, type NewRunEvent, type RunEvent } from "../schema/run-events";

export async function createRunEvent(db: Db, input: NewRunEvent): Promise<RunEvent> {
  const [event] = await db.insert(runEvents).values(input).returning();
  if (!event) {
    throw new Error("Failed to create run event");
  }

  return event;
}

export async function getRunEventsAfterSequence(
  db: Db,
  runId: string,
  afterSequence?: number,
): Promise<RunEvent[]> {
  if (afterSequence != null) {
    return db.query.runEvents.findMany({
      where: and(eq(runEvents.runId, runId), gt(runEvents.sequence, afterSequence)),
      orderBy: [runEvents.sequence],
    });
  }

  return db.query.runEvents.findMany({
    where: eq(runEvents.runId, runId),
    orderBy: [runEvents.sequence],
  });
}

export async function getRunEventsAfterId(
  db: Db,
  runId: string,
  afterEventId?: string,
): Promise<RunEvent[]> {
  if (afterEventId) {
    const cursor = await db.query.runEvents.findFirst({
      where: and(eq(runEvents.runId, runId), eq(runEvents.id, afterEventId)),
      columns: { sequence: true },
    });

    if (cursor?.sequence != null) {
      return getRunEventsAfterSequence(db, runId, cursor.sequence);
    }
  }

  return getRunEventsAfterSequence(db, runId);
}

export async function listRecentRunEvents(
  db: Db,
  runId: string,
  limit = 100,
): Promise<RunEvent[]> {
  const events = await db.query.runEvents.findMany({
    where: eq(runEvents.runId, runId),
    orderBy: (table, { desc }) => [desc(table.sequence)],
    limit,
  });
  return events.reverse();
}
