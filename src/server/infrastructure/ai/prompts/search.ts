import { allowedSearchFields } from "../schemas/search-intent";

export function buildParseSearchQueryPrompt(input: {
  query: string;
  runId?: string;
}): string {
  return [
    "Convert the natural-language lead search request into a SearchIntent JSON object.",
    "Use only these allowlisted fields:",
    allowedSearchFields.join(", "),
    "Do not generate SQL or database instructions.",
    "Omit fields that are not implied by the query.",
    input.runId ? `Optional run scope: ${input.runId}` : "",
    "",
    `Query: ${input.query}`,
  ]
    .filter(Boolean)
    .join("\n");
}
