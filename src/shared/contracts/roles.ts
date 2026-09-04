import { z } from "zod";

export const seniorityTokenSchema = z.enum([
  "founder",
  "owner",
  "c_suite",
  "vp",
  "head",
  "director",
  "manager",
]);

export type SeniorityToken = z.infer<typeof seniorityTokenSchema>;

export const functionTokenSchema = z.enum([
  "executive",
  "sales",
  "engineering",
  "product",
  "marketing",
  "customer_success",
  "operations",
  "finance",
  "people",
]);

export type FunctionToken = z.infer<typeof functionTokenSchema>;

export const roleCriteriaSchema = z.object({
  seniorities: z.array(seniorityTokenSchema).default([]),
  functions: z.array(functionTokenSchema).default([]),
  customTitles: z.array(z.string()).default([]),
});

export type RoleCriteria = z.infer<typeof roleCriteriaSchema>;
