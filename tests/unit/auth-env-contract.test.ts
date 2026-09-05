import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(ROOT, pathFromRoot), "utf8");
}

describe("auth env contract", () => {
  it("documents CandleSmart-compatible Google OAuth env names", () => {
    const example = read(".env.example");
    expect(example).toMatch(/AUTH_SECRET=/);
    expect(example).toMatch(/GOOGLE_CLIENT_ID=/);
    expect(example).toMatch(/GOOGLE_CLIENT_SECRET=/);
  });

  it("parses auth fields in env.ts", () => {
    const envTs = read("src/shared/config/env.ts");
    expect(envTs).toMatch(/AUTH_SECRET/);
    expect(envTs).toMatch(/GOOGLE_CLIENT_ID/);
    expect(envTs).toMatch(/GOOGLE_CLIENT_SECRET/);
  });

  it("ships Auth.js migration for user tables and search_runs.user_id", () => {
    const migration = read("drizzle/0010_auth_google_oauth.sql");
    expect(migration).toMatch(/CREATE TABLE "user"/);
    expect(migration).toMatch(/CREATE TABLE "session"/);
    expect(migration).toMatch(/ADD COLUMN "user_id"/);
  });
});
