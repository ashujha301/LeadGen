import { z } from "zod";

export const graphNodeSchema = z.object({
  data: z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(["Person", "Company", "BusinessSignal"]),
    confidence: z.number().optional(),
    evidenceIds: z.array(z.string()).optional(),
  }),
});

export const graphEdgeSchema = z.object({
  data: z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    type: z.enum(["CURRENTLY_WORKS_AT", "WORKED_AT", "SHARED_EMPLOYMENT", "HAS_SIGNAL"]),
    label: z.string().optional(),
    role: z.string().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    confidence: z.number().optional(),
    evidenceIds: z.array(z.string()).optional(),
  }),
});

export const graphResponseSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
});

export type GraphResponse = z.infer<typeof graphResponseSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const overlapSearchParamsSchema = z.object({
  companyId: z.string().uuid(),
  personId: z.string().uuid().optional(),
  minOverlapDays: z.coerce.number().int().positive().optional(),
});

export type OverlapSearchParams = z.infer<typeof overlapSearchParamsSchema>;

export const overlapResultSchema = z.object({
  personA: z.object({ id: z.string().uuid(), name: z.string() }),
  personB: z.object({ id: z.string().uuid(), name: z.string() }),
  company: z.object({ id: z.string().uuid(), name: z.string() }),
  overlapStart: z.string().nullable(),
  overlapEnd: z.string().nullable(),
  overlapDays: z.number().int(),
});

export type OverlapResult = z.infer<typeof overlapResultSchema>;
