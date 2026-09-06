import { z } from "zod";

const providerIdSchema = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => (value == null ? undefined : String(value)));

export const crustdataPersonRefSchema = z.object({
  crustdata_person_id: providerIdSchema,
  name: z.string().optional(),
  title: z.string().nullable().optional(),
  professional_network_profile_url: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  match_score: z.number().optional(),
});

const crustdataCompanyDataSchema = z.object({
  crustdata_company_id: providerIdSchema,
  updated_at: z.string().optional(),
  basic_info: z
    .object({
      name: z.string().optional(),
      primary_domain: z.string().optional(),
      professional_network_url: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    })
    .optional(),
  headcount: z.object({ total: z.number().nullable().optional() }).optional(),
  taxonomy: z
    .object({ professional_network_industry: z.string().nullable().optional() })
    .optional(),
  locations: z.object({ headquarters: z.string().nullable().optional() }).optional(),
  people: z
    .object({
      founders: z.array(crustdataPersonRefSchema).optional(),
      cxos: z.array(crustdataPersonRefSchema).optional(),
      decision_makers: z.array(crustdataPersonRefSchema).optional(),
    })
    .optional(),
});

const crustdataCompanyMatchSchema = z.object({
  confidence_score: z.number().optional(),
  company_data: crustdataCompanyDataSchema,
});

export const crustdataCompanyEnrichEntrySchema = z.object({
  matched_on: z.string().optional(),
  match_type: z.string().optional(),
  matches: z.array(crustdataCompanyMatchSchema),
});

export const crustdataCompanyEnrichResponseSchema = z.array(crustdataCompanyEnrichEntrySchema);

const crustdataSearchProfileSchema = z.object({
  crustdata_person_id: providerIdSchema,
  basic_profile: z
    .object({
      name: z.string().optional(),
      current_title: z.string().nullable().optional(),
    })
    .optional(),
  social_handles: z
    .object({
      professional_network_identifier: z
        .object({
          profile_url: z.string().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
});

export const crustdataPersonSearchResponseSchema = z.object({
  profiles: z.array(crustdataSearchProfileSchema),
  total_count: z.number().optional(),
  next_cursor: z.string().nullable().optional(),
});

const locationObjectSchema = z
  .object({
    raw: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  })
  .passthrough();

export function normalizeLocationValue(
  value: string | z.infer<typeof locationObjectSchema> | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value.raw === "string" && value.raw.trim()) {
    return value.raw.trim();
  }
  const parts = [value.city, value.state, value.country]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(", ") : null;
}

export function normalizeEmploymentDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

const locationSchema = z
  .union([z.string(), locationObjectSchema, z.null()])
  .optional()
  .transform((value) => normalizeLocationValue(value ?? null));

const employmentDateSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => normalizeEmploymentDate(value ?? null));

const crustdataEmploymentDetailSchema = z
  .object({
    position_id: z.union([z.string(), z.number(), z.null()]).optional(),
    name: z
      .string()
      .nullable()
      .optional()
      .transform((value) => value?.trim() || "Unknown company"),
    crustdata_company_id: providerIdSchema,
    company_website_domain: z.string().nullable().optional(),
    company_professional_network_url: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    start_date: employmentDateSchema,
    end_date: employmentDateSchema,
  })
  .passthrough();

const crustdataPersonDataSchema = z
  .object({
    crustdata_person_id: providerIdSchema,
    updated_at: z.string().optional(),
    basic_profile: z
      .object({
        name: z.string().optional(),
        headline: z.string().nullable().optional(),
        location: locationSchema,
      })
      .passthrough()
      .optional(),
    social_handles: z
      .object({
        professional_network_identifier: z
          .object({
            profile_url: z.string().nullable().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    experience: z
      .object({
        years_of_experience_raw: z.number().nullable().optional(),
        employment_details: z
          .object({
            current: z.array(crustdataEmploymentDetailSchema).optional(),
            past: z.array(crustdataEmploymentDetailSchema).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    education: z
      .object({
        schools: z
          .array(
            z.object({
              school: z.string().optional(),
              degree: z.string().nullable().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    skills: z
      .object({
        professional_network_skills: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough();

const crustdataPersonMatchSchema = z.object({
  confidence_score: z.number().optional(),
  person_data: crustdataPersonDataSchema,
});

export const crustdataPersonEnrichEntrySchema = z
  .object({
    matched_on: z.string().optional(),
    match_type: z.string().optional(),
    match_status: z.enum(["matched", "not_found", "redacted"]).optional(),
    matches: z.array(crustdataPersonMatchSchema),
  })
  .passthrough();

export const crustdataPersonEnrichResponseSchema = z.array(crustdataPersonEnrichEntrySchema);

export const crustdataEndpointInfoSchema = z.object({
  path: z.string(),
  method: z.string(),
  rate_limit: z
    .object({
      requests_per_minute: z.number().optional(),
      effective_requests_per_minute: z.number().optional(),
    })
    .optional(),
});

export const crustdataAccountEndpointsResponseSchema = z.object({
  endpoints: z.array(crustdataEndpointInfoSchema),
});

export type CrustdataCompanyData = z.infer<typeof crustdataCompanyDataSchema>;
export type CrustdataPersonData = z.infer<typeof crustdataPersonDataSchema>;
export type CrustdataSearchProfile = z.infer<typeof crustdataSearchProfileSchema>;
export type CrustdataPersonRef = z.infer<typeof crustdataPersonRefSchema>;
export type CrustdataEmploymentDetail = z.infer<typeof crustdataEmploymentDetailSchema>;
