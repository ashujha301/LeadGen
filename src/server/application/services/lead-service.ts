import type { LeadDetail, LeadSummary, RoleCriteria, ScoreComponent } from "@/shared/contracts";
import { ageInDays, calculateFreshness } from "@/server/domain";
import { buildLeadSummary as mapLeadSummary } from "@/server/application/mappers/lead-summary";
import { getDb, entitiesRepo, leadsRepo, runsRepo, sourcesRepo } from "@/server/infrastructure/db";
import { buildLeadGraph } from "@/server/domain";
import type { LeadsScope } from "@/server/infrastructure/db";
import { eq } from "drizzle-orm";
import { personExperienceMetrics } from "@/server/infrastructure/db/schema/person-experience-metrics";
import { personExternalProfiles } from "@/server/infrastructure/db/schema/person-external-profiles";

function hasRoleCriteria(criteria: RoleCriteria | null | undefined): boolean {
  if (!criteria) {
    return false;
  }
  return (
    criteria.seniorities.length > 0 ||
    criteria.functions.length > 0 ||
    criteria.customTitles.length > 0
  );
}

function resolveLeadsScope(
  requestedScope: LeadsScope | undefined,
  roleCriteria: RoleCriteria | null | undefined,
): LeadsScope {
  if (!hasRoleCriteria(roleCriteria)) {
    return "all";
  }
  return requestedScope ?? "matched";
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function buildLeadSummary(db: ReturnType<typeof getDb>, leadId: string): Promise<LeadSummary | null> {
  const lead = await leadsRepo.getLeadById(db, leadId);
  if (!lead) {
    return null;
  }

  const contacts = await entitiesRepo.getContactPointsByPersonId(db, lead.personId);
  const employment = await entitiesRepo.getEmploymentsByPersonId(db, lead.personId);
  const currentEmployment =
    employment.find((row) => row.companyId === lead.companyId && row.isCurrent) ??
    employment.find((row) => row.companyId === lead.companyId);

  const topComponent = [...lead.scoreComponents].sort(
    (a, b) => toNumber(b.contribution) - toNumber(a.contribution),
  )[0];

  const [experienceMetrics] = await db
    .select()
    .from(personExperienceMetrics)
    .where(eq(personExperienceMetrics.personId, lead.personId))
    .limit(1);

  const externalProfile = await db.query.personExternalProfiles.findFirst({
    where: eq(personExternalProfiles.personId, lead.personId),
  });

  if (!currentEmployment) {
    return null;
  }

  return mapLeadSummary({
    lead,
    person: lead.person,
    company: lead.company,
    employment: currentEmployment,
    contacts,
    keyReason: topComponent?.reasonCode ?? "SCORE_COMPUTED",
    experienceMetrics: experienceMetrics ?? null,
    externalProfile: externalProfile ?? null,
  });
}

export const leadService = {
  async getLeadsForRun(
    runId: string,
    cursor?: string,
    scope: "matched" | "all" = "matched",
  ): Promise<{ leads: LeadSummary[]; nextCursor: string | null }> {
    const db = getDb();
    const run = await runsRepo.getRunById(db, runId);
    const effectiveScope = resolveLeadsScope(scope, run?.roleCriteria);
    const page = await leadsRepo.getLeadsByRunId(db, runId, {
      cursor,
      limit: 20,
      scope: effectiveScope,
    });
    const leads = await Promise.all(page.leads.map((lead) => buildLeadSummary(db, lead.id)));

    return {
      leads: leads.filter((lead): lead is LeadSummary => lead !== null),
      nextCursor: page.nextCursor,
    };
  },

  async getLead(leadId: string): Promise<LeadDetail | null> {
    const db = getDb();
    const lead = await leadsRepo.getLeadById(db, leadId);
    if (!lead) {
      return null;
    }

    const summary = await buildLeadSummary(db, leadId);
    if (!summary) {
      return null;
    }

    const employments = await entitiesRepo.getEmploymentsByPersonId(db, lead.personId);
    const companies = await Promise.all(
      employments.map(async (employment) => {
        const company = employment.companyId
          ? await entitiesRepo.getCompanyById(db, employment.companyId)
          : null;
        return {
          companyId: employment.companyId,
          companyName: company?.name ?? employment.employerName ?? "Unknown company",
          title: employment.rawTitle,
          startDate: employment.startDate,
          endDate: employment.endDate,
          isCurrent: employment.isCurrent,
          confidence: toNumber(employment.confidence),
          employerDomain: employment.employerDomain ?? null,
        };
      }),
    );

    const documents = await sourcesRepo.getSourceDocumentsByRunId(db, lead.runId);
    const evidence = documents
      .filter((doc) => doc.excerpt)
      .slice(0, 5)
      .map((doc) => ({
        id: doc.id,
        sourceUrl: doc.canonicalUrl,
        excerpt: doc.excerpt ?? "",
        observedAt: (doc.fetchedAt ?? doc.createdAt).toISOString(),
        confidence: toNumber(lead.confidence),
        freshness: calculateFreshness(ageInDays(doc.fetchedAt ?? doc.createdAt), "company"),
      }));

    const signals = await entitiesRepo.getBusinessSignalsByCompanyId(db, lead.companyId);
    const scoreComponents: ScoreComponent[] = lead.scoreComponents.map((component) => ({
      key: component.componentKey,
      weight: toNumber(component.weight),
      rawValue: toNumber(component.rawValue),
      contribution: toNumber(component.contribution),
      reasonCode: component.reasonCode,
      label: component.label ?? component.componentKey,
    }));

    return {
      ...summary,
      explanation: lead.explanation ?? "Lead scored from collected evidence.",
      scoreComponents,
      evidence,
      businessSignals: signals.map((signal) => ({
        type: signal.signalType,
        value: signal.value,
        confidence: toNumber(signal.confidence),
        observedAt: signal.observedAt.toISOString(),
      })),
      conflicts: [],
      employmentHistory: companies,
    };
  },

  async getLeadGraph(leadId: string) {
    const db = getDb();
    const lead = await leadsRepo.getLeadById(db, leadId);
    if (!lead) {
      return null;
    }

    const employments = await entitiesRepo.getEmploymentsByPersonId(db, lead.personId);
    const employmentHistory = employments.map((employment) => ({
      id: employment.id,
      companyId: employment.companyId ?? `unresolved:${employment.id}`,
      companyName: employment.employerName ?? "Unknown company",
      normalizedTitle: employment.normalizedTitle,
      normalizedRole: employment.normalizedRole,
      startDate: employment.startDate,
      endDate: employment.endDate,
      isCurrent: employment.isCurrent,
      confidence: employment.confidence,
    }));

    const signals = await entitiesRepo.getBusinessSignalsByCompanyId(db, lead.companyId);
    const currentEmployment = employments.find(
      (employment) => employment.companyId === lead.companyId && employment.isCurrent,
    );

    return buildLeadGraph({
      leadId: lead.id,
      person: lead.person,
      company: lead.company,
      currentEmployment,
      employmentHistory: employmentHistory as NonNullable<(typeof employmentHistory)[number]>[],
      businessSignals: signals,
    });
  },
};
