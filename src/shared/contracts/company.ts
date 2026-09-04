import { z } from "zod";

export const companySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  normalizedDomain: z.string(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  employeeCount: z.number().int().nullable(),
  confidence: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  aliases: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Company = z.infer<typeof companySchema>;

export const companyDetailSchema = companySchema.extend({
  businessSignals: z.array(
    z.object({
      type: z.string(),
      value: z.string(),
      confidence: z.number(),
      observedAt: z.string().datetime(),
    }),
  ),
  people: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      title: z.string().nullable(),
      isCurrent: z.boolean(),
    }),
  ),
  evidence: z.array(
    z.object({
      id: z.string().uuid(),
      sourceUrl: z.string(),
      excerpt: z.string(),
      observedAt: z.string().datetime(),
    }),
  ),
});

export type CompanyDetail = z.infer<typeof companyDetailSchema>;
