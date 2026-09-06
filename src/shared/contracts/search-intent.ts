import { z } from "zod";

const dateRangeSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .optional();

export const leadsSearchIntentSchema = z.object({
  mode: z.literal("leads"),
  roles: z.array(z.string()).optional(),
  seniority: z.array(z.string()).optional(),
  company: z.string().optional(),
  scoreThreshold: z.number().min(0).max(100).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  signalType: z.string().optional(),
  dateRange: dateRangeSchema,
  sortBy: z.enum(["score", "confidence", "freshness", "name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const timelineSearchIntentSchema = z.object({
  mode: z.literal("timeline"),
  personName: z.string().optional(),
  currentCompany: z.string().optional(),
  previousCompany: z.string().optional(),
});

export const connectionsSearchIntentSchema = z.object({
  mode: z.literal("connections"),
  companyA: z.string().min(1),
  companyB: z.string().optional(),
  personName: z.string().optional(),
  minOverlapDays: z.number().int().positive().optional(),
});

export const searchIntentSchema = z.discriminatedUnion("mode", [
  leadsSearchIntentSchema,
  timelineSearchIntentSchema,
  connectionsSearchIntentSchema,
]);

export type SearchIntent = LeadsSearchIntent | TimelineSearchIntent | ConnectionsSearchIntent;
export type LeadsSearchIntent = z.infer<typeof leadsSearchIntentSchema> & {
  scoreOperator?: "gt" | "gte" | "lt" | "lte";
  resolvedCompanyIds?: string[];
  roleAliases?: string[];
  semanticLeadIds?: string[];
};
export type TimelineSearchIntent = z.infer<typeof timelineSearchIntentSchema>;
export type ConnectionsSearchIntent = z.infer<typeof connectionsSearchIntentSchema>;

export const naturalSearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  runId: z.string().uuid().optional(),
});

export type NaturalSearchRequest = z.infer<typeof naturalSearchRequestSchema>;

export const leadSearchResultSchema = z.object({
  leadId: z.string().uuid(),
  personName: z.string(),
  companyName: z.string(),
  score: z.number(),
  confidence: z.number(),
});

export type LeadSearchResult = z.infer<typeof leadSearchResultSchema>;

export const personTimelineResultSchema = z.object({
  personId: z.string().uuid(),
  personName: z.string(),
  leadId: z.string().uuid().nullable().optional(),
  timelineStatus: z.enum(["available", "no_history", "not_found", "redacted", "failed"]),
  totalExperienceYears: z.number().nullable(),
  providerExperienceYears: z.number().nullable(),
  calculatedExperienceMonths: z.number().nullable(),
  employments: z.array(
    z.object({
      companyId: z.string().uuid().nullable(),
      companyName: z.string(),
      title: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      isCurrent: z.boolean(),
      employerDomain: z.string().nullable().optional(),
    }),
  ),
});

export type PersonTimelineResult = z.infer<typeof personTimelineResultSchema>;

export const connectionSearchResultSchema = z.object({
  personA: z.object({ id: z.string().uuid(), name: z.string() }),
  personB: z.object({ id: z.string().uuid(), name: z.string() }),
  company: z.object({ id: z.string().uuid(), name: z.string() }),
  overlapStart: z.string().nullable(),
  overlapEnd: z.string().nullable(),
  overlapDays: z.number().int(),
});

export type ConnectionSearchResult = z.infer<typeof connectionSearchResultSchema>;

export const naturalSearchResponseSchema = z.object({
  interpretation: z.object({
    intent: searchIntentSchema,
    parser: z.literal("openai"),
    summary: z.string(),
  }),
  result: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("leads"), items: z.array(leadSearchResultSchema) }),
    z.object({ kind: z.literal("timelines"), items: z.array(personTimelineResultSchema) }),
    z.object({ kind: z.literal("connections"), items: z.array(connectionSearchResultSchema) }),
  ]),
});

export type NaturalSearchResponse = z.infer<typeof naturalSearchResponseSchema>;

export const timelineStatusSchema = z.enum([
  "available",
  "no_history",
  "not_found",
  "redacted",
  "failed",
]);

export type TimelineStatus = z.infer<typeof timelineStatusSchema>;
