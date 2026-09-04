import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
      walkFiles(full, acc);
    } else if (/\.(ts|tsx|mjs)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("single-package monolith architecture", () => {
  it("does not keep workspace apps/ or packages/ directories", () => {
    expect(existsSync(join(ROOT, "apps"))).toBe(false);
    expect(existsSync(join(ROOT, "packages"))).toBe(false);
    expect(existsSync(join(ROOT, "pnpm-workspace.yaml"))).toBe(false);
  });

  it("uses a single root package.json without workspace package manifests", () => {
    expect(existsSync(join(ROOT, "package.json"))).toBe(true);
    const nestedManifests = walkFiles(join(ROOT, "src")).filter((file) =>
      file.endsWith("package.json"),
    );
    expect(nestedManifests).toEqual([]);
  });

  it("does not import legacy workspace aliases in runtime code", () => {
    const sourceRoots = [join(ROOT, "src"), join(ROOT, "scripts")];
    const offenders: string[] = [];

    for (const root of sourceRoots) {
      for (const file of walkFiles(root)) {
        const contents = readFileSync(file, "utf8");
        if (contents.includes("@leadgen/")) {
          offenders.push(file.replace(`${ROOT}/`, ""));
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("places runtime code under src/", () => {
    expect(existsSync(join(ROOT, "src/app"))).toBe(true);
    expect(existsSync(join(ROOT, "src/server"))).toBe(true);
    expect(existsSync(join(ROOT, "src/shared"))).toBe(true);
  });
});
