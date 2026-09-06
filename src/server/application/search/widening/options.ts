import type {
  NaturalSearchInterpretationV2,
  NaturalSearchV2Response,
  WideningOption,
} from "@/shared/contracts/natural-search-v2";

export type WideningOptionInput = {
  id: string;
  label: string;
  estimatedCount?: number;
};

export function buildNoResultsResponse(input: {
  interpretationSummary: string;
  options: WideningOptionInput[];
  appliedFilters?: NaturalSearchInterpretationV2["appliedFilters"];
  warnings?: string[];
  sessionId?: string;
  version?: number;
  expiresAt?: string;
}): Extract<NaturalSearchV2Response, { status: "no_results" }> {
  const wideningOptions: WideningOption[] = input.options.map((option) => ({
    id: option.id,
    label: option.label,
    estimatedCount: option.estimatedCount,
    executed: false,
  }));

  return {
    status: "no_results",
    sessionId: input.sessionId,
    version: input.version,
    expiresAt: input.expiresAt,
    interpretation: {
      summary: input.interpretationSummary,
      appliedFilters: input.appliedFilters ?? [],
      semanticPhrase: null,
      warnings: input.warnings ?? [],
      widened: false,
    },
    wideningOptions,
  };
}

/**
 * Deterministic widening suggestions. Never removes company/person/run/ownership.
 */
export function suggestWideningOptions(input: {
  hasExactRole: boolean;
  hasScoreThreshold: boolean;
  scoreThreshold?: number;
  hasOptionalSignalOrDate: boolean;
  roleFamilyEstimatedCount?: number;
  semanticRoleEstimatedCount?: number;
  loweredThresholdEstimatedCount?: number;
  removedOptionalEstimatedCount?: number;
}): WideningOptionInput[] {
  const options: WideningOptionInput[] = [];

  if (input.hasExactRole) {
    options.push({
      id: "widen-role-family",
      label: "Expand role to related family / seniority",
      estimatedCount: input.roleFamilyEstimatedCount,
    });
    options.push({
      id: "widen-semantic-role",
      label: "Match similar roles semantically",
      estimatedCount: input.semanticRoleEstimatedCount,
    });
  }

  if (input.hasOptionalSignalOrDate) {
    options.push({
      id: "widen-drop-optional",
      label: "Remove optional signal/date filter",
      estimatedCount: input.removedOptionalEstimatedCount,
    });
  }

  if (input.hasScoreThreshold && input.scoreThreshold !== undefined) {
    const lowered = Math.max(0, Math.floor(input.scoreThreshold * 0.75));
    options.push({
      id: "widen-threshold",
      label: `Lower score threshold to ${lowered}`,
      estimatedCount: input.loweredThresholdEstimatedCount,
    });
  }

  return options.slice(0, 4);
}
