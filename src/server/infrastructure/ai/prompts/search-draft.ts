import { allowedSearchDraftFields } from "../schemas/search-draft";

export function buildParseSearchDraftPrompt(input: { query: string; runId?: string }): string {
  return [
    "Convert the natural-language search request into a draft SearchPlan transport JSON object.",
    "Return a single flat object. Every property listed below MUST be present.",
    "Use null for semanticText/sortBy/sortOrder when not implied. Do not omit properties.",
    "Required properties:",
    allowedSearchDraftFields.join(", "),
    "mode must be one of: leads | timeline | connections.",
    "constraints is an array of { field, operator, rawValue, source }.",
    'source must always be "user". Never invent derived filters.',
    "operator must be one of: eq | gt | gte | lt | lte | contains | semantic_match.",
    'Use gt for wording like "above" / "greater than" / "over".',
    'Use gte for wording like "at least" / "no less than".',
    "Only include constraints explicitly present in the query.",
    "Do NOT invent signalType, seniority, or dateRange unless the user text clearly asks for them.",
    "Put conceptual/descriptive language that is not a hard filter into semanticText.",
    "For timeline queries that mention a company without saying current vs previous, set relationshipAmbiguous=true and keep field=company (do not guess currentCompany).",
    "Examples:",
    '- "CTO at Outcomes.ai with score above 55" -> mode=leads, constraints=[{field:role,operator:eq,rawValue:"CTO",source:user},{field:company,operator:eq,rawValue:"Outcomes.ai",source:user},{field:score,operator:gt,rawValue:55,source:user}], semanticText=null, relationshipAmbiguous=false',
    '- "Technical leaders at OutcomesAI" -> mode=leads, constraints=[{field:company,operator:eq,rawValue:"OutcomesAI",source:user}], semanticText="Technical leaders", relationshipAmbiguous=false',
    '- "Show Siddalingamurthy BG employment timeline from outcomes.ai" -> mode=timeline, constraints=[{field:personName,operator:eq,rawValue:"Siddalingamurthy BG",source:user},{field:company,operator:eq,rawValue:"outcomes.ai",source:user}], relationshipAmbiguous=true',
    '- "People who previously worked at Microsoft" -> mode=timeline, constraints=[{field:previousCompany,operator:eq,rawValue:"Microsoft",source:user}], relationshipAmbiguous=false',
    '- "People from Appknox who overlapped at Microsoft for 90 days" -> mode=connections, constraints=[{field:companyA,operator:eq,rawValue:"Appknox",source:user},{field:companyB,operator:eq,rawValue:"Microsoft",source:user},{field:minOverlapDays,operator:gte,rawValue:90,source:user}], relationshipAmbiguous=false',
    "Do not generate SQL, DDL, DML, database instructions, or table dumps.",
    "If the request asks for DROP/DELETE/UPDATE/SQL/schema contents, return mode=leads with empty constraints and semanticText=null.",
    input.runId ? `Optional run scope: ${input.runId}` : "",
    "",
    `Query: ${input.query}`,
  ]
    .filter(Boolean)
    .join("\n");
}
