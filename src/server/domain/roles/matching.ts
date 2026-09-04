import type { RoleCriteria } from "@/shared/contracts/roles";
import { normalizeTitle } from "@/server/domain/normalization/title";

import { classifyTitle } from "./classification";

export type RoleMatchResult = {
  roleMatch: boolean;
  roleMatchReasons: string[];
};

function isEmptyCriteria(criteria: RoleCriteria): boolean {
  return (
    criteria.seniorities.length === 0 &&
    criteria.functions.length === 0 &&
    criteria.customTitles.length === 0
  );
}

function normalizeCustomTitlePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesCustomTitle(title: string, phrase: string): boolean {
  const normalizedTitle = normalizeCustomTitlePhrase(title);
  const normalizedPhrase = normalizeCustomTitlePhrase(phrase);
  if (!normalizedPhrase) {
    return false;
  }

  return normalizedTitle === normalizedPhrase;
}

function matchStructuralCriteria(
  normalizedTitle: string,
  criteria: RoleCriteria,
): { matched: boolean; reasons: string[] } {
  const classified = classifyTitle(normalizedTitle);
  const reasons: string[] = [];

  const hasSeniorities = criteria.seniorities.length > 0;
  const hasFunctions = criteria.functions.length > 0;

  if (!hasSeniorities && !hasFunctions) {
    return { matched: false, reasons };
  }

  const matchedSeniorities = criteria.seniorities.filter((token) =>
    classified.seniorities.includes(token),
  );
  const matchedFunctions = criteria.functions.filter((token) =>
    classified.functions.includes(token),
  );

  const seniorityOk = !hasSeniorities || matchedSeniorities.length > 0;
  const functionOk = !hasFunctions || matchedFunctions.length > 0;

  for (const token of matchedSeniorities) {
    reasons.push(`seniority:${token}`);
  }
  for (const token of matchedFunctions) {
    reasons.push(`function:${token}`);
  }

  const matched =
    hasSeniorities && hasFunctions
      ? seniorityOk && functionOk
      : hasSeniorities
        ? seniorityOk
        : functionOk;

  return { matched, reasons: matched ? reasons : [] };
}

/**
 * Match a title against role criteria.
 * OR within seniority/function/custom groups; AND between seniority and function when both are set.
 */
export function matchTitleAgainstRoleCriteria(
  title: string | null | undefined,
  criteria: RoleCriteria | null | undefined,
): RoleMatchResult {
  if (!criteria || isEmptyCriteria(criteria)) {
    return { roleMatch: true, roleMatchReasons: [] };
  }

  if (!title?.trim()) {
    return { roleMatch: false, roleMatchReasons: [] };
  }

  const normalizedTitle = normalizeTitle(title);
  const reasons: string[] = [];

  for (const customTitle of criteria.customTitles) {
    if (matchesCustomTitle(title, customTitle)) {
      reasons.push(`custom:${normalizeCustomTitlePhrase(customTitle)}`);
    }
  }

  const structural = matchStructuralCriteria(normalizedTitle, criteria);
  if (structural.matched) {
    reasons.push(...structural.reasons);
  }

  return {
    roleMatch: reasons.length > 0,
    roleMatchReasons: reasons,
  };
}
