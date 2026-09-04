import { z } from "zod";

export const searchIntentSchema = z.object({
  roles: z.array(z.string()).optional(),
  seniority: z.array(z.string()).optional(),
  scoreThreshold: z.number().min(0).max(100).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  company: z.string().optional(),
  previousCompany: z.string().optional(),
  signalType: z.string().optional(),
  employmentOverlap: z
    .object({
      companyA: z.string(),
      companyB: z.string().optional(),
      minOverlapDays: z.number().int().positive().optional(),
    })
    .optional(),
  dateRange: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
  sortBy: z.enum(["score", "confidence", "freshness", "name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type SearchIntent = z.infer<typeof searchIntentSchema>;

export const naturalSearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  runId: z.string().uuid().optional(),
});

export type NaturalSearchRequest = z.infer<typeof naturalSearchRequestSchema>;

export const naturalSearchResponseSchema = z.object({
  intent: searchIntentSchema,
  results: z.array(
    z.object({
      leadId: z.string().uuid(),
      personName: z.string(),
      companyName: z.string(),
      score: z.number(),
      confidence: z.number(),
    }),
  ),
});

export type NaturalSearchResponse = z.infer<typeof naturalSearchResponseSchema>;
