import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeLeadNeighbors,
  sortHighValueLeadsByScoreThenId,
} from "@/server/domain/leads/hvl-navigation";
import { qualifiesAsHighValueLead } from "@/server/domain/roles/tier-matching";

const root = process.cwd();

describe("HVL neighbor navigation", () => {
  it("returns correct neighbors for first, middle, and last", () => {
    const ids = ["a", "b", "c"];
    expect(computeLeadNeighbors(ids, "a")).toEqual({
      previousLeadId: null,
      nextLeadId: "b",
      position: 1,
      total: 3,
    });
    expect(computeLeadNeighbors(ids, "b")).toEqual({
      previousLeadId: "a",
      nextLeadId: "c",
      position: 2,
      total: 3,
    });
    expect(computeLeadNeighbors(ids, "c")).toEqual({
      previousLeadId: "b",
      nextLeadId: null,
      position: 3,
      total: 3,
    });
  });

  it("returns both neighbors null for a one-lead company", () => {
    expect(computeLeadNeighbors(["only"], "only")).toEqual({
      previousLeadId: null,
      nextLeadId: null,
      position: 1,
      total: 1,
    });
  });

  it("orders equal scores by id DESC", () => {
    const sorted = sortHighValueLeadsByScoreThenId([
      { id: "aaa", finalScore: 40 },
      { id: "zzz", finalScore: 40 },
      { id: "mmm", finalScore: 50 },
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["mmm", "zzz", "aaa"]);
  });

  it("returns null when lead is not in the ordered set", () => {
    expect(computeLeadNeighbors(["a", "b"], "missing")).toBeNull();
  });
});

describe("HVL navigation route contracts", () => {
  it("HVL nested lead page must not link to /people/", () => {
    const src = readFileSync(
      join(root, "src/app/(app)/high-value-leads/[companyId]/leads/[leadId]/page.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\/people\//);
    expect(src).not.toMatch(/View person/);
  });

  it("toolbar uses Back/Previous/Next lucide icons and nested hrefs", () => {
    const src = readFileSync(join(root, "src/features/leads/hvl-lead-nav-toolbar.tsx"), "utf8");
    expect(src).toMatch(/ArrowLeft/);
    expect(src).toMatch(/ChevronLeft/);
    expect(src).toMatch(/ChevronRight/);
    expect(src).toMatch(/\/high-value-leads\/\$\{companyId\}/);
    expect(src).toMatch(/\/high-value-leads\/\$\{companyId\}\/leads\//);
  });
});

describe("HVL navigation + score-gate regression", () => {
  it("role-unmatched score>=35 remains HVL-eligible for navigation universe", () => {
    expect(
      qualifiesAsHighValueLead({
        scoreVersion: 2,
        roleMatch: false,
        roleMatchFinal: false,
        finalScore: 36,
        confidence: 0.99,
        isStale: false,
        hasVerifiedCurrentEmployment: true,
      }),
    ).toBe(true);
  });

  it("neighbor ranking uses finalScore DESC then id DESC", () => {
    const sorted = sortHighValueLeadsByScoreThenId([
      { id: "low", finalScore: 36 },
      { id: "high", finalScore: 54 },
    ]);
    expect(sorted[0]?.id).toBe("high");
    expect(computeLeadNeighbors(sorted.map((row) => row.id), "high")?.nextLeadId).toBe("low");
  });
});
