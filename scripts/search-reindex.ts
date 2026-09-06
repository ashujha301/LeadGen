import { config } from "dotenv";
config({ path: ".env" });

import { and, eq, sql } from "drizzle-orm";

import {
  EMBEDDING_BATCH_SIZE,
  embedDocumentsBatch,
  hashDocumentContent,
} from "@/server/infrastructure/ai/embeddings";
import { getDb } from "@/server/infrastructure/db";
import {
  businessSignals,
  companies,
  employments,
  leadCandidates,
  naturalSearchDocuments,
  people,
  searchRuns,
} from "@/server/infrastructure/db/schema";
import { getEnv } from "@/shared/config/server";

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
    userId: argv.find((arg) => arg.startsWith("--user="))?.slice("--user=".length),
  };
}

function buildContent(row: {
  personName: string;
  title: string | null;
  companyName: string;
  domain: string | null;
  industry: string | null;
  signalLabels: string[];
}): string {
  return [
    `Person: ${row.personName}`,
    row.title ? `Title: ${row.title}` : null,
    `Company: ${row.companyName}`,
    row.domain ? `Domain: ${row.domain}` : null,
    row.industry ? `Industry: ${row.industry}` : null,
    row.signalLabels.length ? `Signals: ${row.signalLabels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();
  const env = getEnv();
  const model = env.OPENAI_EMBEDDING_MODEL;

  const leadRows = await db
    .select({
      leadId: leadCandidates.id,
      userId: searchRuns.userId,
      personId: leadCandidates.personId,
      companyId: leadCandidates.companyId,
      personName: people.name,
      companyName: companies.name,
      domain: companies.normalizedDomain,
      industry: companies.industry,
      title: employments.rawTitle,
    })
    .from(leadCandidates)
    .innerJoin(searchRuns, eq(searchRuns.id, leadCandidates.runId))
    .innerJoin(people, eq(people.id, leadCandidates.personId))
    .innerJoin(companies, eq(companies.id, leadCandidates.companyId))
    .leftJoin(
      employments,
      and(
        eq(employments.personId, people.id),
        eq(employments.companyId, companies.id),
        eq(employments.isCurrent, true),
      ),
    )
    .where(args.userId ? eq(searchRuns.userId, args.userId) : sql`true`);

  const signalRows = await db
    .select({
      companyId: businessSignals.companyId,
      label: businessSignals.signalType,
    })
    .from(businessSignals);
  const signalsByCompany = new Map<string, string[]>();
  for (const row of signalRows) {
    const list = signalsByCompany.get(row.companyId) ?? [];
    list.push(row.label);
    signalsByCompany.set(row.companyId, list);
  }

  const documents = leadRows.map((row) => {
    const content = buildContent({
      personName: row.personName,
      title: row.title,
      companyName: row.companyName,
      domain: row.domain,
      industry: row.industry,
      signalLabels: [...new Set(signalsByCompany.get(row.companyId) ?? [])],
    });
    return {
      ...row,
      content,
      contentHash: hashDocumentContent(content),
    };
  });

  console.log(`Found ${documents.length} lead documents to consider`);
  if (args.dryRun) {
    console.log("Dry run complete; no embeddings written.");
    return;
  }

  let written = 0;
  let skipped = 0;

  for (let i = 0; i < documents.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = documents.slice(i, i + EMBEDDING_BATCH_SIZE);
    const toEmbed: typeof batch = [];

    for (const doc of batch) {
      const [existing] = await db
        .select({
          id: naturalSearchDocuments.id,
          contentHash: naturalSearchDocuments.contentHash,
        })
        .from(naturalSearchDocuments)
        .where(
          and(
            eq(naturalSearchDocuments.userId, doc.userId),
            eq(naturalSearchDocuments.personId, doc.personId),
            eq(naturalSearchDocuments.companyId, doc.companyId),
          ),
        )
        .limit(1);
      if (existing?.contentHash === doc.contentHash) {
        skipped += 1;
        continue;
      }
      toEmbed.push(doc);
    }

    if (toEmbed.length === 0) continue;

    const embedded = await embedDocumentsBatch({
      texts: toEmbed.map((doc) => doc.content),
      userId: args.userId,
    });
    if (embedded.status !== "success" || !embedded.embeddings) {
      throw new Error(embedded.status === "failed" ? embedded.error : "Embedding failed");
    }

    for (let index = 0; index < toEmbed.length; index += 1) {
      const doc = toEmbed[index];
      const embedding = embedded.embeddings[index];
      if (!embedding) continue;

      await db
        .insert(naturalSearchDocuments)
        .values({
          userId: doc.userId,
          personId: doc.personId,
          companyId: doc.companyId,
          leadId: doc.leadId,
          content: doc.content,
          contentHash: doc.contentHash,
          model,
          dimensions: embedding.length,
          embedding,
        })
        .onConflictDoUpdate({
          target: [
            naturalSearchDocuments.userId,
            naturalSearchDocuments.personId,
            naturalSearchDocuments.companyId,
          ],
          set: {
            leadId: doc.leadId,
            content: doc.content,
            contentHash: doc.contentHash,
            model,
            dimensions: embedding.length,
            embedding,
            updatedAt: new Date(),
          },
        });
      written += 1;
    }
  }

  console.log(`Reindex complete. written=${written} skipped=${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
