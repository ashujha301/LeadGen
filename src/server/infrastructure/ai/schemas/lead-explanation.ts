import { z } from "zod";

export const leadExplanationSchema = z.object({
  summary: z.string().max(500),
  highlights: z.array(z.string().max(200)).max(5),
});

export type LeadExplanation = z.infer<typeof leadExplanationSchema>;

export const LEAD_EXPLANATION_SCHEMA_VERSION = "lead-explanation.v1";

export type ExplainLeadInput = {
  personName: string;
  companyName: string;
  totalScore: number;
  scoreComponents: Array<{
    key: string;
    label: string;
    contribution: number;
    reasonCode: string;
  }>;
  evidence: Array<{
    excerpt: string;
    sourceUrl: string;
    confidence: number;
  }>;
};
