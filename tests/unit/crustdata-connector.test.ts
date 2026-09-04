import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/shared/config/env";
import { clearCache } from "@/server/infrastructure/connectors/crustdata/cache";
import {
  buildTitleConditions,
  enrichCompany,
  enrichPerson,
  escapeTitleCondition,
  resetCrustdataClientState,
  searchPeopleByCompany,
} from "@/server/infrastructure/connectors/crustdata/client";
import { resetEndpointLimiters } from "@/server/infrastructure/connectors/crustdata/rate-limiter";
import {
  crustdataCompanyEnrichResponseSchema,
  crustdataPersonEnrichResponseSchema,
  crustdataPersonSearchResponseSchema,
} from "@/server/infrastructure/connectors/crustdata/schemas";

const FIXTURES = join(process.cwd(), "tests/fixtures/crustdata");

function enrichFetchCalls(fetchMock: ReturnType<typeof vi.fn>): unknown[][] {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const href = String(url);
    return href.endsWith("/company/enrich") && init?.method === "POST";
  });
}

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

function setCrustdataEnv(overrides: Record<string, string> = {}): void {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgresql://leadgen:leadgen@localhost:5432/leadgen?sslmode=disable";
  process.env.ENABLE_CRUSTDATA = "true";
  process.env.CRUSTDATA_API_KEY = "test-key";
  process.env.CRUSTDATA_API_BASE_URL = "https://api.crustdata.com";
  process.env.CRUSTDATA_API_VERSION = "2025-11-01";
  process.env.CRUSTDATA_COMPANY_RPM = "60";
  process.env.CRUSTDATA_PERSON_SEARCH_RPM = "60";
  process.env.CRUSTDATA_PERSON_ENRICH_RPM = "60";
  process.env.CRUSTDATA_CACHE_TTL_HOURS = "168";
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
  resetEnvCache();
  resetCrustdataClientState();
  resetEndpointLimiters();
  clearCache();
}

describe("Crustdata connector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setCrustdataEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetCrustdataClientState();
    resetEndpointLimiters();
    clearCache();
    resetEnvCache();
  });

  it("parses current company enrich response envelope", () => {
    const payload = loadFixture("company-enrich-success.json");
    const parsed = crustdataCompanyEnrichResponseSchema.parse(payload);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.matches[0]?.company_data.basic_info?.name).toBe("Appknox");
    expect(parsed[0]?.matches[0]?.company_data.taxonomy?.professional_network_industry).toBe(
      "Computer and Network Security",
    );
  });

  it("sends correct headers and POST body for company enrich", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
        "x-api-version": "2025-11-01",
      });
      const body = JSON.parse(String(init?.body));
      expect(body.domains).toEqual(["appknox.com"]);
      expect(body.exact_match).toBe(true);

      return new Response(JSON.stringify(loadFixture("company-enrich-success.json")), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichCompany("appknox.com");

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.name).toBe("Appknox");
      expect(result.data.industry).toBe("Computer and Network Security");
      expect(result.data.crustdataCompanyId).toBe("1001");
      expect(result.data.founders).toHaveLength(1);
    }
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith("/company/enrich") && init?.method === "POST",
      ),
    ).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("/v1/company");
  });

  it("never calls legacy /v1 endpoints", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(loadFixture("person-search-success.json")), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchPeopleByCompany("appknox.com");

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("/v1/");
    }
  });

  it("treats empty company matches as successful no-match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(loadFixture("company-enrich-empty.json")), { status: 200 }),
      ),
    );

    const result = await enrichCompany("unknown.example");
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.name).toBeNull();
      expect(result.data.industry).toBeNull();
    }
  });

  it("parses person search response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.filters.field).toBe(
          "experience.employment_details.current.company_website_domain",
        );
        expect(body.filters.value).toBe("appknox.com");
        return new Response(JSON.stringify(loadFixture("person-search-success.json")), {
          status: 200,
        });
      }),
    );

    const result = await searchPeopleByCompany("appknox.com");
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data.people[0]?.name).toBe("Priya Sharma");
      expect(result.data.people[0]?.crustdataPersonId).toBe("2003");
    }
  });

  it("parses person enrich with experience history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.professional_network_profile_urls).toContain(
          "https://www.linkedin.com/in/harshit-agarwal-appknox",
        );
        return new Response(JSON.stringify(loadFixture("person-enrich-success.json")), {
          status: 200,
        });
      }),
    );

    const result = await enrichPerson([
      "https://www.linkedin.com/in/harshit-agarwal-appknox",
    ]);

    expect(result.status).toBe("success");
    if (result.status === "success") {
      const person = result.data[0];
      expect(person?.status).toBe("matched");
      expect(person?.experience).toHaveLength(2);
      expect(person?.providerExperienceYears).toBe(12);
    }
    const parsed = crustdataPersonEnrichResponseSchema.parse(
      loadFixture("person-enrich-success.json"),
    );
    expect(
      parsed[0]?.matches[0]?.person_data.experience?.employment_details?.past?.[0]
        ?.company_website_domain,
    ).toBeNull();
  });

  it("accepts redacted person enrich as terminal outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(loadFixture("person-enrich-redacted.json")), { status: 200 }),
      ),
    );

    const result = await enrichPerson(["https://www.linkedin.com/in/redacted"]);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.data[0]?.status).toBe("redacted");
    }
  });

  it("does not retry 400 responses", async () => {
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichCompany("bad.example");
    expect(result.status).toBe("error");
    expect(enrichFetchCalls(fetchMock)).toHaveLength(1);
  });

  it("disables connector on 401", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await enrichCompany("appknox.com");
    expect(first.status).toBe("error");

    const second = await enrichCompany("appknox.com");
    expect(second.status).toBe("disabled");
  });

  it("records 403 without retry storm", async () => {
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichCompany("appknox.com");
    expect(result.status).toBe("error");
    expect(enrichFetchCalls(fetchMock)).toHaveLength(1);
  });

  it("retries 503 with backoff then succeeds", async () => {
    let enrichAttempts = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("/account/endpoints")) {
        return new Response(JSON.stringify({ endpoints: [] }), { status: 200 });
      }
      if (href.endsWith("/company/enrich") && init?.method === "POST") {
        enrichAttempts += 1;
        if (enrichAttempts === 1) {
          return new Response("error", { status: 503 });
        }
        return new Response(JSON.stringify(loadFixture("company-enrich-success.json")), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichCompany("appknox.com");
    expect(result.status).toBe("success");
    expect(enrichAttempts).toBeGreaterThanOrEqual(2);
  });

  it("uses cache on second identical company enrich request", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(loadFixture("company-enrich-success.json")), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await enrichCompany("appknox.com");
    await enrichCompany("appknox.com");

    expect(enrichFetchCalls(fetchMock)).toHaveLength(1);
  });

  it("rejects invalid response envelopes with Zod", () => {
    expect(() =>
      crustdataCompanyEnrichResponseSchema.parse({ unexpected: true }),
    ).toThrow();
    expect(() =>
      crustdataPersonSearchResponseSchema.parse({ profiles: [{ basic_profile: { name: 123 } }] }),
    ).toThrow();
  });

  it("escapes custom titles for provider-safe conditions", () => {
    expect(escapeTitleCondition("VP (Sales)")).toBe("VP \\(Sales\\)");
    expect(buildTitleConditions(["CEO", "VP Sales"])).toEqual(["CEO", "VP Sales"]);
  });

  it("returns disabled when connector is off", async () => {
    setCrustdataEnv({ ENABLE_CRUSTDATA: "false" });
    const result = await enrichCompany("appknox.com");
    expect(result.status).toBe("disabled");
  });
});
