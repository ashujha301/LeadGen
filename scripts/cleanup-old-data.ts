#!/usr/bin/env tsx
import { getEnv } from "@/shared/config/server";
import { getDb, sourceDocuments } from "@/server/infrastructure/db";
import { lt } from "drizzle-orm";

async function cleanupOldData() {
  const env = getEnv();
  const db = getDb();
  const cutoff = new Date(Date.now() - env.RAW_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(sourceDocuments)
    .where(lt(sourceDocuments.createdAt, cutoff))
    .returning({ id: sourceDocuments.id });

  console.log(
    `Removed ${deleted.length} source documents older than ${env.RAW_DATA_RETENTION_DAYS} days (before ${cutoff.toISOString()})`,
  );
}

cleanupOldData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
