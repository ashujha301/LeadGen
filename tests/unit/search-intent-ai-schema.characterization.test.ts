import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";

import { searchDraftAiTransportSchema, SEARCH_DRAFT_SCHEMA_VERSION } from "@/server/infrastructure/ai/schemas/search-draft";
import { searchIntentOutputSchema } from "@/server/infrastructure/ai/schemas/search-intent";

function isNullableProperty(prop: Record<string, unknown>): boolean {
  if (prop.nullable === true) return true;
  const types = Array.isArray(prop.type) ? prop.type : [prop.type];
  if (types.includes("null")) return true;
  if (Array.isArray(prop.anyOf)) {
    return (prop.anyOf as Array<Record<string, unknown>>).some((entry) => entry.type === "null");
  }
  return false;
}

describe("search draft AI transport (v4) strict schema", () => {
  it("uses search-intent.v4", () => {
    expect(SEARCH_DRAFT_SCHEMA_VERSION).toBe("search-intent.v4");
  });

  it("serializes to a strict top-level object suitable for OpenAI structured outputs", () => {
    const format = zodTextFormat(searchDraftAiTransportSchema, "parse_search_query");
    const schema = format.schema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.anyOf).toBeUndefined();
    expect(schema.oneOf).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);

    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const required = schema.required as string[];
    expect(required.sort()).toEqual(Object.keys(properties).sort());

    for (const [key, prop] of Object.entries(properties)) {
      if (key === "mode" || key === "constraints" || key === "relationshipAmbiguous") continue;
      expect(isNullableProperty(prop)).toBe(true);
    }
  });

  it("documents that discriminated SearchIntent remains app-only and anyOf", () => {
    const format = zodTextFormat(searchIntentOutputSchema, "parse_search_query");
    const schema = format.schema as Record<string, unknown>;
    expect(Array.isArray(schema.anyOf)).toBe(true);
  });
});
