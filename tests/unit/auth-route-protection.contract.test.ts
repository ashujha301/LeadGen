import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(pathFromRoot: string): string {
  return readFileSync(join(ROOT, pathFromRoot), "utf8");
}

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

describe("auth route protection contracts", () => {
  it("middleware only forwards x-pathname (auth gate lives in layouts)", () => {
    const middleware = read("src/middleware.ts");
    expect(middleware).toMatch(/x-pathname/);
    expect(middleware).not.toMatch(/requireSession|auth\(/);
  });

  it("authenticated app layout requires a session before rendering the shell", () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toMatch(/requireSession/);
    expect(layout).toMatch(/AppShell/);
  });

  it("sign-in page is public and redirects when already authenticated", () => {
    const page = read("src/app/(public)/sign-in/page.tsx");
    expect(page).toMatch(/GoogleSignInButton/);
    expect(page).toMatch(/callbackUrl/);
    expect(page).toMatch(/redirect\(/);
  });

  it("every /api/v1 route requires withApiUser", () => {
    const apiRoot = join(ROOT, "src/app/api/v1");
    const routeFiles = listFilesRecursive(apiRoot).filter((path) => path.endsWith("/route.ts"));
    expect(routeFiles.length).toBeGreaterThan(5);

    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/withApiUser/);
    }
  });

  it("health endpoints stay public (no withApiUser)", () => {
    expect(read("src/app/api/health/live/route.ts")).not.toMatch(/withApiUser|requireApiUser/);
    expect(read("src/app/api/health/ready/route.ts")).not.toMatch(/withApiUser|requireApiUser/);
  });

  it("Auth.js handlers are mounted at /api/auth/[...nextauth]", () => {
    const route = read("src/app/api/auth/[...nextauth]/route.ts");
    expect(route).toMatch(/handlers/);
    expect(route).toMatch(/GET/);
    expect(route).toMatch(/POST/);
  });

  it("HVL repository filters by search_runs.user_id", () => {
    const repo = read("src/server/infrastructure/db/repositories/high-value-leads.ts");
    expect(repo).toMatch(/user_id/);
    expect(repo).toMatch(/userId/);
    expect(repo).toMatch(/export async function listHighValueCompanies/);
    expect(repo).toMatch(/userId: string/);
  });

  it("auth schema exports Auth.js adapter tables", async () => {
    const schema = await import("@/server/infrastructure/db/schema/auth-users");
    expect(schema.users).toBeDefined();
    expect(schema.accounts).toBeDefined();
    expect(schema.sessions).toBeDefined();
    expect(schema.verificationTokens).toBeDefined();
  });

  it("search_runs schema includes userId ownership column", async () => {
    const { searchRuns } = await import("@/server/infrastructure/db/schema/search-runs");
    expect(searchRuns.userId).toBeDefined();
  });
});
