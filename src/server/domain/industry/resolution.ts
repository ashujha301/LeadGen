export type IndustryObservation = {
  value: string;
  source: string;
  confidence: number;
  observedAt: Date;
  providerUpdatedAt?: Date | null;
};

export type IndustryResolutionResult = {
  canonicalIndustry: string | null;
  industrySource: string | null;
  industryObservedAt: Date | null;
};

/**
 * Discover canonical industry with precedence:
 * 1. Exact-domain Crustdata taxonomy
 * 2. Website JSON-LD
 * 3. Evidence-backed extraction
 * 4. Existing canonical when no stronger evidence
 */
export function resolveCanonicalIndustry(
  observations: IndustryObservation[],
  existingIndustry: string | null | undefined,
): IndustryResolutionResult {
  const ranked = [...observations].sort((a, b) => {
    const sourceRank = (source: string): number => {
      if (source.startsWith("crustdata")) {
        return 4;
      }
      if (source === "website:jsonld") {
        return 3;
      }
      if (source.startsWith("openai")) {
        return 2;
      }
      return 1;
    };

    const rankDiff = sourceRank(b.source) - sourceRank(a.source);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return b.confidence - a.confidence;
  });

  const best = ranked[0];
  if (best) {
    return {
      canonicalIndustry: best.value,
      industrySource: best.source,
      industryObservedAt: best.observedAt,
    };
  }

  if (existingIndustry) {
    return {
      canonicalIndustry: existingIndustry,
      industrySource: "existing",
      industryObservedAt: null,
    };
  }

  return {
    canonicalIndustry: null,
    industrySource: null,
    industryObservedAt: null,
  };
}

/** User-entered ICP industry is a preference only — never promoted to canonical without evidence. */
export function icpIndustryIsPreferenceOnly(): true {
  return true;
}
