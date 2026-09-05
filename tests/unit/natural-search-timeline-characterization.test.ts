import { describe, expect, it } from "vitest";
import { crustdataPersonEnrichResponseSchema } from "@/server/infrastructure/connectors/crustdata/schemas";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(process.cwd(), "tests/fixtures/crustdata");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

describe("characterization: crustdata person enrich gaps", () => {
  it("accepts object-shaped basic_profile.location after schema fix", () => {
    const payload = loadFixture("person-enrich-object-location.json");
    const parsed = crustdataPersonEnrichResponseSchema.parse(payload);
    expect(parsed[0]?.matches[0]?.person_data.basic_profile?.location).toContain("Bengaluru");
  });

  it("still accepts legacy string locations", () => {
    const payload = loadFixture("person-enrich-success.json");
    const parsed = crustdataPersonEnrichResponseSchema.parse(payload);
    expect(parsed[0]?.matches[0]?.person_data.basic_profile?.location).toBe(
      "San Francisco Bay Area",
    );
  });
});
