import { and, eq, inArray } from "drizzle-orm";

import { matchRoleWithTier } from "@/server/domain/roles/tier-matching";
import { scoreLead } from "@/server/domain/scoring";
import { SCORE_COMPONENT_KEYS } from "@/server/domain/scoring/score-config";
import { shouldExcludeByEmployeeRange, hasEmployeeRangeBounds } from "@/server/domain/employee-range";
import {
  contactPoints,
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
  personIds?: string[];
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

  if (
    shouldExcludeByEmployeeRange(company.employeeCount, run?.icp?.employeeRange)
  ) {
    const range = run?.icp?.employeeRange;
    const message = `Company headcount ${company.employeeCount} is outside employee filter ${range?.min ?? "…"}–${range?.max ?? "…"}; skipped lead creation`;
    await runsRepo.updateRunProgress(db, ctx.runId, {
      stage: "scoring",
      leadsScored: 0,
    });
    await runEventsRepo.createRunEvent(db, {
      runId: ctx.runId,
      eventType: "run.progress",
      payload: {
        stage: "scoring",
        message,
        employeeCount: company.employeeCount,
        employeeRange: range,
      },
    });
    return { leadsScored: 0 };
  }

  const employments = await entitiesRepo.getEmploymentsByCompanyId(db, company.id);
  const targetPersonIds = options.personIds?.length
    ? new Set(options.personIds)
    : ctx.resolvedPersonIds?.length
      ? new Set(ctx.resolvedPersonIds)
      : null;
  const signals = await entitiesRepo.getBusinessSignalsByCompanyId(db, company.id);
  const documents = await sourcesRepo.getSourceDocumentsByRunId(db, ctx.runId);
  let leadsScored = 0;

  const filteredEmployments = employments.filter(
    (employment) => !targetPersonIds || targetPersonIds.has(employment.personId),
  );
  const personIds = filteredEmployments.map((employment) => employment.personId);

  const [contactRows, externalProfileRows, experienceRows] = await Promise.all([
    personIds.length > 0
      ? db.select().from(contactPoints).where(inArray(contactPoints.personId, personIds))
      : Promise.resolve([]),
    personIds.length > 0
      ? db
          .select()
          .from(personExternalProfiles)
          .where(inArray(personExternalProfiles.personId, personIds))
      : Promise.resolve([]),
    personIds.length > 0
      ? db
          .select()
          .from(personExperienceMetrics)
          .where(inArray(personExperienceMetrics.personId, personIds))
      : Promise.resolve([]),
  ]);

  const contactsByPersonId = new Map<string, typeof contactRows>();
  for (const contact of contactRows) {
    if (!contact.personId) {
      continue;
    }
    const existing = contactsByPersonId.get(contact.personId) ?? [];
    existing.push(contact);
    contactsByPersonId.set(contact.personId, existing);
  }

  const externalProfileByPersonId = new Map(
    externalProfileRows.map((profile) => [profile.personId, profile]),
  );
  const experienceByPersonId = new Map(
    experienceRows.map((metrics) => [metrics.personId, metrics]),
  );

  const tierResults = filteredEmployments.map((employment) =>
    matchRoleWithTier(employment.rawTitle, run?.roleCriteria),
  );
  const hasExactOrSynonymPeer = tierResults.some(
    (result) => result.roleMatchTier === "exact" || result.roleMatchTier === "synonym",
  );

  for (const [index, employment] of filteredEmployments.entries()) {
    const person = await entitiesRepo.getPersonById(db, employment.personId);
    if (!person) {
      continue;
    }

    const contacts = contactsByPersonId.get(person.id) ?? [];
    const linkedin = contacts.find((contact) => contact.type === "linkedin");
    const externalProfile = externalProfileByPersonId.get(person.id);
    const hasLinkedin = Boolean(linkedin?.rawValue || externalProfile?.profileUrl);

    if (!hasLinkedin) {
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

    const experienceMetrics = experienceByPersonId.get(person.id);

    const score = scoreLead({
      scoreVersion,
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
      : externalProfile
        ? "pending"
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

    await leadsRepo.markOtherLeadsStaleForPersonCompany(db, {
      personId: person.id,
      companyId: company.id,
      keepLeadId: lead.id,
    });

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
