/**
 * Infer comparison operators from natural-language fragments.
 * Strict wording: "above" -> gt, "at least" -> gte.
 */
export function inferComparisonOperator(text: string): "gt" | "gte" | "lt" | "lte" | "eq" {
  const normalized = text.trim().toLowerCase();

  if (/\bat\s+least\b/.test(normalized) || /\bno\s+less\s+than\b/.test(normalized)) {
    return "gte";
  }
  if (/\bat\s+most\b/.test(normalized) || /\bno\s+more\s+than\b/.test(normalized)) {
    return "lte";
  }
  if (
    /\babove\b/.test(normalized) ||
    /\bgreater\s+than\b/.test(normalized) ||
    /\bover\b/.test(normalized)
  ) {
    return "gt";
  }
  if (
    /\bbelow\b/.test(normalized) ||
    /\bless\s+than\b/.test(normalized) ||
    /\bunder\b/.test(normalized)
  ) {
    return "lt";
  }
  if (/\bbefore\b/.test(normalized)) {
    return "lt";
  }
  if (/\bafter\b/.test(normalized)) {
    return "gt";
  }
  return "eq";
}
