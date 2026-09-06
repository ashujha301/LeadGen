import { z } from "zod";
import {
  connectionSearchResultSchema,
  leadSearchResultSchema,
  personTimelineResultSchema,
} from "./search-intent";

export const searchConstraintOperatorSchema = z.enum([
  "eq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "semantic_match",
]);

export type SearchConstraintOperator = z.infer<typeof searchConstraintOperatorSchema>;

export const searchConstraintFieldSchema = z.enum([
  "role",
  "seniority",
  "company",
  "personName",
  "currentCompany",
  "previousCompany",
  "companyA",
  "companyB",
  "score",
  "confidence",
  "signalType",
  "dateRange",
  "minOverlapDays",
  "relationship",
]);

export type SearchConstraintField = z.infer<typeof searchConstraintFieldSchema>;

export const searchConstraintSourceSchema = z.enum(["user", "derived"]);

export const draftSearchConstraintSchema = z.object({
  field: searchConstraintFieldSchema,
  operator: searchConstraintOperatorSchema,
  rawValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  source: searchConstraintSourceSchema,
});

export type DraftSearchConstraint = z.infer<typeof draftSearchConstraintSchema>;

export const appliedFilterSchema = z.object({
  field: z.string(),
  label: z.string(),
  operator: searchConstraintOperatorSchema.optional(),
  rawValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  matchStrategy: z.string().optional(),
});

export type AppliedFilter = z.infer<typeof appliedFilterSchema>;

export const clarificationOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  slot: z.string().min(1),
  prompt: z.string().min(1),
  selection: z.enum(["single_select", "multi_select"]),
  allowCustomAnswer: z.boolean(),
  options: z.array(clarificationOptionSchema).max(5),
});

export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;

export const wideningOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  estimatedCount: z.number().int().nonnegative().optional(),
  executed: z.boolean().default(false),
});

export type WideningOption = z.infer<typeof wideningOptionSchema>;

export const naturalSearchInterpretationV2Schema = z.object({
  summary: z.string(),
  appliedFilters: z.array(appliedFilterSchema),
  semanticPhrase: z.string().nullable().optional(),
  warnings: z.array(z.string()).default([]),
  widened: z.boolean().default(false),
});

export type NaturalSearchInterpretationV2 = z.infer<typeof naturalSearchInterpretationV2Schema>;

const resultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("leads"), items: z.array(leadSearchResultSchema) }),
  z.object({ kind: z.literal("timelines"), items: z.array(personTimelineResultSchema) }),
  z.object({ kind: z.literal("connections"), items: z.array(connectionSearchResultSchema) }),
]);

export const naturalSearchCompletedResponseSchema = z.object({
  status: z.literal("completed"),
  interpretation: naturalSearchInterpretationV2Schema,
  result: resultSchema,
});

export const naturalSearchClarificationResponseSchema = z.object({
  status: z.literal("needs_clarification"),
  sessionId: z.string().uuid(),
  version: z.number().int().positive(),
  expiresAt: z.string(),
  questions: z.array(clarificationQuestionSchema).max(3),
  interpretation: naturalSearchInterpretationV2Schema.optional(),
});

export const naturalSearchNoResultsResponseSchema = z.object({
  status: z.literal("no_results"),
  sessionId: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  expiresAt: z.string().optional(),
  interpretation: naturalSearchInterpretationV2Schema,
  wideningOptions: z.array(wideningOptionSchema),
});

export const naturalSearchV2ResponseSchema = z.discriminatedUnion("status", [
  naturalSearchCompletedResponseSchema,
  naturalSearchClarificationResponseSchema,
  naturalSearchNoResultsResponseSchema,
]);

export type NaturalSearchV2Response = z.infer<typeof naturalSearchV2ResponseSchema>;

export const naturalSearchResolveAnswerSchema = z.object({
  questionId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).optional(),
  customAnswer: z.string().min(1).max(200).optional(),
});

export const naturalSearchResolveRequestSchema = z
  .object({
    version: z.number().int().positive(),
    answers: z.array(naturalSearchResolveAnswerSchema).max(3).default([]),
    wideningOptionId: z.string().min(1).optional(),
  })
  .refine((value) => value.answers.length > 0 || Boolean(value.wideningOptionId), {
    message: "Provide clarification answers or a widening option",
  });

export type NaturalSearchResolveRequest = z.infer<typeof naturalSearchResolveRequestSchema>;
