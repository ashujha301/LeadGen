import { isErrorPageTitle } from "@/server/domain/normalization/title";

export type CompanyNameObservation = {
  attribute: string;
  rawValue: string;
  sourceUrl?: string;
  isHomepage?: boolean;
};

const GENERIC_LABEL_PATTERNS = [
  /^home$/i,
  /^homepage$/i,
  /^welcome$/i,
  /^index$/i,
  /^untitled$/i,
  /^website$/i,
  /^company$/i,
  /^about us$/i,
  /^about$/i,
  /^team$/i,
  /^our team$/i,
  /^contact$/i,
  /^contact us$/i,
  /^leadership$/i,
];

/** True when a company name is too generic to trust as a canonical label. */
export function isGenericCompanyLabel(name: string, _fallbackDomain?: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || isErrorPageTitle(trimmed)) {
    return true;
  }
  if (GENERIC_LABEL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }
  return false;
}

function isHomepageSource(observation: CompanyNameObservation, homepageUrl?: string): boolean {
  if (observation.isHomepage) {
    return true;
  }
  if (!observation.sourceUrl || !homepageUrl) {
    return false;
  }
  try {
    const obsPath = new URL(observation.sourceUrl).pathname.replace(/\/+$/, "") || "/";
    const homePath = new URL(homepageUrl).pathname.replace(/\/+$/, "") || "/";
    return obsPath === homePath;
  } catch {
    return false;
  }
}

/** When homepage context is known, only homepage observations qualify; otherwise allow unmarked sources. */
function isEligibleCompanyNameSource(
  observation: CompanyNameObservation,
  homepageUrl?: string,
): boolean {
  if (observation.isHomepage === false) {
    return false;
  }
  if (!homepageUrl) {
    return true;
  }
  return isHomepageSource(observation, homepageUrl);
}

/** Strip marketing suffixes from homepage titles like "Appknox | Mobile App Security". */
export function cleanPageTitle(title: string): string {
  const primary = title.split("|")[0]?.split("—")[0]?.split(" - ")[0]?.trim();
  return primary && primary.length > 0 ? primary : title.trim();
}

/**
 * Pick a canonical company name with source precedence:
 * explicit non-generic name (homepage when context known), cleaned homepage title, then domain.
 */
export function pickCompanyName(
  observations: CompanyNameObservation[],
  fallback: string,
  homepageUrl?: string,
): string {
  const explicitName = observations.find(
    (obs) =>
      obs.attribute === "name" &&
      !isErrorPageTitle(obs.rawValue) &&
      isEligibleCompanyNameSource(obs, homepageUrl) &&
      !isGenericCompanyLabel(obs.rawValue, fallback),
  );
  if (explicitName) {
    return explicitName.rawValue.trim();
  }

  const pageTitle = observations.find(
    (obs) =>
      obs.attribute === "page_title" &&
      !isErrorPageTitle(obs.rawValue) &&
      isEligibleCompanyNameSource(obs, homepageUrl),
  );
  if (pageTitle) {
    const cleaned = cleanPageTitle(pageTitle.rawValue);
    if (!isGenericCompanyLabel(cleaned, fallback)) {
      return cleaned;
    }
  }

  return fallback;
}

/** Pick company name from run observations with homepage-aware source precedence. */
export function pickCompanyNameFromObservations(
  observations: CompanyNameObservation[],
  fallback: string,
  homepageUrl?: string,
): string {
  return pickCompanyName(observations, fallback, homepageUrl);
}
