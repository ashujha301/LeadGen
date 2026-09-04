import { and, eq } from "drizzle-orm";

import { matchRoleWithTier } from "@/server/domain/roles/tier-matching";
import { scoreLead } from "@/server/domain/scoring";
import { SCORE_COMPONENT_KEYS } from "@/server/domain/scoring/score-config";
import {
  getDb,
  entitiesRepo,
  leadCandidates,
  leadsRepo,
  personExperienceMetrics,
  runEventsRepo,
  runsRepo,
  sourcesRepo,
} from "@/server/infrastructure/db";
import { personExternalProfiles } from "@/server/infrastructure/db/schema/person-external-profiles";
import { buildLeadSummary } from "@/server/application/mappers/lead-summary";

import type { StageContext } from "../jobs/process-run";
import { toNumber } from "./helpers";

type ScoreLeadsIncrementalOptions = {
  scoreVersion?: number;
  emitEvents?: boolean;
  updateExisting?: boolean;
};

export async function scoreLeadsIncremental(
  ctx: StageContext,
  options: ScoreLeadsIncrementalOptions = {},
): Promise<{ leadsScored: number }> {
  const db = getDb();
  const scoreVersion = options.scoreVersion ?? 2;
  const emitEvents = options.emitEvents ?? false;
  const updateExisting = options.updateExisting ?? false;

  await runsRepo.updateRunStatus(db, ctx.runId, "scoring");

  const run = await runsRepo.getRunById(db, ctx.runId);
  const company =
    (ctx.companyId ? await entitiesRepo.getCompanyById(db, ctx.companyId) : undefined) ??
    (await entitiesRepo.findCompanyByDomain(db, ctx.normalizedDomain));

  if (!company) {
    return { leadsScored: 0 };
  }

  ctx.companyId = company.id;

  const employments = await entitiesRepo.getEmploymentsByCompanyId(db, company.id);
  const targetPersonIds = ctx.resolvedPersonIds?.length
    ? new Set(ctx.resolvedPersonIds)
    : null;
  const signals = await entitiesRepo.getBusinessSignalsByCompanyId(db, company.id);
  const documents = await sourcesRepo.getSourceDocumentsByRunId(db, ctx.runId);
  let leadsScored = 0;

  const tierResults = employments.map((employment) =>
    matchRoleWithTier(employment.rawTitle, run?.roleCriteria),
  );
  const hasExactOrSynonymPeer = tierResults.some(
    (result) => result.roleMatchTier === "exact" || result.roleMatchTier === "synonym",
  );

  for (const [index, employment] of employments.entries()) {
    if (targetPersonIds && !targetPersonIds.has(employment.personId)) {
      continue;
    }

    const person = await entitiesRepo.getPersonById(db, employment.personId);
    if (!person) {
      continue;
    }

    const [existingLead] = await db
      .select()
      .from(leadCandidates)
      .where(
        and(
          eq(leadCandidates.runId, ctx.runId),
          eq(leadCandidates.personId, person.id),
          eq(leadCandidates.companyId, company.id),
        ),
      )
      .limit(1);

    if (existingLead && !updateExisting) {
      continue;
    }

    const contacts = await entitiesRepo.getContactPointsByPersonId(db, person.id);
    const linkedin = contacts.find((contact) => contact.type === "linkedin");
    const evidence = documents
      .filter((doc) => doc.excerpt)
      .slice(0, 3)
      .map((doc) => ({
        sourceUrl: doc.canonicalUrl,
        confidence: toNumber(person.confidence),
        freshness: toNumber(person.freshness),
      }));

    const roleMatch = matchRoleWithTier(employment.rawTitle, run?.roleCriteria, {
      hasExactOrSynonymPeer,
    });

    const [experienceMetrics] = await db
      .select()
      .from(personExperienceMetrics)
      .where(eq(personExperienceMetrics.personId, person.id))
      .limit(1);

    const score = scoreLead({
      scoreVersion,
      icp: {
        targetIndustries: run?.icp?.industries,
        targetLocations: run?.icp?.locations,
        employeeRange:
          run?.icp?.employeeRange?.min != null && run?.icp?.employeeRange?.max != null
            ? {
                min: run.icp.employeeRange.min,
                max: run.icp.employeeRange.max,
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
      experience: {
        totalExperienceYears: experienceMetrics?.calculatedTotalMonths
          ? experienceMetrics.calculatedTotalMonths / 12
          : experienceMetrics?.providerExperienceYears
            ? Number(experienceMetrics.providerExperienceYears)
            : null,
        leadershipExperienceYears: experienceMetrics?.leadershipExperienceMonths
          ? experienceMetrics.leadershipExperienceMonths / 12
          : null,
        experienceConfidence: toNumber(experienceMetrics?.experienceConfidence ?? "0"),
      },
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
    const experienceComponent = score.components.find(
      (component) => component.key === SCORE_COMPONENT_KEYS.experience,
    );
    const icpFitTotal =
      toNumber(companyIcpFit?.contribution) + toNumber(targetRoleFit?.contribution);

    const explanation = score.components
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((component) => component.label)
      .join("; ");

    const enrichmentStatus = linkedin
      ? existingLead?.enrichmentStatus === "matched"
        ? "matched"
        : "pending"
      : "not_found";

    const leadInput = {
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
      experienceScore: String(experienceComponent?.contribution ?? 0),
      finalScore: String(score.total),
      contactability: String(contactability ? contactability.rawValue : 0),
      confidence: person.confidence,
      explanation,
      roleMatch: roleMatch.roleMatch,
      roleMatchReasons: roleMatch.roleMatchReasons,
      scoreVersion,
      roleMatchTier: roleMatch.roleMatchTier,
      roleSimilarity: String(roleMatch.roleSimilarity),
      roleMatchFinal: roleMatch.roleMatchFinal,
      enrichmentStatus: enrichmentStatus as "pending" | "matched" | "not_found" | "redacted" | "failed",
    };

    let lead = existingLead;

    if (lead && updateExisting) {
      lead = await leadsRepo.updateLeadCandidate(db, lead.id, leadInput);
      if (lead) {
        await leadsRepo.deleteScoreComponentsByLeadId(db, lead.id);
      }
    } else if (!lead) {
      lead = await leadsRepo.createLeadCandidate(db, {
        runId: ctx.runId,
        personId: person.id,
        companyId: company.id,
        ...leadInput,
      });
    }

    if (!lead) {
      continue;
    }

    await leadsRepo.createScoreComponents(
      db,
      score.components.map((component) => ({
        leadCandidateId: lead!.id,
        componentKey: component.key,
        weight: String(component.weight),
        rawValue: String(component.rawValue),
        contribution: String(component.contribution),
        reasonCode: component.reasonCode,
        label: component.label,
      })),
    );

    if (emitEvents) {
      const externalProfile = await db.query.personExternalProfiles.findFirst({
        where: eq(personExternalProfiles.personId, person.id),
      });

      const summary = buildLeadSummary({
        lead,
        person,
        company,
        employment,
        contacts,
        keyReason: score.keyReason,
        experienceMetrics: experienceMetrics ?? null,
        externalProfile: externalProfile ?? null,
      });

      await runEventsRepo.createRunEvent(db, {
        runId: ctx.runId,
        eventType: existingLead ? "lead.updated" : "lead.created",
        payload: summary,
      });
    }

    leadsScored += 1;
    void index;
  }

  await runsRepo.updateRunProgress(db, ctx.runId, {
    stage: "scoring",
    leadsScored,
  });

  return { leadsScored };
}
