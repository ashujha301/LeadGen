import { allowedSearchFields } from "../schemas/search-intent";

export function buildParseSearchQueryPrompt(input: { query: string; runId?: string }): string {
  return [
    "Convert the natural-language search request into a SearchIntent transport JSON object.",
    "Return a single flat object. Every property listed below MUST be present.",
    "Use null for any property that is not implied by the query. Do not omit properties.",
    "Required properties:",
    allowedSearchFields.join(", "),
    "mode must be one of: leads | timeline | connections.",
    "Examples:",
    '- "Founders at Appknox with score above 30" -> mode=leads, roles=["founder"], company="Appknox", scoreThreshold=30, all other fields null',
    '- "Show Subho Halder\'s employment timeline" -> mode=timeline, personName="Subho Halder", all other fields null',
    '- "Show Jane Doe employment timeline from Acme" -> mode=timeline, personName="Jane Doe", currentCompany="Acme", all other fields null',
    '- "People who previously worked at Microsoft" -> mode=timeline, previousCompany="Microsoft", all other fields null',
    '- "People from Appknox who overlapped at another company for 90 days" -> mode=connections, companyA="Appknox", minOverlapDays=90, all other fields null',
    "Mode field rules:",
    "- leads: use company/roles/scoreThreshold/etc. Never personName/currentCompany/previousCompany/companyA.",
    "- timeline: use personName/currentCompany/previousCompany only. Never company/roles/signalType/scoreThreshold.",
    "- connections: use companyA/companyB/personName/minOverlapDays only.",
    "Use canonical sortBy values: score, confidence, freshness, name.",
    "Use canonical sortOrder values: asc, desc.",
    "Do not generate SQL, DDL, DML, database instructions, or table dumps.",
    "If the request asks for DROP/DELETE/UPDATE/SQL/schema contents, refuse by returning mode=leads with all filters null.",
    "Always include mode.",
    input.runId ? `Optional run scope: ${input.runId}` : "",
    "",
    `Query: ${input.query}`,
  ]
    .filter(Boolean)
    .join("\n");
}
