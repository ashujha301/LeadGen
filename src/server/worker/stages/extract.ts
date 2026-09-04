import { extractPage } from "@/server/infrastructure/ai";
import { fetchCompanyPage, mapCompanyPageToObservations } from "@/server/infrastructure/connectors";
import { getDb, runsRepo, sourcesRepo } from "@/server/infrastructure/db";

import type { StageContext, StageResult } from "../jobs/process-run";
import {
  buildSubjectKey,
  extractPageTitle,
  extractTextExcerpt,
  isLeadershipLikePage,
  mappedToNewObservations,
  persistMappedObservations,
} from "./helpers";

export async function extract(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  await runsRepo.updateRunStatus(db, ctx.runId, "extracting");

  const documents = await sourcesRepo.getSourceDocumentsByRunId(db, ctx.runId);
  let pagesExtracted = 0;
  let observationsCreated = 0;

  for (const document of documents) {
    if (document.extractionStatus === "completed") {
      continue;
    }

    await sourcesRepo.updateExtractionStatus(db, document.id, "in_progress");

    const fetched = await fetchCompanyPage(document.canonicalUrl);
    if (fetched.status !== "success") {
      await sourcesRepo.updateExtractionStatus(db, document.id, "failed");
      continue;
    }

    const page = fetched.data;
    const deterministic = mapCompanyPageToObservations(page);
    observationsCreated += await persistMappedObservations(db, document.id, deterministic);

    const pathname = new URL(page.finalUrl).pathname;
    const cleanedText = extractTextExcerpt(page.html, 12_000);

    if (isLeadershipLikePage(pathname, cleanedText) && cleanedText.length > 100) {
      const aiResult = await extractPage({
        sourceUrl: page.finalUrl,
        pageTitle: extractPageTitle(page.html) ?? undefined,
        cleanedText,
        runId: ctx.runId,
        db,
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

        for (const [index, person] of aiResult.data.people.entries()) {
          const subjectKey = buildSubjectKey(person.name, index);

          aiObservations.push({
            entityType: "person" as const,
            attribute: "name",
            rawValue: person.name,
            normalizedValue: person.name.toLowerCase(),
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
    pagesExtracted += 1;
  }

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
