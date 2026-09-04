import type { RoleCriteria } from "@/shared/contracts/roles";
import { normalizeTitle } from "@/server/domain/normalization/title";

import { classifyTitle } from "../roles/classification";
import { matchTitleAgainstRoleCriteria } from "../roles/matching";

export type RoleMatchTier = "exact" | "synonym" | "fallback" | "none";

export type RoleTierMatchResult = {
  roleMatch: boolean;
  roleMatchTier: RoleMatchTier;
  roleSimilarity: number;
  roleMatchFinal: boolean;
  roleMatchReasons: string[];
};

const EXECUTIVE_SYNONYMS = ["chief", "president", "founder", "owner", "managing director"];
const DEFAULT_EXECUTIVE_TITLES = ["founder", "ceo", "president", "owner", "chief executive"];

function isExactCustomMatch(title: string, criteria: RoleCriteria): boolean {
  const normalizedTitle = title.trim().toLowerCase();
  return criteria.customTitles.some(
    (phrase) => phrase.trim().toLowerCase() === normalizedTitle,
  );
}

function isSynonymMatch(title: string, criteria: RoleCriteria): boolean {
  const normalized = normalizeTitle(title);
  const classified = classifyTitle(normalized);
  const base = matchTitleAgainstRoleCriteria(title, criteria);
  if (!base.roleMatch) {
    return false;
  }
  if (isExactCustomMatch(title, criteria)) {
    return false;
  }
  return classified.seniorities.length > 0 || classified.functions.length > 0;
}

function isFallbackExecutive(title: string | null | undefined): boolean {
  if (!title?.trim()) {
    return false;
  }
  const normalized = normalizeTitle(title);
  return DEFAULT_EXECUTIVE_TITLES.some((token) => normalized.includes(token)) ||
    EXECUTIVE_SYNONYMS.some((token) => normalized.includes(token));
}

export function matchRoleWithTier(
  title: string | null | undefined,
  criteria: RoleCriteria | null | undefined,
  options: { hasExactOrSynonymPeer?: boolean } = {},
): RoleTierMatchResult {
  if (!title?.trim()) {
    return {
      roleMatch: false,
      roleMatchTier: "none",
      roleSimilarity: 0,
      roleMatchFinal: false,
      roleMatchReasons: [],
    };
  }

  const base = matchTitleAgainstRoleCriteria(title, criteria);
  if (!criteria || (criteria.seniorities.length === 0 && criteria.functions.length === 0 && criteria.customTitles.length === 0)) {
    const fallback = isFallbackExecutive(title);
    return {
      roleMatch: fallback,
      roleMatchTier: fallback ? "fallback" : "none",
      roleSimilarity: fallback ? 0.55 : 0,
      roleMatchFinal: fallback,
      roleMatchReasons: fallback ? ["default:executive"] : [],
    };
  }

  if (isExactCustomMatch(title, criteria)) {
    return {
      roleMatch: true,
      roleMatchTier: "exact",
      roleSimilarity: 1,
      roleMatchFinal: true,
      roleMatchReasons: base.roleMatchReasons,
    };
  }

  if (isSynonymMatch(title, criteria)) {
    return {
      roleMatch: true,
      roleMatchTier: "synonym",
      roleSimilarity: 0.85,
      roleMatchFinal: true,
      roleMatchReasons: base.roleMatchReasons,
    };
  }

  if (isFallbackExecutive(title)) {
    const roleMatchFinal = !options.hasExactOrSynonymPeer;
    return {
      roleMatch: true,
      roleMatchTier: "fallback",
      roleSimilarity: 0.55,
      roleMatchFinal,
      roleMatchReasons: ["fallback:executive"],
    };
  }

  return {
    roleMatch: false,
    roleMatchTier: "none",
    roleSimilarity: 0,
    roleMatchFinal: false,
    roleMatchReasons: [],
  };
}

import { HIGH_VALUE_LEAD_THRESHOLDS } from "@/shared/config";

export function qualifiesAsHighValueLead(input: {
  scoreVersion: number;
  roleMatchFinal: boolean;
  roleMatch: boolean;
  finalScore: number;
  confidence: number;
  isStale: boolean;
  hasVerifiedCurrentEmployment: boolean;
}): boolean {
  return (
    input.scoreVersion >= HIGH_VALUE_LEAD_THRESHOLDS.scoreVersion &&
    input.roleMatchFinal &&
    input.roleMatch &&
    input.finalScore >= HIGH_VALUE_LEAD_THRESHOLDS.minScore &&
    input.confidence >= HIGH_VALUE_LEAD_THRESHOLDS.minConfidence &&
    !input.isStale &&
    input.hasVerifiedCurrentEmployment
  );
}
