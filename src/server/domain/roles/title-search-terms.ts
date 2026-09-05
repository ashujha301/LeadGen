import type { FunctionToken, RoleCriteria, SeniorityToken } from "@/shared/contracts/roles";

const SENIORITY_TITLE_TERMS: Record<SeniorityToken, string[]> = {
  founder: ["founder", "co-founder", "cofounder"],
  owner: ["owner"],
  c_suite: ["ceo", "cto", "cfo", "coo", "cmo", "cpo", "cro", "chief", "president"],
  vp: ["vice president", "vp", "svp", "evp"],
  head: ["head of", "head"],
  director: ["director"],
  manager: ["manager"],
};

const FUNCTION_TITLE_TERMS: Record<FunctionToken, string[]> = {
  executive: ["executive"],
  sales: ["sales", "revenue"],
  engineering: ["engineering", "engineer", "software"],
  product: ["product"],
  marketing: ["marketing"],
  customer_success: ["customer success", "customer support"],
  operations: ["operations"],
  finance: ["finance", "financial"],
  people: ["people", "human resources", "talent"],
};

/** Expand role criteria into Crustdata title substring search terms. */
export function roleCriteriaToTitleSearchTerms(
  criteria: RoleCriteria | null | undefined,
): string[] {
  if (!criteria) {
    return [];
  }

  const terms = new Set<string>();

  for (const title of criteria.customTitles) {
    const trimmed = title.trim();
    if (trimmed) {
      terms.add(trimmed);
    }
  }

  for (const seniority of criteria.seniorities) {
    for (const term of SENIORITY_TITLE_TERMS[seniority] ?? []) {
      terms.add(term);
    }
  }

  for (const fn of criteria.functions) {
    for (const term of FUNCTION_TITLE_TERMS[fn] ?? []) {
      terms.add(term);
    }
  }

  return [...terms];
}
