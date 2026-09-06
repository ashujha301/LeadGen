import { classifyTitle } from "@/server/domain/roles/classification";
import type { FunctionToken } from "@/shared/contracts/roles";
import {
  buildEmployerIdentityKey,
  buildStableConnectionId,
  employerMatchKind,
  mergePersonEmployerIntervals,
  scoreEvidenceQuality,
  scorePotentialConnectionStrength,
  totalIntersectedOverlapDays,
  type EvidenceLabel,
  type StrengthBand,
} from "@/server/domain/connections";

export type ConnectionEmploymentRow = {
  personId: string;
  companyId: string | null;
  companyDomain: string | null;
  employerName: string | null;
  employerDomain: string | null;
  employerLinkedinUrl: string | null;
  providerCompanyId: string | null;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  hasProviderMatch: boolean;
  provenanceFresh: boolean;
};

export type ConnectionLeadAnchor = {
  leadId: string;
  personId: string;
  personName: string;
  currentCompanyId: string;
  currentCompanyName: string;
  title: string | null;
  finalScore: number;
  confidence: number;
};

export type PotentialConnectionItem = {
  id: string;
  personA: ConnectionLeadAnchor;
  personB: ConnectionLeadAnchor;
  sharedEmployer: {
    key: string;
    name: string;
    domain: string | null;
    companyId: string | null;
  };
  overlapDays: number;
  strengthScore: number;
  strengthBand: StrengthBand;
  evidenceQuality: EvidenceLabel;
  evidenceScore: number;
  reasonCodes: string[];
  roleSegments: Array<{
    personId: string;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
  }>;
};

export type DiscoverPotentialConnectionsInput = {
  leads: ConnectionLeadAnchor[];
  employments: ConnectionEmploymentRow[];
  minOverlapDays?: number;
  includeLimited?: boolean;
  asOfDate?: string;
  currentCompanyId?: string;
  sharedEmployer?: string;
  strengthBand?: StrengthBand;
  limit?: number;
};

function functionsForTitle(title: string | null): FunctionToken[] {
  if (!title) return [];
  return classifyTitle(title).functions;
}

function earliestStart(rows: ConnectionEmploymentRow[]): string {
  return [...rows]
    .map((row) => row.startDate)
    .filter((value): value is string => Boolean(value))
    .sort()[0]!;
}

function latestOverlapEnd(
  rowsA: ConnectionEmploymentRow[],
  rowsB: ConnectionEmploymentRow[],
  asOfDate: string,
): string {
  const ends = [...rowsA, ...rowsB].map((row) =>
    row.isCurrent ? asOfDate : (row.endDate ?? asOfDate),
  );
  return ends.sort().at(-1) ?? asOfDate;
}

export function discoverPotentialConnections(
  input: DiscoverPotentialConnectionsInput,
): PotentialConnectionItem[] {
  const minOverlapDays = input.minOverlapDays ?? 90;
  const includeLimited = input.includeLimited ?? false;
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const limit = input.limit ?? 100;

  const leadsByPerson = new Map(input.leads.map((lead) => [lead.personId, lead]));
  const employmentsByPerson = new Map<string, ConnectionEmploymentRow[]>();
  for (const row of input.employments) {
    const list = employmentsByPerson.get(row.personId) ?? [];
    list.push(row);
    employmentsByPerson.set(row.personId, list);
  }

  const personIds = [...leadsByPerson.keys()];
  const items: PotentialConnectionItem[] = [];

  for (let i = 0; i < personIds.length; i += 1) {
    for (let j = i + 1; j < personIds.length; j += 1) {
      const personAId = personIds[i]!;
      const personBId = personIds[j]!;
      const leadA = leadsByPerson.get(personAId)!;
      const leadB = leadsByPerson.get(personBId)!;

      if (leadA.currentCompanyId === leadB.currentCompanyId) {
        continue;
      }

      if (
        input.currentCompanyId &&
        leadA.currentCompanyId !== input.currentCompanyId &&
        leadB.currentCompanyId !== input.currentCompanyId
      ) {
        continue;
      }

      const rowsA = employmentsByPerson.get(personAId) ?? [];
      const rowsB = employmentsByPerson.get(personBId) ?? [];

      const keyedA = new Map<string, ConnectionEmploymentRow[]>();
      for (const row of rowsA) {
        const key = buildEmployerIdentityKey({
          employerDomain: row.employerDomain,
          providerCompanyId: row.providerCompanyId,
          employerLinkedinUrl: row.employerLinkedinUrl,
          companyId: row.companyId,
          companyDomain: row.companyDomain,
          employerName: row.employerName,
        });
        if (!key) continue;
        const list = keyedA.get(key) ?? [];
        list.push(row);
        keyedA.set(key, list);
      }

      const keyedB = new Map<string, ConnectionEmploymentRow[]>();
      for (const row of rowsB) {
        const key = buildEmployerIdentityKey({
          employerDomain: row.employerDomain,
          providerCompanyId: row.providerCompanyId,
          employerLinkedinUrl: row.employerLinkedinUrl,
          companyId: row.companyId,
          companyDomain: row.companyDomain,
          employerName: row.employerName,
        });
        if (!key) continue;
        const list = keyedB.get(key) ?? [];
        list.push(row);
        keyedB.set(key, list);
      }

      const sharedKeys = [...keyedA.keys()].filter((key) => keyedB.has(key));
      for (const employerKey of sharedKeys) {
        if (input.sharedEmployer) {
          const needle = input.sharedEmployer.trim().toLowerCase();
          const sample = keyedA.get(employerKey)?.[0];
          const haystack = [
            employerKey,
            sample?.employerName,
            sample?.employerDomain,
            sample?.companyDomain,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(needle)) {
            continue;
          }
        }

        const matchKind = employerMatchKind(employerKey);
        if (matchKind === "name" && !includeLimited) {
          continue;
        }

        const employerRowsA = keyedA.get(employerKey) ?? [];
        const employerRowsB = keyedB.get(employerKey) ?? [];
        const intervalsA = mergePersonEmployerIntervals(
          employerRowsA.map((row) => ({
            startDate: row.startDate,
            endDate: row.endDate,
            isCurrent: row.isCurrent,
            asOfDate,
          })),
        );
        const intervalsB = mergePersonEmployerIntervals(
          employerRowsB.map((row) => ({
            startDate: row.startDate,
            endDate: row.endDate,
            isCurrent: row.isCurrent,
            asOfDate,
          })),
        );

        const overlapDays = totalIntersectedOverlapDays(intervalsA, intervalsB);
        if (overlapDays < minOverlapDays) {
          continue;
        }

        const titlesA = employerRowsA.map((row) => row.title);
        const titlesB = employerRowsB.map((row) => row.title);
        const functionsA = [...new Set(titlesA.flatMap((title) => functionsForTitle(title)))];
        const functionsB = [...new Set(titlesB.flatMap((title) => functionsForTitle(title)))];

        const strength = scorePotentialConnectionStrength({
          overlapDays,
          functionsA,
          functionsB,
          startA: earliestStart(employerRowsA),
          startB: earliestStart(employerRowsB),
          overlapEnd: latestOverlapEnd(employerRowsA, employerRowsB, asOfDate),
          sharedEmployerCount: sharedKeys.length,
          asOfDate,
          employerKey,
        });

        if (input.strengthBand && strength.band !== input.strengthBand) {
          continue;
        }

        const evidence = scoreEvidenceQuality({
          hasProviderCompanyId: employerRowsA.some((row) => row.providerCompanyId) ||
            employerRowsB.some((row) => row.providerCompanyId),
          employerMatchKind: matchKind,
          datesComplete: employerRowsA.every((row) => row.startDate) &&
            employerRowsB.every((row) => row.startDate),
          provenanceFresh:
            employerRowsA.some((row) => row.provenanceFresh) &&
            employerRowsB.some((row) => row.provenanceFresh),
        });

        if (evidence.label === "limited" && !includeLimited) {
          continue;
        }

        const sample = employerRowsA[0] ?? employerRowsB[0]!;
        items.push({
          id: buildStableConnectionId(personAId, personBId, employerKey),
          personA: leadA,
          personB: leadB,
          sharedEmployer: {
            key: employerKey,
            name: sample.employerName ?? sample.companyDomain ?? "Shared employer",
            domain: sample.employerDomain ?? sample.companyDomain,
            companyId: sample.companyId,
          },
          overlapDays,
          strengthScore: strength.strengthScore,
          strengthBand: strength.band,
          evidenceQuality: evidence.label,
          evidenceScore: evidence.score,
          reasonCodes: strength.reasonCodes,
          roleSegments: [...employerRowsA, ...employerRowsB].map((row) => ({
            personId: row.personId,
            title: row.title,
            startDate: row.startDate,
            endDate: row.endDate,
            isCurrent: row.isCurrent,
          })),
        });
      }
    }
  }

  return items
    .sort((left, right) => {
      if (right.strengthScore !== left.strengthScore) {
        return right.strengthScore - left.strengthScore;
      }
      if (right.overlapDays !== left.overlapDays) {
        return right.overlapDays - left.overlapDays;
      }
      return left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}
