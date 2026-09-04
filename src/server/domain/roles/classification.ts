import { normalizeTitle } from "@/server/domain/normalization/title";
import type { FunctionToken, SeniorityToken } from "@/shared/contracts/roles";

export type TitleClassification = {
  seniorities: SeniorityToken[];
  functions: FunctionToken[];
};

const SENIORITY_PATTERNS: Array<{ token: SeniorityToken; pattern: RegExp }> = [
  { token: "founder", pattern: /\b(co-?founder|founder)\b/ },
  { token: "owner", pattern: /\bowner\b/ },
  { token: "c_suite", pattern: /\b(chief|ceo|cfo|cto|coo|cmo|cpo|cro|president)\b/ },
  { token: "vp", pattern: /\b(vice president|svp|evp|vp)\b/ },
  { token: "head", pattern: /\bhead(?:\s+of)?\b/ },
  { token: "director", pattern: /\bdirector\b/ },
  { token: "manager", pattern: /\bmanager\b/ },
];

const FUNCTION_PATTERNS: Array<{ token: FunctionToken; pattern: RegExp }> = [
  { token: "executive", pattern: /\bexecutive\b/ },
  { token: "sales", pattern: /\b(sales|revenue|business development)\b/ },
  {
    token: "engineering",
    pattern: /\b(engineering|engineer|developer|software|technology|technical)\b/,
  },
  { token: "product", pattern: /\bproduct\b/ },
  { token: "marketing", pattern: /\bmarketing\b/ },
  {
    token: "customer_success",
    pattern: /\b(customer success|customer support|client success)\b/,
  },
  { token: "operations", pattern: /\b(operations|operational)\b/ },
  { token: "finance", pattern: /\b(finance|financial|accounting)\b/ },
  { token: "people", pattern: /\b(people|human resources|hr|talent)\b/ },
];

/**
 * Classify a job title into seniority and function tokens for role matching.
 */
export function classifyTitle(title: string): TitleClassification {
  const normalized = normalizeTitle(title);
  if (!normalized) {
    return { seniorities: [], functions: [] };
  }

  const seniorities = SENIORITY_PATTERNS.filter(({ pattern }) => pattern.test(normalized)).map(
    ({ token }) => token,
  );

  const functions = FUNCTION_PATTERNS.filter(({ pattern }) => pattern.test(normalized)).map(
    ({ token }) => token,
  );

  // "vice president" is VP seniority, not standalone executive function.
  const filteredFunctions =
    seniorities.includes("vp") && functions.length === 1 && functions[0] === "executive"
      ? []
      : functions;

  return { seniorities, functions: filteredFunctions };
}
