import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { calculateExperienceMetrics } from "@/server/domain/timeline/experience-calculation";
import { normalizeDomain } from "@/server/domain/normalization/domain";
import { normalizeTitle } from "@/server/domain/normalization/title";
import { normalizeUrl } from "@/server/domain/normalization/url";
import { classifyTitle } from "@/server/domain/roles/classification";
import type { CrustdataPersonEnrichResult, CrustdataPersonExperience } from "@/server/infrastructure/connectors/types";
import type { Db } from "@/server/infrastructure/db";
import {
  companies,
  companyExternalProfiles,
  employments,
  entitiesRepo,
  leadCandidates,
  personExperienceMetrics,
} from "@/server/infrastructure/db";

export type TimelineStatus =
  | "available"
  | "no_history"
  | "not_found"
  | "redacted"
  | "failed";

export type PersistPersonEnrichmentInput = {
  db: Db;
  personId: string;
  enrichResult: CrustdataPersonEnrichResult;
  runId?: string;
  fetchedAt?: Date;
  inputProfileUrl?: string | null;
};

export type PersistPersonEnrichmentResult = {
  timelineStatus: TimelineStatus;
  employmentCount: number;
  calculatedTotalMonths: number | null;
  providerExperienceYears: number | null;
  leadershipExperienceMonths: number | null;
};

function isLeadershipTitle(title: string | null): boolean {
  if (!title) {
    return false;
  }
  const { seniorities } = classifyTitle(title);
  return seniorities.some((token) =>
    ["founder", "owner", "c_suite", "vp", "head", "director"].includes(token),
  );
}

export function buildEmploymentFingerprint(input: {
  personId: string;
  companyId: string | null;
  employerName: string;
  employerDomain: string | null;
  employerProfessionalNetworkUrl: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}): string {
  const payload = [
    input.personId,
    input.companyId ?? "",
    input.employerDomain ?? "",
    input.employerProfessionalNetworkUrl ?? "",
    input.employerName.trim().toLowerCase(),
    (input.title ?? "").trim().toLowerCase(),
    input.startDate ?? "",
    input.endDate ?? "",
    input.isCurrent ? "1" : "0",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

async function resolveEmployerCompanyId(
  db: Db,
  experience: CrustdataPersonExperience,
): Promise<string | null> {
  if (experience.crustdataCompanyId) {
    const byProvider = await db.query.companyExternalProfiles.findFirst({
      where: and(
        eq(companyExternalProfiles.provider, "crustdata"),
        eq(companyExternalProfiles.providerCompanyId, experience.crustdataCompanyId),
      ),
    });
    if (byProvider?.companyId) {
      return byProvider.companyId;
    }
  }

  const domain = experience.companyDomain
    ? normalizeDomain(experience.companyDomain)
    : null;
  if (domain) {
    const byDomain = await entitiesRepo.findCompanyByDomain(db, domain);
    if (byDomain) {
      return byDomain.id;
    }
    const alias = await entitiesRepo.findCompanyByAlias(db, "domain", domain);
    if (alias) {
      return alias.id;
    }
  }

  const linkedinUrl = experience.companyLinkedinUrl
    ? normalizeUrl(experience.companyLinkedinUrl)
    : null;
  if (linkedinUrl) {
    const byLinkedin = await db.query.companies.findFirst({
      where: eq(companies.professionalNetworkUrl, linkedinUrl),
    });
    if (byLinkedin) {
      return byLinkedin.id;
    }
  }

  const nameKey = experience.companyName.trim().toLowerCase();
  if (nameKey) {
    const byNameAlias = await entitiesRepo.findCompanyByAlias(db, "name", nameKey);
    if (byNameAlias) {
      return byNameAlias.id;
    }
  }

  return null;
}

async function findEmploymentForUpsert(
  db: Db,
  personId: string,
  experience: CrustdataPersonExperience,
  fingerprint: string,
  companyId: string | null,
) {
  if (experience.providerEmploymentId) {
    const byProviderId = await db.query.employments.findFirst({
      where: and(
        eq(employments.personId, personId),
        eq(employments.providerEmploymentId, experience.providerEmploymentId),
      ),
    });
    if (byProviderId) {
      return byProviderId;
    }
  }

  const byFingerprint = await db.query.employments.findFirst({
    where: and(
      eq(employments.personId, personId),
      eq(employments.providerFingerprint, fingerprint),
    ),
  });
  if (byFingerprint) {
    return byFingerprint;
  }

  if (experience.isCurrent && companyId) {
    return entitiesRepo.findCurrentEmployment(db, personId, companyId);
  }

  return undefined;
}

function timelineStatusForEnrich(
  enrichResult: CrustdataPersonEnrichResult,
  employmentCount: number,
): TimelineStatus {
  if (enrichResult.status === "not_found") {
    return "not_found";
  }
  if (enrichResult.status === "redacted") {
    return "redacted";
  }
  if (enrichResult.status === "failed" || enrichResult.status === "invalid") {
    return "failed";
  }
  return employmentCount > 0 ? "available" : "no_history";
}

export async function persistPersonEnrichment(
  input: PersistPersonEnrichmentInput,
): Promise<PersistPersonEnrichmentResult> {
  const { db, personId, enrichResult } = input;
  const fetchedAt = input.fetchedAt ?? new Date();
  const profileUrl =
    enrichResult.linkedinUrl ??
    enrichResult.matchedOn ??
    input.inputProfileUrl ??
    null;
  const normalizedProfile = profileUrl
    ? normalizeUrl(profileUrl)?.toLowerCase() ?? profileUrl.toLowerCase()
    : null;

  if (enrichResult.crustdataPersonId || normalizedProfile) {
    await entitiesRepo.upsertPersonExternalProfile(db, {
      personId,
      provider: "crustdata",
      providerPersonId: enrichResult.crustdataPersonId,
      profileUrl: profileUrl ?? undefined,
      normalizedProfileUrl: normalizedProfile ?? undefined,
      providerUpdatedAt: enrichResult.providerUpdatedAt
        ? new Date(enrichResult.providerUpdatedAt)
        : fetchedAt,
    });
  }

  if (
    enrichResult.status === "not_found" ||
    enrichResult.status === "redacted" ||
    enrichResult.status === "failed" ||
    enrichResult.status === "invalid"
  ) {
    if (input.runId) {
      await db
        .update(leadCandidates)
        .set({
          enrichmentStatus:
            enrichResult.status === "invalid" ? "failed" : enrichResult.status,
        })
        .where(
          and(
            eq(leadCandidates.personId, personId),
            eq(leadCandidates.runId, input.runId),
          ),
        );
    }

    return {
      timelineStatus: timelineStatusForEnrich(enrichResult, 0),
      employmentCount: 0,
      calculatedTotalMonths: null,
      providerExperienceYears: enrichResult.providerExperienceYears,
      leadershipExperienceMonths: null,
    };
  }

  let employmentCount = 0;

  for (const experience of enrichResult.experience) {
    const companyId = await resolveEmployerCompanyId(db, experience);
    const employerDomain = experience.companyDomain
      ? normalizeDomain(experience.companyDomain)
      : null;
    const employerProfessionalNetworkUrl = experience.companyLinkedinUrl
      ? normalizeUrl(experience.companyLinkedinUrl)
      : null;
    const title = experience.title;
    const normalized = title ? normalizeTitle(title) : null;
    const classification = title ? classifyTitle(title) : null;
    const fingerprint = buildEmploymentFingerprint({
      personId,
      companyId,
      employerName: experience.companyName,
      employerDomain,
      employerProfessionalNetworkUrl,
      title,
      startDate: experience.startDate,
      endDate: experience.endDate,
      isCurrent: experience.isCurrent,
    });

    const existing = await findEmploymentForUpsert(
      db,
      personId,
      experience,
      fingerprint,
      companyId,
    );

    const payload = {
      companyId,
      employerName: experience.companyName,
      employerDomain,
      employerProfessionalNetworkUrl,
      providerEmploymentId: experience.providerEmploymentId,
      providerFingerprint: fingerprint,
      providerUpdatedAt: enrichResult.providerUpdatedAt
        ? new Date(enrichResult.providerUpdatedAt)
        : fetchedAt,
      rawTitle: title,
      normalizedTitle: normalized,
      normalizedRole: normalized,
      seniority: classification?.seniorities[0] ?? null,
      startDate: experience.startDate,
      endDate: experience.endDate,
      isCurrent: experience.isCurrent,
      confidence: "0.85",
      lastObservedAt: fetchedAt,
      lastConfirmedRunId: input.runId ?? null,
    };

    if (existing) {
      await entitiesRepo.updateEmployment(db, existing.id, {
        ...payload,
        firstObservedAt: existing.firstObservedAt ?? fetchedAt,
      });
    } else {
      await entitiesRepo.createEmployment(db, {
        personId,
        ...payload,
        firstObservedAt: fetchedAt,
        missedRefreshCount: 0,
      });
    }

    employmentCount += 1;
  }

  const persisted = await entitiesRepo.getEmploymentsByPersonId(db, personId);
  const intervals = persisted
    .filter((row) => row.startDate)
    .map((row) => ({
      startDate: new Date(row.startDate!),
      endDate: row.isCurrent
        ? fetchedAt
        : row.endDate
          ? new Date(row.endDate)
          : null,
      isLeadership: isLeadershipTitle(row.rawTitle),
    }));

  const datedComplete = intervals.every((interval) => interval.startDate && interval.endDate);
  const calculated = calculateExperienceMetrics(
    intervals.map((interval) => ({
      startDate: interval.startDate,
      endDate: interval.endDate,
      isLeadership: interval.isLeadership,
    })),
  );

  const calculatedTotalMonths = datedComplete
    ? calculated.calculatedTotalMonths
    : calculated.calculatedTotalMonths > 0
      ? calculated.calculatedTotalMonths
      : null;
  const preferredMonths =
    calculatedTotalMonths != null && calculatedTotalMonths > 0
      ? calculatedTotalMonths
      : enrichResult.providerExperienceYears != null
        ? Math.round(enrichResult.providerExperienceYears * 12)
        : null;

  const [existingMetrics] = await db
    .select()
    .from(personExperienceMetrics)
    .where(eq(personExperienceMetrics.personId, personId))
    .limit(1);

  const metricsInput = {
    providerExperienceYears:
      enrichResult.providerExperienceYears != null
        ? String(enrichResult.providerExperienceYears)
        : null,
    calculatedTotalMonths: preferredMonths,
    leadershipExperienceMonths: calculated.leadershipExperienceMonths || null,
    experienceConfidence: "0.85",
    calculatedAt: fetchedAt,
  };

  if (existingMetrics) {
    await db
      .update(personExperienceMetrics)
      .set(metricsInput)
      .where(eq(personExperienceMetrics.personId, personId));
  } else {
    await db.insert(personExperienceMetrics).values({
      personId,
      ...metricsInput,
    });
  }

  if (input.runId) {
    await db
      .update(leadCandidates)
      .set({ enrichmentStatus: "matched" })
      .where(
        and(eq(leadCandidates.personId, personId), eq(leadCandidates.runId, input.runId)),
      );
  }

  return {
    timelineStatus: timelineStatusForEnrich(enrichResult, employmentCount),
    employmentCount,
    calculatedTotalMonths: preferredMonths,
    providerExperienceYears: enrichResult.providerExperienceYears,
    leadershipExperienceMonths: calculated.leadershipExperienceMonths || null,
  };
}

export function deriveTimelineStatus(input: {
  enrichmentStatus: string | null | undefined;
  employmentCount: number;
}): TimelineStatus {
  if (input.enrichmentStatus === "not_found") {
    return "not_found";
  }
  if (input.enrichmentStatus === "redacted") {
    return "redacted";
  }
  if (input.enrichmentStatus === "failed") {
    return "failed";
  }
  if (input.employmentCount > 0) {
    return "available";
  }
  if (input.enrichmentStatus === "matched" || input.enrichmentStatus === "pending") {
    return input.enrichmentStatus === "matched" ? "no_history" : "no_history";
  }
  return "no_history";
}

/** @internal test helper */
export const __test = {
  resolveEmployerCompanyId,
  findEmploymentForUpsert,
  isLeadershipTitle,
};
