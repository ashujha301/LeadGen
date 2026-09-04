import { isErrorPageTitle } from "@/server/domain/normalization/title";

export type CompanyNameObservation = {
  attribute: string;
  rawValue: string;
};

/** Strip marketing suffixes from homepage titles like "Appknox | Mobile App Security". */
export function cleanPageTitle(title: string): string {
  const primary = title.split("|")[0]?.split("—")[0]?.split(" - ")[0]?.trim();
  return primary && primary.length > 0 ? primary : title.trim();
}

/**
 * Pick a canonical company name with source precedence:
 * explicit name observation, cleaned homepage title, then domain fallback.
 */
export function pickCompanyName(
  observations: CompanyNameObservation[],
  fallback: string,
): string {
  const explicitName = observations.find(
    (obs) => obs.attribute === "name" && !isErrorPageTitle(obs.rawValue),
  );
  if (explicitName) {
    return explicitName.rawValue.trim();
  }

  const pageTitle = observations.find(
    (obs) => obs.attribute === "page_title" && !isErrorPageTitle(obs.rawValue),
  );
  if (pageTitle) {
    return cleanPageTitle(pageTitle.rawValue);
  }

  return fallback;
}
