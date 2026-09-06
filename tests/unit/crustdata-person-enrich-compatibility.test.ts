import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  normalizeEmploymentDate,
  normalizeLocationValue,
  crustdataPersonEnrichResponseSchema,
} from "@/server/infrastructure/connectors/crustdata/schemas";
import {
  parsePersonEnrich,
  sanitizeCrustdataError,
} from "@/server/infrastructure/connectors/crustdata/client";
import { enrichPerson } from "@/server/infrastructure/connectors/crustdata/client";

const FIXTURES = join(process.cwd(), "tests/fixtures/crustdata");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

describe("crustdata person enrich compatibility", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    process.env.ENABLE_CRUSTDATA = "true";
    process.env.CRUSTDATA_API_KEY = "test-key";
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost/leadgen_test";
  });

  it("accepts official object-shaped location", () => {
    const payload = loadFixture("person-enrich-object-location.json");
    const parsed = crustdataPersonEnrichResponseSchema.parse(payload);
    expect(parsed[0]?.matches[0]?.person_data.basic_profile?.location).toBe(
      "Bengaluru, Karnataka, India",
    );
  });

  it("accepts legacy string location and null", () => {
    expect(normalizeLocationValue("San Francisco")).toBe("San Francisco");
    expect(normalizeLocationValue(null)).toBeNull();
    expect(normalizeLocationValue({ city: "Austin", state: "TX", country: "US" })).toBe(
      "Austin, TX, US",
    );
  });

  it("normalizes ISO date-time and date-only values", () => {
    expect(normalizeEmploymentDate("2014-01-15T00:00:00Z")).toBe("2014-01-15");
    expect(normalizeEmploymentDate("2010-06-01")).toBe("2010-06-01");
    expect(normalizeEmploymentDate(null)).toBeNull();
  });

  it("maps crustdata company id and dates from object-location fixture", () => {
    const results = parsePersonEnrich(loadFixture("person-enrich-object-location.json"));
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("matched");
    expect(results[0]?.location).toBe("Bengaluru, Karnataka, India");
    expect(results[0]?.experience).toHaveLength(3);
    expect(results[0]?.experience[0]?.crustdataCompanyId).toBe("501");
    expect(results[0]?.experience[0]?.startDate).toBe("2014-01-15");
    expect(results[0]?.experience[1]?.endDate).toBe("2013-12-31");
  });

  it("accepts null crustdata_company_id on past employment instead of failing the whole enrich", () => {
    const payload = [
      {
        matched_on: "https://www.linkedin.com/in/srinivasansrinath/",
        match_status: "matched",
        matches: [
          {
            person_data: {
              basic_profile: { name: "Srinath Srinivasan" },
              experience: {
                employment_details: {
                  current: [
                    {
                      name: "Current Co",
                      title: "Engineer",
                      crustdata_company_id: 101,
                      start_date: "2020-01-01",
                    },
                  ],
                  past: [
                    {
                      name: "Past Co",
                      title: "Intern",
                      crustdata_company_id: null,
                      start_date: "2018-01-01",
                      end_date: "2019-12-31",
                    },
                  ],
                },
              },
            },
          },
        ],
      },
    ];

    const results = parsePersonEnrich(payload);
    expect(results[0]?.status).toBe("matched");
    expect(results[0]?.experience).toHaveLength(2);
    expect(results[0]?.experience[0]?.crustdataCompanyId).toBe("101");
    expect(results[0]?.experience[1]?.crustdataCompanyId).toBeNull();
  });

  it("uses matched_on when returned profile URL is absent", () => {
    const payload = [
      {
        matched_on: "https://www.linkedin.com/in/subhohalder",
        match_status: "matched",
        matches: [
          {
            person_data: {
              basic_profile: { name: "Subho Halder" },
              experience: {
                employment_details: {
                  current: [{ name: "Appknox", title: "Founder", start_date: "2014-01-01" }],
                },
              },
            },
          },
        ],
      },
    ];
    const results = parsePersonEnrich(payload);
    expect(results[0]?.linkedinUrl).toBe("https://www.linkedin.com/in/subhohalder");
    expect(results[0]?.matchedOn).toBe("https://www.linkedin.com/in/subhohalder");
  });

  it("keeps a valid entry when a sibling entry is malformed", () => {
    const payload = [
      { match_status: "matched", matches: "not-an-array" },
      loadFixture("person-enrich-success.json")[0],
    ];
    const results = parsePersonEnrich(payload);
    expect(results[0]?.status).toBe("failed");
    expect(results[0]?.schemaFailurePath).toBeTruthy();
    expect(results[1]?.status).toBe("matched");
    expect(results[1]?.experience.length).toBeGreaterThan(0);
  });

  it("preserves not_found and redacted terminal outcomes", () => {
    expect(
      parsePersonEnrich([
        { match_status: "not_found", matched_on: "https://linkedin.com/in/x", matches: [] },
      ])[0]?.status,
    ).toBe("not_found");
    expect(
      parsePersonEnrich([
        { match_status: "redacted", matched_on: "https://linkedin.com/in/y", matches: [] },
      ])[0]?.status,
    ).toBe("redacted");
  });

  it("sanitizes HTTP 400 reason without leaking secrets", () => {
    const sanitized = sanitizeCrustdataError({
      type: "validation_error",
      reason: "fields must be an array",
      request_id: "req_123",
      authorization: "Bearer secret",
    });
    expect(sanitized.reason).toBe("fields must be an array");
    expect(sanitized.requestId).toBe("req_123");
    expect(JSON.stringify(sanitized)).not.toContain("Bearer");
  });

  it("requests only basic_profile, social_handles, and experience", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.fields).toEqual(["basic_profile", "social_handles", "experience"]);
        return new Response(JSON.stringify(loadFixture("person-enrich-object-location.json")), {
          status: 200,
        });
      }),
    );

    const result = await enrichPerson(["https://www.linkedin.com/in/subhohalder"]);
    expect(result.status).toBe("success");
  });
});
