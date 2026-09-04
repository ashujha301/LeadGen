import { pgEnum } from "drizzle-orm/pg-core";

export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "discovering",
  "extracting",
  "resolving",
  "enriching",
  "scoring",
  "completed",
  "failed",
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "website",
  "rdap",
  "crustdata",
  "email_verifier",
  "manual",
]);

export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "skipped",
]);

export const observationEntityTypeEnum = pgEnum("observation_entity_type", [
  "company",
  "person",
  "employment",
  "contact",
  "signal",
]);

export const aliasTypeEnum = pgEnum("alias_type", ["name", "domain"]);

export const contactTypeEnum = pgEnum("contact_type", ["email", "phone", "linkedin", "other"]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "verified",
  "unverified",
  "invalid",
  "disabled",
]);

export const matchEntityTypeEnum = pgEnum("match_entity_type", ["company", "person"]);

export const entityMatchDecisionEnum = pgEnum("entity_match_decision", [
  "auto_merge",
  "review",
  "separate",
]);

export const aiCallStatusEnum = pgEnum("ai_call_status", [
  "success",
  "error",
  "timeout",
  "refused",
]);

export const aiOperationEnum = pgEnum("ai_operation", [
  "extract_page",
  "parse_search_query",
  "explain_lead",
]);

export const enrichmentStatusEnum = pgEnum("enrichment_status", [
  "pending",
  "matched",
  "not_found",
  "redacted",
  "failed",
]);

export const roleMatchTierEnum = pgEnum("role_match_tier", [
  "exact",
  "synonym",
  "fallback",
  "none",
]);

export const runEventTypeEnum = pgEnum("run_event_type", [
  "run.progress",
  "company.updated",
  "lead.created",
  "lead.updated",
  "lead.merged",
  "run.completed",
  "run.failed",
]);
