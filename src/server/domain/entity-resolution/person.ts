import { normalizeName, nameSimilarity } from "../normalization/name";
import { normalizeTitle, titleSimilarity } from "../normalization/title";
import { normalizeUrl } from "../normalization/url";
import { isUsableEmail, isUsableProfileUrl } from "./contact-identity";

export type PersonCandidate = {
  profileUrl?: string | null;
  email?: string | null;
  currentCompanyId?: string | null;
  name?: string | null;
  title?: string | null;
};

export type PersonMatchFeature =
  | "profileUrl"
  | "email"
  | "currentCompany"
  | "name"
  | "title";

export type PersonFeatureScore = {
  feature: PersonMatchFeature;
  score: number;
  weight: number;
  contribution: number;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export { normalizeEmail };

export function normalizePersonCandidate(candidate: PersonCandidate): PersonCandidate {
  return {
    profileUrl: candidate.profileUrl ? normalizeUrl(candidate.profileUrl) : candidate.profileUrl,
    email: candidate.email ? normalizeEmail(candidate.email) : candidate.email,
    currentCompanyId: candidate.currentCompanyId ?? null,
    name: candidate.name ? normalizeName(candidate.name) : candidate.name,
    title: candidate.title ? normalizeTitle(candidate.title) : candidate.title,
  };
}

export function scoreProfileUrlMatch(a: PersonCandidate, b: PersonCandidate): number {
  if (!a.profileUrl || !b.profileUrl) {
    return 0;
  }
  if (!isUsableProfileUrl(a.profileUrl) || !isUsableProfileUrl(b.profileUrl)) {
    return 0;
  }

  const left = normalizeUrl(a.profileUrl);
  const right = normalizeUrl(b.profileUrl);
  return left && right && left === right ? 1 : 0;
}

export function scoreEmailMatch(a: PersonCandidate, b: PersonCandidate): number {
  if (!a.email || !b.email) {
    return 0;
  }
  if (!isUsableEmail(a.email) || !isUsableEmail(b.email)) {
    return 0;
  }

  return normalizeEmail(a.email) === normalizeEmail(b.email) ? 1 : 0;
}

export function scoreCurrentCompanyMatch(a: PersonCandidate, b: PersonCandidate): number {
  if (!a.currentCompanyId || !b.currentCompanyId) {
    return 0;
  }

  return a.currentCompanyId === b.currentCompanyId ? 1 : 0;
}

export function scoreNameMatch(a: PersonCandidate, b: PersonCandidate): number {
  if (!a.name || !b.name) {
    return 0;
  }

  return nameSimilarity(a.name, b.name);
}

export function scoreTitleMatch(a: PersonCandidate, b: PersonCandidate): number {
  if (!a.title || !b.title) {
    return 0;
  }

  return titleSimilarity(a.title, b.title);
}
