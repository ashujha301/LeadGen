import "dotenv/config";
import { and, eq } from "drizzle-orm";

import { pickCanonicalLeadPerPerson } from "@/server/domain/leads/hvl-person-dedupe";
import { getDb } from "@/server/infrastructure/db";
import { leadCandidates } from "@/server/infrastructure/db/schema";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  const active = await db
    .select({
      id: leadCandidates.id,
      personId: leadCandidates.personId,
      companyId: leadCandidates.companyId,
      finalScore: leadCandidates.finalScore,
      updatedAt: leadCandidates.updatedAt,
    })
    .from(leadCandidates)
    .where(eq(leadCandidates.isStale, false));

  const byPair = new Map<string, typeof active>();
  for (const row of active) {
    const key = `${row.personId}::${row.companyId}`;
    const list = byPair.get(key) ?? [];
    list.push(row);
    byPair.set(key, list);
  }

  const groups = [...byPair.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`Duplicate active person+company groups: ${groups.length}`);

  let staleCount = 0;
  for (const [key, rows] of groups) {
    const [personId, companyId] = key.split("::") as [string, string];
    const keep = pickCanonicalLeadPerPerson(rows)[0]!;
    const toStale = rows.filter((r) => r.id !== keep.id);
    console.log(
      `- person=${personId} company=${companyId} keep=${keep.id} score=${keep.finalScore} stale=${toStale.map((r) => r.id).join(",")}`,
    );
    if (!apply) continue;
    for (const row of toStale) {
      await db
        .update(leadCandidates)
        .set({ isStale: true, updatedAt: new Date() })
        .where(and(eq(leadCandidates.id, row.id), eq(leadCandidates.isStale, false)));
      staleCount += 1;
    }
  }

  if (!apply) {
    console.log("Report-only. Re-run with --apply to mutate.");
    return;
  }
  console.log(`Marked ${staleCount} duplicate leads stale.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
