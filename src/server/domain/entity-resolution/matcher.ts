import { PERSON_MATCH_THRESHOLDS, PERSON_MATCH_WEIGHTS } from "@/shared/config";
import {
  type PersonCandidate,
  type PersonFeatureScore,
  type PersonMatchFeature,
  scoreCurrentCompanyMatch,
  scoreEmailMatch,
  scoreNameMatch,
  scoreProfileUrlMatch,
  scoreTitleMatch,
} from "./person";

export type MatchDecision = "auto_merge" | "review" | "separate";

export type PersonMatchResult = {
  score: number;
  decision: MatchDecision;
  features: PersonFeatureScore[];
  reasons: string[];
};

const FEATURE_SCORERS: Record<
  PersonMatchFeature,
  { weight: number; score: (a: PersonCandidate, b: PersonCandidate) => number; reason: string }
> = {
  profileUrl: {
    weight: PERSON_MATCH_WEIGHTS.profileUrl,
    score: scoreProfileUrlMatch,
    reason: "profile_url_match",
  },
  email: {
    weight: PERSON_MATCH_WEIGHTS.email,
    score: scoreEmailMatch,
    reason: "email_match",
  },
  currentCompany: {
    weight: PERSON_MATCH_WEIGHTS.currentCompany,
    score: scoreCurrentCompanyMatch,
    reason: "current_company_match",
  },
  name: {
    weight: PERSON_MATCH_WEIGHTS.nameSimilarity,
    score: scoreNameMatch,
    reason: "name_similarity",
  },
  title: {
    weight: PERSON_MATCH_WEIGHTS.titleSimilarity,
    score: scoreTitleMatch,
    reason: "title_similarity",
  },
};

export function classifyMatchDecision(score: number): MatchDecision {
  if (score >= PERSON_MATCH_THRESHOLDS.autoMerge) {
    return "auto_merge";
  }

  if (score >= PERSON_MATCH_THRESHOLDS.review) {
    return "review";
  }

  return "separate";
}

/**
 * Weighted person matching:
 * profileUrl 40%, email 30%, currentCompany 15%, name 10%, title 5%.
 */
export function matchPersons(a: PersonCandidate, b: PersonCandidate): PersonMatchResult {
  const features: PersonFeatureScore[] = [];
  const reasons: string[] = [];
  let score = 0;

  for (const feature of Object.keys(FEATURE_SCORERS) as PersonMatchFeature[]) {
    const { weight, score: scorer, reason } = FEATURE_SCORERS[feature];
    const featureScore = scorer(a, b);
    const contribution = featureScore * weight;
    score += contribution;

    features.push({ feature, score: featureScore, weight, contribution });

    if (featureScore > 0) {
      reasons.push(reason);
    }
  }

  const roundedScore = roundScore(score);

  return {
    score: roundedScore,
    decision: classifyMatchDecision(roundedScore),
    features,
    reasons,
  };
}

function roundScore(score: number): number {
  return Math.round(score * 10000) / 10000;
}
