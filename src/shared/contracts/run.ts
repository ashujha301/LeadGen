import { z } from "zod";

import { normalizeCompanyInput } from "@/server/domain/normalization/company-input";
import { roleCriteriaSchema } from "./roles";

export const runStatusSchema = z.enum([
  "queued",
  "discovering",
  "extracting",
  "resolving",
  "enriching",
  "scoring",
  "completed",
  "failed",
]);

export type RunStatus = z.infer<typeof runStatusSchema>;

export const icpFilterSchema = z.object({
  industries: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  employeeRange: z
    .object({
      min: z.number().int().nonnegative().optional(),
      max: z.number().int().positive().optional(),
    })
    .optional(),
});

export type IcpFilter = z.infer<typeof icpFilterSchema>;

export const companyInputSchema = z
  .string()
  .trim()
  .min(3)
  .max(2048)
  .superRefine((value, ctx) => {
    if (!normalizeCompanyInput(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid company domain or website URL.",
      });
    }
  })
  .transform((value) => {
    const normalized = normalizeCompanyInput(value)!;
    return {
      input: normalized.input,
      normalizedDomain: normalized.normalizedDomain,
      homepageUrl: normalized.homepageUrl,
    };
  });

export type CompanyInput = z.infer<typeof companyInputSchema>;

const createRunRequestBaseSchema = z.object({
  domain: companyInputSchema,
  icp: icpFilterSchema.optional(),
  roleCriteria: roleCriteriaSchema.optional(),
  targetRoles: z.array(z.string()).optional(),
});

export const createRunRequestSchema = createRunRequestBaseSchema.transform((value) => {
  if (value.roleCriteria) {
    return value;
  }

  if (value.targetRoles?.length) {
    return {
      ...value,
      roleCriteria: {
        seniorities: [],
        functions: [],
        customTitles: value.targetRoles,
      },
    };
  }

  return value;
});

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export const connectorSummarySchema = z.object({
  name: z.string(),
  status: z.enum(["pending", "success", "failed", "skipped", "timeout"]),
  durationMs: z.number().int().nonnegative().optional(),
  errorCode: z.string().optional(),
  recordsReturned: z.number().int().nonnegative().optional(),
});

export type ConnectorSummary = z.infer<typeof connectorSummarySchema>;

export const runEntityCountsSchema = z.object({
  companiesCreated: z.number().int().nonnegative().optional(),
  companiesUpdated: z.number().int().nonnegative().optional(),
  peopleCreated: z.number().int().nonnegative().optional(),
  peopleUpdated: z.number().int().nonnegative().optional(),
  peopleReconfirmed: z.number().int().nonnegative().optional(),
  employmentsCreated: z.number().int().nonnegative().optional(),
  employmentsReconfirmed: z.number().int().nonnegative().optional(),
});

export type RunEntityCounts = z.infer<typeof runEntityCountsSchema>;

export const runProgressSchema = z.object({
  stage: runStatusSchema,
  pagesDiscovered: z.number().int().nonnegative().optional(),
  pagesExtracted: z.number().int().nonnegative().optional(),
  peopleResolved: z.number().int().nonnegative().optional(),
  leadsScored: z.number().int().nonnegative().optional(),
  successfulPages: z.number().int().nonnegative().optional(),
  attemptedPages: z.number().int().nonnegative().optional(),
  discoveredLinks: z.number().int().nonnegative().optional(),
  entityCounts: runEntityCountsSchema.optional(),
  connectors: z.array(connectorSummarySchema).optional(),
});

export type RunProgress = z.infer<typeof runProgressSchema>;

export const runRefreshChangesSchema = z.object({
  companiesCreated: z.number().int().nonnegative(),
  companiesUpdated: z.number().int().nonnegative(),
  peopleCreated: z.number().int().nonnegative(),
  peopleUpdated: z.number().int().nonnegative(),
  peopleReconfirmed: z.number().int().nonnegative(),
  employmentsCreated: z.number().int().nonnegative(),
  employmentsReconfirmed: z.number().int().nonnegative(),
});

export type RunRefreshChanges = z.infer<typeof runRefreshChangesSchema>;

export const runRefreshMetadataSchema = z.object({
  reusedActiveRun: z.boolean(),
  refreshOfRunId: z.string().uuid().nullable(),
  changes: runRefreshChangesSchema.optional(),
});

export type RunRefreshMetadata = z.infer<typeof runRefreshMetadataSchema>;

export const runResponseSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  normalizedDomain: z.string(),
  status: runStatusSchema,
  progress: runProgressSchema.optional(),
  refresh: runRefreshMetadataSchema.optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      recoverable: z.boolean(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export type RunResponse = z.infer<typeof runResponseSchema>;
