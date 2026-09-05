import { normalizeDomain } from "../normalization/domain";

export type CompanyRecord = {
  id: string;
  normalizedDomain: string;
  name: string;
  aliases?: string[];
};

export type CompanyResolutionResult =
  { status: "matched"; company: CompanyRecord } | { status: "unmatched"; normalizedDomain: string };

/**
 * Resolve a company by normalized domain against known records and alias domains.
 */
export function resolveCompanyByDomain(
  domain: string,
  companies: CompanyRecord[],
): CompanyResolutionResult {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) {
    return { status: "unmatched", normalizedDomain: "" };
  }

  for (const company of companies) {
    if (company.normalizedDomain === normalizedDomain) {
      return { status: "matched", company };
    }

    const aliasDomains = company.aliases ?? [];
    for (const alias of aliasDomains) {
      const normalizedAlias = normalizeDomain(alias);
      if (normalizedAlias === normalizedDomain) {
        return { status: "matched", company };
      }
    }
  }

  return { status: "unmatched", normalizedDomain };
}

/**
 * Build a domain index for faster repeated lookups.
 */
export function buildCompanyDomainIndex(companies: CompanyRecord[]): Map<string, CompanyRecord> {
  const index = new Map<string, CompanyRecord>();

  for (const company of companies) {
    index.set(company.normalizedDomain, company);

    for (const alias of company.aliases ?? []) {
      const normalizedAlias = normalizeDomain(alias);
      if (normalizedAlias) {
        index.set(normalizedAlias, company);
      }
    }
  }

  return index;
}
