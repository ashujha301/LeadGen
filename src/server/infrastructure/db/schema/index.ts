export * from "./enums";
export * from "./helpers";
export * from "./search-runs";
export * from "./source-documents";
export * from "./observations";
export * from "./companies";
export * from "./company-aliases";
export * from "./people";
export * from "./employments";
export * from "./contact-points";
export * from "./business-signals";
export * from "./entity-matches";
export * from "./lead-candidates";
export * from "./score-components";
export * from "./ai-calls";
export * from "./connector-attempts";
export * from "./request-limits";
export * from "./run-events";
export * from "./person-external-profiles";
export * from "./company-external-profiles";
export * from "./person-experience-metrics";
export * from "./merge-audits";

import { relations } from "drizzle-orm";

import { personExperienceMetrics } from "./person-experience-metrics";
import { personExternalProfiles } from "./person-external-profiles";
import { companyExternalProfiles } from "./company-external-profiles";
import { runEvents } from "./run-events";

import { aiCalls } from "./ai-calls";
import { businessSignals } from "./business-signals";
import { companies } from "./companies";
import { companyAliases } from "./company-aliases";
import { connectorAttempts } from "./connector-attempts";
import { contactPoints } from "./contact-points";
import { employments } from "./employments";
import { leadCandidates } from "./lead-candidates";
import { observations } from "./observations";
import { people } from "./people";
import { scoreComponents } from "./score-components";
import { searchRuns } from "./search-runs";
import { sourceDocuments } from "./source-documents";

export const searchRunsRelations = relations(searchRuns, ({ many }) => ({
  sourceDocuments: many(sourceDocuments),
  leadCandidates: many(leadCandidates),
  aiCalls: many(aiCalls),
  connectorAttempts: many(connectorAttempts),
  runEvents: many(runEvents),
}));

export const sourceDocumentsRelations = relations(sourceDocuments, ({ one, many }) => ({
  run: one(searchRuns, {
    fields: [sourceDocuments.runId],
    references: [searchRuns.id],
  }),
  observations: many(observations),
}));

export const observationsRelations = relations(observations, ({ one }) => ({
  sourceDocument: one(sourceDocuments, {
    fields: [observations.sourceDocumentId],
    references: [sourceDocuments.id],
  }),
}));

export const companiesRelations = relations(companies, ({ many }) => ({
  aliases: many(companyAliases),
  employments: many(employments),
  contactPoints: many(contactPoints),
  businessSignals: many(businessSignals),
  leadCandidates: many(leadCandidates),
  externalProfiles: many(companyExternalProfiles),
}));

export const companyAliasesRelations = relations(companyAliases, ({ one }) => ({
  company: one(companies, {
    fields: [companyAliases.companyId],
    references: [companies.id],
  }),
}));

export const peopleRelations = relations(people, ({ one, many }) => ({
  employments: many(employments),
  contactPoints: many(contactPoints),
  leadCandidates: many(leadCandidates),
  externalProfiles: many(personExternalProfiles),
  experienceMetrics: many(personExperienceMetrics),
  mergedInto: one(people, {
    fields: [people.mergedIntoPersonId],
    references: [people.id],
    relationName: "personMerge",
  }),
}));

export const employmentsRelations = relations(employments, ({ one }) => ({
  person: one(people, {
    fields: [employments.personId],
    references: [people.id],
  }),
  company: one(companies, {
    fields: [employments.companyId],
    references: [companies.id],
  }),
}));

export const contactPointsRelations = relations(contactPoints, ({ one }) => ({
  person: one(people, {
    fields: [contactPoints.personId],
    references: [people.id],
  }),
  company: one(companies, {
    fields: [contactPoints.companyId],
    references: [companies.id],
  }),
}));

export const businessSignalsRelations = relations(businessSignals, ({ one }) => ({
  company: one(companies, {
    fields: [businessSignals.companyId],
    references: [companies.id],
  }),
  sourceDocument: one(sourceDocuments, {
    fields: [businessSignals.sourceDocumentId],
    references: [sourceDocuments.id],
  }),
}));

export const leadCandidatesRelations = relations(leadCandidates, ({ one, many }) => ({
  run: one(searchRuns, {
    fields: [leadCandidates.runId],
    references: [searchRuns.id],
  }),
  person: one(people, {
    fields: [leadCandidates.personId],
    references: [people.id],
  }),
  company: one(companies, {
    fields: [leadCandidates.companyId],
    references: [companies.id],
  }),
  scoreComponents: many(scoreComponents),
}));

export const scoreComponentsRelations = relations(scoreComponents, ({ one }) => ({
  leadCandidate: one(leadCandidates, {
    fields: [scoreComponents.leadCandidateId],
    references: [leadCandidates.id],
  }),
}));

export const aiCallsRelations = relations(aiCalls, ({ one }) => ({
  run: one(searchRuns, {
    fields: [aiCalls.runId],
    references: [searchRuns.id],
  }),
}));

export const connectorAttemptsRelations = relations(connectorAttempts, ({ one }) => ({
  run: one(searchRuns, {
    fields: [connectorAttempts.runId],
    references: [searchRuns.id],
  }),
}));

export const runEventsRelations = relations(runEvents, ({ one }) => ({
  run: one(searchRuns, {
    fields: [runEvents.runId],
    references: [searchRuns.id],
  }),
}));

export const personExternalProfilesRelations = relations(personExternalProfiles, ({ one }) => ({
  person: one(people, {
    fields: [personExternalProfiles.personId],
    references: [people.id],
  }),
}));

export const companyExternalProfilesRelations = relations(companyExternalProfiles, ({ one }) => ({
  company: one(companies, {
    fields: [companyExternalProfiles.companyId],
    references: [companies.id],
  }),
}));

export const personExperienceMetricsRelations = relations(personExperienceMetrics, ({ one }) => ({
  person: one(people, {
    fields: [personExperienceMetrics.personId],
    references: [people.id],
  }),
}));
