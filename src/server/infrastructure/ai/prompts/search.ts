import { allowedSearchFields } from "../schemas/search-intent";

export function buildParseSearchQueryPrompt(input: {
  query: string;
  runId?: string;
}): string {
  return [
    "Convert the natural-language search request into a SearchIntent JSON object.",
    "SearchIntent is a discriminated union with required field mode: leads | timeline | connections.",
    "Use only these allowlisted fields:",
    allowedSearchFields.join(", "),
    "Examples:",
    '- "Founders at Appknox with score above 30" -> mode=leads, roles=[founder], company=Appknox, scoreThreshold=30',
    '- "Show Subho Halder\'s employment timeline" -> mode=timeline, personName=Subho Halder',
    '- "People who previously worked at Microsoft" -> mode=timeline, previousCompany=Microsoft',
    '- "People from Appknox who overlapped at another company for 90 days" -> mode=connections, companyA=Appknox, minOverlapDays=90',
    "Use canonical sortBy values: score, confidence, freshness, name.",
    "Use canonical sortOrder values: asc, desc.",
    "Do not generate SQL or database instructions.",
    "Omit fields that are not implied by the query.",
    "Always include mode.",
    input.runId ? `Optional run scope: ${input.runId}` : "",
    "",
    `Query: ${input.query}`,
  ]
    .filter(Boolean)
    .join("\n");
}
