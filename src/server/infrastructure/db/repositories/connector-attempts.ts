import { desc, eq } from "drizzle-orm";

import type { Db } from "../client";
import {
  connectorAttempts,
  type ConnectorAttempt,
  type NewConnectorAttempt,
} from "../schema/connector-attempts";

export async function createConnectorAttempt(
  db: Db,
  input: NewConnectorAttempt,
): Promise<ConnectorAttempt> {
  const [attempt] = await db.insert(connectorAttempts).values(input).returning();
  if (!attempt) {
    throw new Error("Failed to create connector attempt record");
  }
  return attempt;
}

export async function getConnectorAttemptsByRunId(
  db: Db,
  runId: string,
): Promise<ConnectorAttempt[]> {
  return db.query.connectorAttempts.findMany({
    where: eq(connectorAttempts.runId, runId),
    orderBy: [desc(connectorAttempts.createdAt)],
  });
}

export async function getConnectorAttemptById(
  db: Db,
  attemptId: string,
): Promise<ConnectorAttempt | undefined> {
  return db.query.connectorAttempts.findFirst({
    where: eq(connectorAttempts.id, attemptId),
  });
}
