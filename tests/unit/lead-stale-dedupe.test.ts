import { describe, expect, it } from "vitest";
import { shouldMarkLeadStale } from "@/server/domain/leads/stale-policy";

describe("HVL person dedupe stale policy", () => {
  it("marks sibling lead rows for same person+company stale", () => {
    expect(
      shouldMarkLeadStale({
        candidateLeadId: "old",
        candidatePersonId: "p1",
        candidateCompanyId: "c1",
        activePersonId: "p1",
        activeCompanyId: "c1",
        keepLeadId: "new",
      }),
    ).toBe(true);
  });

  it("never marks the kept lead stale", () => {
    expect(
      shouldMarkLeadStale({
        candidateLeadId: "new",
        candidatePersonId: "p1",
        candidateCompanyId: "c1",
        activePersonId: "p1",
        activeCompanyId: "c1",
        keepLeadId: "new",
      }),
    ).toBe(false);
  });

  it("ignores other people at the same company", () => {
    expect(
      shouldMarkLeadStale({
        candidateLeadId: "other",
        candidatePersonId: "p2",
        candidateCompanyId: "c1",
        activePersonId: "p1",
        activeCompanyId: "c1",
        keepLeadId: "new",
      }),
    ).toBe(false);
  });
});
