import { z } from "zod";

export const observationSchema = z.object({
  entityType: z.enum(["company", "person", "employment", "contact", "signal"]),
  attribute: z.string(),
  rawValue: z.string(),
  normalizedValue: z.string().optional(),
  confidence: z.number().min(0).max(1),
  sourceDocumentId: z.string().uuid(),
  evidenceSpan: z
    .object({
      start: z.number().int(),
      end: z.number().int(),
      text: z.string(),
    })
    .optional(),
});

export type Observation = z.infer<typeof observationSchema>;

const evidenceSpanSchema = z
  .object({
    start: z.number().int(),
    end: z.number().int(),
    text: z.string(),
  })
  .nullable();

export const pageExtractionSchema = z.object({
  companyFacts: z.array(
    z.object({
      attribute: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1),
      evidenceSpan: evidenceSpanSchema,
    }),
  ),
  people: z.array(
    z.object({
      name: z.string(),
      title: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      profileUrl: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      evidenceSpan: evidenceSpanSchema,
      currentCompanyAffiliation: z.boolean().nullable(),
      relationshipToCompany: z
        .enum(["employee", "article_subject", "quoted_person", "unknown"])
        .nullable(),
    }),
  ),
  businessSignals: z.array(
    z.object({
      type: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1),
      evidenceSpan: evidenceSpanSchema,
    }),
  ),
});

export type PageExtraction = z.infer<typeof pageExtractionSchema>;

export type NormalizedPageExtraction = {
  companyFacts: Array<{
    attribute: string;
    value: string;
    confidence: number;
    evidenceSpan?: { start: number; end: number; text: string };
  }>;
  people: Array<{
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    profileUrl?: string;
    confidence: number;
    evidenceSpan?: { start: number; end: number; text: string };
    currentCompanyAffiliation?: boolean;
    relationshipToCompany?: "employee" | "article_subject" | "quoted_person" | "unknown";
  }>;
  businessSignals: Array<{
    type: string;
    value: string;
    confidence: number;
    evidenceSpan?: { start: number; end: number; text: string };
  }>;
};

/** Convert nullable OpenAI output fields into optional internal fields. */
export function normalizePageExtraction(extraction: PageExtraction): NormalizedPageExtraction {
  return {
    companyFacts: extraction.companyFacts.map((fact) => ({
      ...fact,
      evidenceSpan: fact.evidenceSpan ?? undefined,
    })),
    people: extraction.people.map((person) => ({
      ...person,
      title: person.title ?? undefined,
      email: person.email ?? undefined,
      phone: person.phone ?? undefined,
      profileUrl: person.profileUrl ?? undefined,
      evidenceSpan: person.evidenceSpan ?? undefined,
      currentCompanyAffiliation: person.currentCompanyAffiliation ?? undefined,
      relationshipToCompany: person.relationshipToCompany ?? undefined,
    })),
    businessSignals: extraction.businessSignals.map((signal) => ({
      ...signal,
      evidenceSpan: signal.evidenceSpan ?? undefined,
    })),
  };
}
