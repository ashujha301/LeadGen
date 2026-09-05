export {
  compileSearchIntent,
  executeStructuredSearch,
  sanitizeSearchIntent,
  hasEmploymentOverlapIntent,
  getAllowedSortFields,
  getAllowedSortOrders,
  getRoleFilterValues,
  usesCompanyJoin,
  usesEmploymentJoin,
  usesSignalJoin,
  buildSearchIntentSummary,
  filterResultsByLeadIds,
  mergeSearchIntents,
  intentRequiresRunScope,
  buildInArrayCondition,
  type CompiledSearchQuery,
  type StructuredSearchResult,
} from "./structured-search";

export { runNaturalSearch, NaturalSearchError, type NaturalSearchOptions } from "./natural-search";
