export {
  createStructuredResponse,
  isOpenAiEnabled,
  resetOpenAiClient,
  type AiOperation,
  type StructuredAiRequest,
  type StructuredAiResult,
} from "./client";

export { extractPage, type ExtractPageInput, type ExtractPageResult } from "./extract-page";

export {
  parseSearchQuery,
  fallbackParseSearchQuery,
  type ParseSearchQueryInput,
  type ParseSearchQueryResult,
} from "./parse-search-query";

export {
  explainLead,
  buildFallbackExplanation,
  type ExplainLeadInput,
  type ExplainLeadResult,
} from "./explain-lead";

export {
  pageExtractionOutputSchema,
  PAGE_EXTRACTION_SCHEMA_VERSION,
  type PageExtractionOutput,
} from "./schemas/page-extraction";

export {
  searchIntentOutputSchema,
  SEARCH_INTENT_SCHEMA_VERSION,
  allowedSearchFields,
  type SearchIntentOutput,
  type AllowedSearchField,
} from "./schemas/search-intent";

export {
  leadExplanationSchema,
  LEAD_EXPLANATION_SCHEMA_VERSION,
  type LeadExplanation,
} from "./schemas/lead-explanation";

export { buildExtractPagePrompt } from "./prompts/extract";
export { buildParseSearchQueryPrompt } from "./prompts/search";
export { buildExplainLeadPrompt } from "./prompts/explain";
