import { and, eq } from "drizzle-orm";

import type { Db } from "../client";
import {
  observations,
  sourceDocuments,
  type NewObservation,
  type NewSourceDocument,
  type Observation,
  type SourceDocument,
} from "../schema/index";

export type CreateSourceDocumentInput = Omit<
  NewSourceDocument,
  "id" | "createdAt" | "updatedAt" | "extractionStatus"
> & {
  extractionStatus?: NewSourceDocument["extractionStatus"];
};

export type SourceDocumentUpsertState = "created" | "resumed" | "already_completed";

export type SourceDocumentUpsertResult = {
  document: SourceDocument;
  state: SourceDocumentUpsertState;
};

export async function upsertSourceDocument(
  db: Db,
  input: CreateSourceDocumentInput,
): Promise<SourceDocumentUpsertResult> {
  const existing = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.runId, input.runId),
      eq(sourceDocuments.sourceType, input.sourceType),
      eq(sourceDocuments.sourceKey, input.sourceKey),
    ),
  });

  if (existing) {
    return {
      document: existing,
      state: existing.extractionStatus === "completed" ? "already_completed" : "resumed",
    };
  }

  const [inserted] = await db
    .insert(sourceDocuments)
    .values({
      ...input,
      extractionStatus: input.extractionStatus ?? "pending",
    })
    .onConflictDoNothing({
      target: [sourceDocuments.runId, sourceDocuments.sourceType, sourceDocuments.sourceKey],
    })
    .returning();

  if (inserted) {
    return { document: inserted, state: "created" };
  }

  const raced = await db.query.sourceDocuments.findFirst({
    where: and(
      eq(sourceDocuments.runId, input.runId),
      eq(sourceDocuments.sourceType, input.sourceType),
      eq(sourceDocuments.sourceKey, input.sourceKey),
    ),
  });

  if (!raced) {
    throw new Error("Failed to upsert source document");
  }

  return {
    document: raced,
    state: raced.extractionStatus === "completed" ? "already_completed" : "resumed",
  };
}

/** @deprecated Use upsertSourceDocument for idempotent pipeline writes. */
export async function createSourceDocument(
  db: Db,
  input: CreateSourceDocumentInput,
): Promise<SourceDocument> {
  const result = await upsertSourceDocument(db, input);
  return result.document;
}

export async function updateExtractionStatus(
  db: Db,
  sourceDocumentId: string,
  extractionStatus: SourceDocument["extractionStatus"],
): Promise<SourceDocument | undefined> {
  const [document] = await db
    .update(sourceDocuments)
    .set({ extractionStatus })
    .where(eq(sourceDocuments.id, sourceDocumentId))
    .returning();
  return document;
}

export async function getSourceDocumentsByRunId(db: Db, runId: string): Promise<SourceDocument[]> {
  return db.query.sourceDocuments.findMany({
    where: eq(sourceDocuments.runId, runId),
  });
}

export async function getSourceDocumentById(
  db: Db,
  sourceDocumentId: string,
): Promise<SourceDocument | undefined> {
  return db.query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.id, sourceDocumentId),
  });
}

export async function createObservation(db: Db, input: NewObservation): Promise<Observation> {
  const [observation] = await db.insert(observations).values(input).returning();
  if (!observation) {
    throw new Error("Failed to create observation");
  }
  return observation;
}

export async function createObservations(db: Db, inputs: NewObservation[]): Promise<Observation[]> {
  if (inputs.length === 0) {
    return [];
  }

  return db
    .insert(observations)
    .values(inputs)
    .onConflictDoNothing({ target: [observations.sourceDocumentId, observations.fingerprint] })
    .returning();
}

export async function getObservationsBySourceDocumentId(
  db: Db,
  sourceDocumentId: string,
): Promise<Observation[]> {
  return db.query.observations.findMany({
    where: eq(observations.sourceDocumentId, sourceDocumentId),
  });
}

export async function findSourceDocumentsByDomain(
  db: Db,
  normalizedDomain: string,
  limit = 5,
): Promise<SourceDocument[]> {
  return db.query.sourceDocuments.findMany({
    where: eq(sourceDocuments.sourceKey, `company_enrich:${normalizedDomain}`),
    limit,
  });
}

export async function updateObservationNormalizedValue(
  db: Db,
  observationId: string,
  normalizedValue: string,
): Promise<void> {
  await db.update(observations).set({ normalizedValue }).where(eq(observations.id, observationId));
}

export async function getObservationsByRunId(db: Db, runId: string): Promise<Observation[]> {
  const documents = await getSourceDocumentsByRunId(db, runId);
  if (documents.length === 0) {
    return [];
  }

  const results: Observation[] = [];
  for (const document of documents) {
    const rows = await getObservationsBySourceDocumentId(db, document.id);
    results.push(...rows);
  }

  return results;
}
