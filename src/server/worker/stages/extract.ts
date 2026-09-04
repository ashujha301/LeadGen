import { extractPage } from "@/server/infrastructure/ai";
import { fetchCompanyPage, mapCompanyPageToObservations } from "@/server/infrastructure/connectors";
import { getDb, runsRepo, sourcesRepo } from "@/server/infrastructure/db";
import { getEnv } from "@/shared/config/server";
import { validatePersonMention } from "@/server/domain/entity-resolution/mention-validation";

import type { StageContext, StageResult } from "../jobs/process-run";
import {
  buildSubjectKey,
  extractPageTitle,
  extractTextExcerpt,
  isLeadershipPath,
  mappedToNewObservations,
  persistMappedObservations,
} from "./helpers";

import { assertRunNotCanceled, getRunAbortSignal } from "@/server/worker/run-abort";

const AI_TEXT_MAX_CHARS = 6_000;

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]!);
    }
  });

  await Promise.all(runners);
}

async function extractDocument(
  ctx: StageContext,
  document: Awaited<ReturnType<typeof sourcesRepo.getSourceDocumentsByRunId>>[number],
): Promise<{ pagesExtracted: number; observationsCreated: number }> {
  const db = getDb();
  let observationsCreated = 0;

  if (document.extractionStatus === "completed") {
    return { pagesExtracted: 0, observationsCreated: 0 };
  }

  await sourcesRepo.updateExtractionStatus(db, document.id, "in_progress");

  let html: string;
  let finalUrl: string;

  if (document.pageHtml) {
    html = document.pageHtml;
    finalUrl = document.canonicalUrl;
  } else {
    const fetched = await fetchCompanyPage(document.canonicalUrl);
    if (fetched.status !== "success") {
      await sourcesRepo.updateExtractionStatus(db, document.id, "failed");
      return { pagesExtracted: 0, observationsCreated: 0 };
    }
    html = fetched.data.html;
    finalUrl = fetched.data.finalUrl;
  }

  const page = {
    url: finalUrl,
    finalUrl,
    statusCode: 200,
    contentType: "text/html",
    html,
    fetchedAt: new Date().toISOString(),
  };
  const deterministic = mapCompanyPageToObservations(page);
  observationsCreated += await persistMappedObservations(db, document.id, deterministic);

  const pathname = new URL(finalUrl).pathname;
  const cleanedText = extractTextExcerpt(html, AI_TEXT_MAX_CHARS);

  if (isLeadershipPath(pathname) && cleanedText.length > 100) {
    const aiResult = await extractPage({
      sourceUrl: finalUrl,
      pageTitle: extractPageTitle(html) ?? undefined,
      cleanedText,
      runId: ctx.runId,
      db,
      signal: getRunAbortSignal(ctx.runId),
    });

    if (aiResult.status === "success") {
      const aiObservations = [];

      for (const fact of aiResult.data.companyFacts) {
        aiObservations.push({
          entityType: "company" as const,
          attribute: fact.attribute,
          rawValue: fact.value,
          normalizedValue: fact.value.toLowerCase(),
          confidence: fact.confidence,
        });
      }

      let personIndex = 0;
      for (const person of aiResult.data.people) {
        const mention = validatePersonMention(person.name);
        if (!mention.valid) {
          continue;
        }

        const subjectKey = buildSubjectKey(mention.normalizedName, personIndex);
        personIndex += 1;

        aiObservations.push({
          entityType: "person" as const,
          attribute: "name",
          rawValue: mention.normalizedName,
          normalizedValue: mention.normalizedName.toLowerCase(),
          confidence: person.confidence,
          subjectKey,
        });

        if (person.title) {
          aiObservations.push({
            entityType: "person" as const,
            attribute: "title",
            rawValue: person.title,
            confidence: person.confidence,
            subjectKey,
          });
        }

        if (person.email) {
          aiObservations.push({
            entityType: "contact" as const,
            attribute: "email",
            rawValue: person.email,
            normalizedValue: person.email.toLowerCase(),
            confidence: person.confidence,
            subjectKey,
          });
        }

        if (person.phone) {
          aiObservations.push({
            entityType: "contact" as const,
            attribute: "phone",
            rawValue: person.phone,
            confidence: person.confidence,
            subjectKey,
          });
        }

        if (person.profileUrl) {
          aiObservations.push({
            entityType: "contact" as const,
            attribute: "profile_url",
            rawValue: person.profileUrl,
            confidence: person.confidence,
            subjectKey,
          });
        }
      }

      for (const signal of aiResult.data.businessSignals) {
        aiObservations.push({
          entityType: "signal" as const,
          attribute: signal.type,
          rawValue: signal.value,
          confidence: signal.confidence,
        });
      }

      const rows = mappedToNewObservations(document.id, aiObservations);
      if (rows.length > 0) {
        await sourcesRepo.createObservations(db, rows);
        observationsCreated += rows.length;
      }
    }
  }

  await sourcesRepo.updateExtractionStatus(db, document.id, "completed");
  return { pagesExtracted: 1, observationsCreated };
}

export async function extract(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  await runsRepo.updateRunStatus(db, ctx.runId, "extracting");

  const documents = await sourcesRepo.getSourceDocumentsByRunId(db, ctx.runId);
  const concurrency = getEnv().AI_EXTRACTION_CONCURRENCY;
  let pagesExtracted = 0;
  let observationsCreated = 0;

  await mapWithConcurrency(documents, concurrency, async (document) => {
    await assertRunNotCanceled(ctx.runId);
    const result = await extractDocument(ctx, document);
    pagesExtracted += result.pagesExtracted;
    observationsCreated += result.observationsCreated;
  });

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "extracting",
    pagesExtracted,
  });

  return {
    stage: "extracting",
    success: true,
    metrics: { pagesExtracted, observationsCreated },
  };
}
