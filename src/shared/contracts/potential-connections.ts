import { z } from "zod";

export const strengthBandSchema = z.enum(["strong", "moderate", "weak"]);
export const evidenceQualitySchema = z.enum(["strong", "supported", "limited"]);

export const potentialConnectionsQuerySchema = z.object({
  currentCompanyId: z.string().uuid().optional(),
  sharedEmployer: z.string().min(1).max(200).optional(),
  strengthBand: strengthBandSchema.optional(),
  minOverlapDays: z.coerce.number().int().min(1).max(3650).optional(),
  includeLimited: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (typeof value === "boolean") return value;
      return value === "true";
    }),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type PotentialConnectionsQuery = z.infer<typeof potentialConnectionsQuerySchema>;

const connectionPersonSchema = z.object({
  leadId: z.string().uuid(),
  personId: z.string().uuid(),
  personName: z.string(),
  currentCompanyId: z.string().uuid(),
  currentCompanyName: z.string(),
  title: z.string().nullable(),
  finalScore: z.number(),
  confidence: z.number(),
});

export const potentialConnectionItemSchema = z.object({
  id: z.string().min(1),
  personA: connectionPersonSchema,
  personB: connectionPersonSchema,
  sharedEmployer: z.object({
    key: z.string(),
    name: z.string(),
    domain: z.string().nullable(),
    companyId: z.string().uuid().nullable(),
  }),
  overlapDays: z.number().int(),
  strengthScore: z.number(),
  strengthBand: strengthBandSchema,
  evidenceQuality: evidenceQualitySchema,
  evidenceScore: z.number(),
  reasonCodes: z.array(z.string()),
  roleSegments: z.array(
    z.object({
      personId: z.string().uuid(),
      title: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      isCurrent: z.boolean(),
    }),
  ),
});

export const potentialConnectionsResponseSchema = z.object({
  items: z.array(potentialConnectionItemSchema),
  summary: z.object({
    total: z.number().int(),
    strong: z.number().int(),
    moderate: z.number().int(),
    weak: z.number().int(),
  }),
  facets: z.object({
    currentCompanies: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        count: z.number().int(),
      }),
    ),
    sharedEmployers: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        count: z.number().int(),
      }),
    ),
  }),
  hasActiveRuns: z.boolean(),
  revision: z.string(),
  generatedAt: z.string(),
});

export type PotentialConnectionItem = z.infer<typeof potentialConnectionItemSchema>;
export type PotentialConnectionsResponse = z.infer<typeof potentialConnectionsResponseSchema>;
