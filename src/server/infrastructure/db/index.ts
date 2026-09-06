export { getPool, getDb, closeDb, type Db } from "./client";

export * from "./schema/index";

export * as runsRepo from "./repositories/runs";
export * as sourcesRepo from "./repositories/sources";
export * as entitiesRepo from "./repositories/entities";
export * as leadsRepo from "./repositories/leads";
export * as aiCallsRepo from "./repositories/ai-calls";
export * as searchProvenanceRepo from "./repositories/search-provenance";
export * as connectorAttemptsRepo from "./repositories/connector-attempts";
export * as requestLimitsRepo from "./repositories/request-limits";
export * as runEventsRepo from "./repositories/run-events";
export * as highValueLeadsRepo from "./repositories/high-value-leads";
export * as ownershipRepo from "./repositories/ownership";
export { startOfUtcDay } from "./repositories/request-limits";
export {
  userOwnsPerson,
  userOwnsCompany,
  listOwnedPersonIdsForCompany,
  listOwnedCompanyIdsForPerson,
} from "./repositories/ownership";
export { withAdvisoryLock, buildPersonLockKey } from "./advisory-lock";

export type { CreateRunInput } from "./repositories/runs";
export type { ObservationContext } from "./repositories/entities";
export type { CreateSourceDocumentInput } from "./repositories/sources";
export type { LeadWithRelations, LeadsPage, LeadsScope } from "./repositories/leads";
