export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (code !== "23505") {
    return false;
  }

  if (!constraint) {
    return true;
  }

  const actual = (error as { constraint?: unknown }).constraint;
  if (typeof actual !== "string") {
    return true;
  }

  return actual === constraint;
}
