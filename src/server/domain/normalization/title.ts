const ERROR_PAGE_PATTERNS = [
  /\b404\b/,
  /\b403\b/,
  /\b500\b/,
  /\b502\b/,
  /\b503\b/,
  /\bnot found\b/,
  /\bpage not found\b/,
  /\baccess denied\b/,
  /\bforbidden\b/,
  /\berror\b/,
];

const TITLE_ABBREVIATIONS: Record<string, string> = {
  ceo: "chief executive officer",
  cto: "chief technology officer",
  cfo: "chief financial officer",
  coo: "chief operating officer",
  vp: "vice president",
  svp: "senior vice president",
  evp: "executive vice president",
  md: "managing director",
  gm: "general manager",
};

const WHITESPACE = /\s+/g;
const NON_TITLE_CHARS = /[^\p{L}\p{N}\s&/-]/gu;

export function isErrorPageTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return ERROR_PAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Normalize a job title for comparison.
 */
export function normalizeTitle(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(NON_TITLE_CHARS, " ")
    .replace(WHITESPACE, " ")
    .trim();

  const tokens = normalized.split(" ").map((token) => TITLE_ABBREVIATIONS[token] ?? token);
  return tokens.join(" ");
}

/**
 * Title similarity in [0, 1] using normalized token overlap.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}
