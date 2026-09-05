import { z } from "zod";

export const scoreComponentSchema = z.object({
  key: z.string(),
  weight: z.number(),
  rawValue: z.number(),
  contribution: z.number(),
  reasonCode: z.string(),
  label: z.string(),
});

export type ScoreComponent = z.infer<typeof scoreComponentSchema>;

export const evidenceSchema = z.object({
  id: z.string().uuid(),
  sourceUrl: z.string().url(),
  excerpt: z.string(),
  observedAt: z.string().datetime(),
  confidence: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
});

export type Evidence = z.infer<typeof evidenceSchema>;

export const leadSummarySchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  companyId: z.string().uuid(),
  personName: z.string(),
  title: z.string().nullable(),
  companyName: z.string(),
  score: z.number().min(0).max(100),
  contactability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  keyReason: z.string(),
  hasEmail: z.boolean(),
  hasPhone: z.boolean(),
  roleMatch: z.boolean(),
  roleMatchReasons: z.array(z.string()),
  linkedinUrl: z.string().nullable(),
  totalExperienceYears: z.number().nullable(),
  experienceConfidence: z.number().nullable(),
  enrichmentStatus: z.enum(["pending", "matched", "not_found", "redacted", "failed"]),
  providerUpdatedAt: z.string().datetime().nullable(),
  scoreVersion: z.number().int().positive(),
  roleMatchTier: z.enum(["exact", "synonym", "fallback", "none"]),
  roleSimilarity: z.number().min(0).max(1),
  roleMatchFinal: z.boolean(),
});

export type LeadSummary = z.infer<typeof leadSummarySchema>;

export const leadDetailSchema = leadSummarySchema.extend({
  explanation: z.string(),
  scoreComponents: z.array(scoreComponentSchema),
  evidence: z.array(evidenceSchema),
  businessSignals: z.array(
    z.object({
      type: z.string(),
      value: z.string(),
      confidence: z.number(),
      observedAt: z.string().datetime(),
    }),
  ),
  conflicts: z.array(
    z.object({
      attribute: z.string(),
      values: z.array(z.string()),
    }),
  ),
  employmentHistory: z.array(
    z.object({
      companyId: z.string().uuid().nullable(),
      companyName: z.string(),
      title: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      isCurrent: z.boolean(),
      confidence: z.number(),
      employerDomain: z.string().nullable().optional(),
    }),
  ),
  timelineStatus: z.enum(["available", "no_history", "not_found", "redacted", "failed"]).optional(),
  totalExperienceYears: z.number().nullable().optional(),
  calculatedExperienceMonths: z.number().nullable().optional(),
  providerExperienceYears: z.number().nullable().optional(),
});

export type LeadDetail = z.infer<typeof leadDetailSchema>;
