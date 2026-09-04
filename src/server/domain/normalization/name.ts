const WHITESPACE = /\s+/g;
const NON_NAME_CHARS = /[^\p{L}\p{N}\s'-]/gu;

/**
 * Normalize a person or company name for comparison.
 */
export function normalizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(NON_NAME_CHARS, " ")
    .replace(WHITESPACE, " ")
    .trim();
}

/**
 * Token-sort ratio similarity in [0, 1].
 */
export function nameSimilarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const leftTokens = left.split(" ").sort().join(" ");
  const rightTokens = right.split(" ").sort().join(" ");

  if (leftTokens === rightTokens) {
    return 1;
  }

  const distance = levenshtein(leftTokens, rightTokens);
  const maxLen = Math.max(leftTokens.length, rightTokens.length);
  return maxLen === 0 ? 0 : 1 - distance / maxLen;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}
