import { z } from "zod";

export const personSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  normalizedName: z.string(),
  profileUrl: z.string().url().nullable(),
  confidence: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Person = z.infer<typeof personSchema>;

export const personDetailSchema = personSchema.extend({
  contacts: z.array(
    z.object({
      type: z.enum(["email", "phone", "linkedin", "other"]),
      value: z.string(),
      verificationStatus: z.enum(["verified", "unverified", "invalid", "disabled"]),
      confidence: z.number(),
    }),
  ),
  employments: z.array(
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
  evidence: z.array(
    z.object({
      id: z.string().uuid(),
      sourceUrl: z.string(),
      excerpt: z.string(),
      observedAt: z.string().datetime(),
    }),
  ),
});

export type PersonDetail = z.infer<typeof personDetailSchema>;
