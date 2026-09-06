import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";

import {
  SEARCH_INTENT_SCHEMA_VERSION,
  mapAiTransportToSearchIntent,
  searchIntentAiTransportSchema,
} from "@/server/infrastructure/ai/schemas/search-intent";
import { NaturalSearchError } from "@/server/application/search/natural-search-error";

function isNullableProperty(prop: Record<string, unknown>): boolean {
  if (prop.nullable === true) return true;
  const types = Array.isArray(prop.type) ? prop.type : [prop.type];
  if (types.includes("null")) return true;
  if (Array.isArray(prop.anyOf)) {
    return (prop.anyOf as Array<Record<string, unknown>>).some((entry) => entry.type === "null");
  }
  return false;
}

function assertStrictOpenAiObjectSchema(schema: Record<string, unknown>) {
  expect(schema.type).toBe("object");
  expect(schema.anyOf).toBeUndefined();
  expect(schema.oneOf).toBeUndefined();
  expect(schema.additionalProperties).toBe(false);
  expect(Array.isArray(schema.required)).toBe(true);

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = schema.required as string[];
  expect(required.sort()).toEqual(Object.keys(properties).sort());

  for (const [key, prop] of Object.entries(properties)) {
    if (key === "mode") {
      expect(prop.type).toBe("string");
      continue;
    }
    expect(isNullableProperty(prop)).toBe(true);
  }
}

describe("search intent AI transport schema", () => {
  it("bumps schema version for the repaired transport contract", () => {
    expect(SEARCH_INTENT_SCHEMA_VERSION).toBe("search-intent.v3");
  });

  it("serializes to a strict top-level object with required nullable fields", () => {
    const format = zodTextFormat(searchIntentAiTransportSchema, "parse_search_query");
    assertStrictOpenAiObjectSchema(format.schema as Record<string, unknown>);
  });

  it("accepts a complete leads transport payload", () => {
    const parsed = searchIntentAiTransportSchema.parse({
      mode: "leads",
      roles: ["Founder"],
      seniority: null,
      company: "Appknox",
      scoreThreshold: 30,
      confidenceThreshold: null,
      signalType: null,
      personName: null,
      currentCompany: null,
      previousCompany: null,
      companyA: null,
      companyB: null,
      minOverlapDays: null,
      dateRange: null,
      sortBy: "score",
      sortOrder: "desc",
    });
    expect(parsed.mode).toBe("leads");
    expect(parsed.company).toBe("Appknox");
  });

  it("accepts timeline and connections transport payloads", () => {
    expect(
      searchIntentAiTransportSchema.parse({
        mode: "timeline",
        roles: null,
        seniority: null,
        company: null,
        scoreThreshold: null,
        confidenceThreshold: null,
        signalType: null,
        personName: "Subho Halder",
        currentCompany: null,
        previousCompany: null,
        companyA: null,
        companyB: null,
        minOverlapDays: null,
        dateRange: { from: null, to: null },
        sortBy: null,
        sortOrder: null,
      }).personName,
    ).toBe("Subho Halder");

    expect(
      searchIntentAiTransportSchema.parse({
        mode: "connections",
        roles: null,
        seniority: null,
        company: null,
        scoreThreshold: null,
        confidenceThreshold: null,
        signalType: null,
        personName: null,
        currentCompany: null,
        previousCompany: null,
        companyA: "Appknox",
        companyB: "Microsoft",
        minOverlapDays: 90,
        dateRange: null,
        sortBy: null,
        sortOrder: null,
      }).companyA,
    ).toBe("Appknox");
  });

  it("rejects omitted nullable keys", () => {
    expect(() =>
      searchIntentAiTransportSchema.parse({
        mode: "leads",
        roles: null,
        company: "Appknox",
      }),
    ).toThrow();
  });
});

describe("mapAiTransportToSearchIntent", () => {
  const emptyTransport = {
    mode: "leads" as const,
    roles: null,
    seniority: null,
    company: null,
    scoreThreshold: null,
    confidenceThreshold: null,
    signalType: null,
    personName: null,
    currentCompany: null,
    previousCompany: null,
    companyA: null,
    companyB: null,
    minOverlapDays: null,
    dateRange: null,
    sortBy: null,
    sortOrder: null,
  };

  it("maps leads query and removes nulls", () => {
    expect(
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "leads",
        roles: [" Founder ", "founder", " VP "],
        company: " Appknox ",
        scoreThreshold: 30,
        sortBy: "score",
        sortOrder: "desc",
      }),
    ).toEqual({
      mode: "leads",
      roles: ["founder", "vp"],
      company: "Appknox",
      scoreThreshold: 30,
      sortBy: "score",
      sortOrder: "desc",
    });
  });

  it("maps timeline and connections example queries", () => {
    expect(
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "timeline",
        personName: " Subho Halder ",
      }),
    ).toEqual({ mode: "timeline", personName: "Subho Halder" });

    expect(
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "timeline",
        previousCompany: "Microsoft",
      }),
    ).toEqual({ mode: "timeline", previousCompany: "Microsoft" });

    expect(
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "connections",
        companyA: "Appknox",
        companyB: "Microsoft",
        minOverlapDays: 90,
      }),
    ).toEqual({
      mode: "connections",
      companyA: "Appknox",
      companyB: "Microsoft",
      minOverlapDays: 90,
    });
  });

  it("rejects leads mode with personName (cannot remap)", () => {
    expect(() =>
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "leads",
        company: "Appknox",
        personName: "Someone",
      }),
    ).toThrow(NaturalSearchError);
  });

  it("strips ambiguous timeline company without inventing currentCompany", () => {
    expect(
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "timeline",
        personName: "Siddalingamurthy BG",
        company: "outcomes.ai",
        previousCompany: "null",
        signalType: "funding",
        scoreThreshold: 10,
      }),
    ).toEqual({
      mode: "timeline",
      personName: "Siddalingamurthy BG",
    });
  });

  it("remaps connections company to companyA and strips roles noise", () => {
    expect(
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "connections",
        company: "Appknox",
        roles: ["founder"],
        minOverlapDays: 90,
      }),
    ).toEqual({
      mode: "connections",
      companyA: "Appknox",
      minOverlapDays: 90,
    });
  });

  it("validates string length, list size, dates, and thresholds", () => {
    expect(() =>
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "leads",
        company: "x".repeat(121),
      }),
    ).toThrow(NaturalSearchError);

    expect(() =>
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "leads",
        roles: Array.from({ length: 11 }, (_, i) => `role-${i}`),
      }),
    ).toThrow(NaturalSearchError);

    expect(() =>
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "leads",
        company: "Appknox",
        dateRange: { from: "2024-12-01", to: "2024-01-01" },
      }),
    ).toThrow(NaturalSearchError);

    expect(() =>
      mapAiTransportToSearchIntent({
        ...emptyTransport,
        mode: "leads",
        company: "Appknox",
        dateRange: { from: "not-a-date", to: null },
      }),
    ).toThrow(NaturalSearchError);
  });

  it("rejects empty/vague transports with no meaningful filters", () => {
    expect(() => mapAiTransportToSearchIntent(emptyTransport)).toThrow(NaturalSearchError);
  });
});
