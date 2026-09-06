export class NaturalSearchError extends Error {
  constructor(
    public readonly code:
      | "AI_UNAVAILABLE"
      | "SEARCH_NOT_UNDERSTOOD"
      | "UPSTREAM_TIMEOUT"
      | "SERVICE_UNAVAILABLE"
      | "AMBIGUOUS_PERSON"
      | "VALIDATION_ERROR"
      | "NOT_FOUND"
      | "SESSION_EXPIRED"
      | "VERSION_CONFLICT",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NaturalSearchError";
  }
}
