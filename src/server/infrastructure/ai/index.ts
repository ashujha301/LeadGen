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
  type ParseSearchQueryInput,
  type ParseSearchQueryResult,
} from "./parse-search-query";

export { parseSearchDraftPlan, type ParseSearchDraftInput } from "./parse-search-draft";

export {
  embedQueryText,
  embedDocumentsBatch,
  hashDocumentContent,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_BATCH_SIZE,
} from "./embeddings";

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
  searchIntentAiTransportSchema,
  mapAiTransportToSearchIntent,
  SEARCH_INTENT_SCHEMA_VERSION,
  allowedSearchFields,
  type SearchIntentOutput,
  type SearchIntentAiTransport,
  type AllowedSearchField,
} from "./schemas/search-intent";

export {
  searchDraftAiTransportSchema,
  SEARCH_DRAFT_SCHEMA_VERSION,
  allowedSearchDraftFields,
  type SearchDraftAiTransport,
} from "./schemas/search-draft";

export {
  leadExplanationSchema,
  LEAD_EXPLANATION_SCHEMA_VERSION,
  type LeadExplanation,
} from "./schemas/lead-explanation";

export { buildExtractPagePrompt } from "./prompts/extract";
export { buildParseSearchQueryPrompt } from "./prompts/search";
export { buildParseSearchDraftPrompt } from "./prompts/search-draft";
export { buildExplainLeadPrompt } from "./prompts/explain";
