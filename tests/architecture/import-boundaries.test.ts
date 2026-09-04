import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walkFiles(full, acc);
    } else if (/\.(tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("client import boundaries", () => {
  it("prevents client components from importing server modules", () => {
    const clientRoots = [
      join(ROOT, "src/features"),
      join(ROOT, "src/components"),
      join(ROOT, "src/app"),
    ];
    const offenders: string[] = [];

    for (const root of clientRoots) {
      for (const file of walkFiles(root)) {
        const contents = readFileSync(file, "utf8");
        if (!contents.includes('"use client"') && !contents.includes("'use client'")) {
          continue;
        }
        if (contents.includes("@/server/") || contents.includes('from "@/server')) {
          offenders.push(file.replace(`${ROOT}/`, ""));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
