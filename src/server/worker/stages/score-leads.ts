import { explainLead } from "@/server/infrastructure/ai";
import { matchTitleAgainstRoleCriteria } from "@/server/domain/roles/matching";
import { hasEmployeeRangeBounds } from "@/server/domain/employee-range";
import { getDb, entitiesRepo, leadsRepo, runsRepo, sourcesRepo } from "@/server/infrastructure/db";
import { scoreLead } from "@/server/domain/scoring";
import { SCORE_COMPONENT_KEYS } from "@/server/domain/scoring/score-config";

import type { StageContext, StageResult } from "../jobs/process-run";
import { toNumber } from "./helpers";

export async function scoreLeads(ctx: StageContext): Promise<StageResult> {
  const db = getDb();
  await runsRepo.updateRunStatus(db, ctx.runId, "scoring");

  const run = await runsRepo.getRunById(db, ctx.runId);
  const company =
    (ctx.companyId ? await entitiesRepo.getCompanyById(db, ctx.companyId) : undefined) ??
    (await entitiesRepo.findCompanyByDomain(db, ctx.normalizedDomain));

  if (!company) {
    await runsRepo.updateRunProgress(db, ctx.runId, { stage: "scoring", leadsScored: 0 });
    return {
      stage: "scoring",
      success: true,
      metrics: { leadsScored: 0 },
    };
  }

  const employments = await entitiesRepo.getEmploymentsByCompanyId(db, company.id);
  const signals = await entitiesRepo.getBusinessSignalsByCompanyId(db, company.id);
  const documents = await sourcesRepo.getSourceDocumentsByRunId(db, ctx.runId);
  let leadsScored = 0;

  for (const employment of employments) {
    const person = await entitiesRepo.getPersonById(db, employment.personId);
    if (!person) {
      continue;
    }

    const contacts = await entitiesRepo.getContactPointsByPersonId(db, person.id);
    const evidence = documents
      .filter((doc) => doc.excerpt)
      .slice(0, 3)
      .map((doc) => ({
        sourceUrl: doc.canonicalUrl,
        confidence: toNumber(person.confidence),
        freshness: toNumber(person.freshness),
      }));

    const roleMatch = matchTitleAgainstRoleCriteria(employment.rawTitle, run?.roleCriteria);

    const score = scoreLead({
      icp: {
        targetIndustries: run?.icp?.industries,
        targetLocations: run?.icp?.locations,
        employeeRange: hasEmployeeRangeBounds(run?.icp?.employeeRange)
          ? {
              min: run?.icp?.employeeRange?.min,
              max: run?.icp?.employeeRange?.max,
            }
          : undefined,
        companyIndustry: company.industry,
        companyLocation: company.location,
        employeeCount: company.employeeCount,
      },
      role: {
        title: employment.rawTitle,
        roleCriteria: run?.roleCriteria,
      },
      authority: {
        title: employment.rawTitle,
        normalizedTitle: employment.normalizedTitle,
      },
      signals: {
        signals: signals.map((signal) => ({
          type: signal.signalType,
          value: signal.value,
          confidence: toNumber(signal.confidence),
          observedAt: signal.observedAt,
        })),
      },
      contactability: {
        contacts: contacts.map((contact) => ({
          type: contact.type,
          value: contact.rawValue,
          verificationStatus: contact.verificationStatus,
          confidence: toNumber(contact.confidence),
        })),
      },
      evidence: { evidence },
    });

    const explanationResult = await explainLead({
      personName: person.name,
      companyName: company.name,
      totalScore: score.total,
      scoreComponents: score.components,
      evidence: documents.slice(0, 2).map((doc) => ({
        sourceUrl: doc.canonicalUrl,
        excerpt: doc.excerpt ?? "",
        confidence: toNumber(person.confidence),
      })),
      runId: ctx.runId,
      db,
    });

    const contactability = score.components.find(
      (component) => component.key === SCORE_COMPONENT_KEYS.contactability,
    );
    const companyIcpFit = score.components.find(
      (component) => component.key === SCORE_COMPONENT_KEYS.companyIcpFit,
    );
    const targetRoleFit = score.components.find(
      (component) => component.key === SCORE_COMPONENT_KEYS.targetRoleFit,
    );
    const icpFitTotal =
      toNumber(companyIcpFit?.contribution) + toNumber(targetRoleFit?.contribution);

    const lead = await leadsRepo.createLeadCandidate(db, {
      runId: ctx.runId,
      personId: person.id,
      companyId: company.id,
      icpFitScore: String(icpFitTotal),
      decisionAuthorityScore: String(
        score.components.find((component) => component.key === SCORE_COMPONENT_KEYS.decisionAuthority)
          ?.contribution ?? 0,
      ),
      businessSignalsScore: String(
        score.components.find((component) => component.key === SCORE_COMPONENT_KEYS.businessSignals)
          ?.contribution ?? 0,
      ),
      contactabilityScore: String(contactability?.contribution ?? 0),
      evidenceQualityScore: String(
        score.components.find((component) => component.key === SCORE_COMPONENT_KEYS.evidenceQuality)
          ?.contribution ?? 0,
      ),
      finalScore: String(score.total),
      contactability: String(contactability ? contactability.rawValue : 0),
      confidence: person.confidence,
      explanation: explanationResult.explanation,
      roleMatch: roleMatch.roleMatch,
      roleMatchReasons: roleMatch.roleMatchReasons,
    });

    await leadsRepo.markOtherLeadsStaleForPersonCompany(db, {
      personId: person.id,
      companyId: company.id,
      keepLeadId: lead.id,
    });

    await leadsRepo.createScoreComponents(
      db,
      score.components.map((component) => ({
        leadCandidateId: lead.id,
        componentKey: component.key,
        weight: String(component.weight),
        rawValue: String(component.rawValue),
        contribution: String(component.contribution),
        reasonCode: component.reasonCode,
        label: component.label,
      })),
    );

    leadsScored += 1;
  }

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "scoring",
    leadsScored,
  });

  return {
    stage: "scoring",
    success: true,
    metrics: { leadsScored },
  };
}
