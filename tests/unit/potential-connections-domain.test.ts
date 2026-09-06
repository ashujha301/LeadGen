import { describe, expect, it } from "vitest";

import {
  buildEmployerIdentityKey,
  resolveSharedEmployerKey,
} from "@/server/domain/connections/employer-identity";
import {
  halfOpenOverlapDays,
  mergePersonEmployerIntervals,
  totalIntersectedOverlapDays,
  toHalfOpenInterval,
} from "@/server/domain/connections/date-ranges";
import {
  buildStableConnectionId,
  scoreEvidenceQuality,
  scorePotentialConnectionStrength,
} from "@/server/domain/connections/scoring";

describe("employer identity", () => {
  it("prefers normalized domain over name", () => {
    expect(
      buildEmployerIdentityKey({
        employerDomain: "groww.in",
        providerCompanyId: "999",
        employerLinkedinUrl: "https://linkedin.com/company/groww",
        companyId: "uuid-1",
        employerName: "Groww",
      }),
    ).toBe("domain:groww.in");
  });

  it("matches canonical company domain against domain-only row", () => {
    const canonical = buildEmployerIdentityKey({
      companyId: "groww-uuid",
      companyDomain: "groww.in",
      employerName: "Groww",
    });
    const domainOnly = buildEmployerIdentityKey({
      employerDomain: "groww.in",
      employerName: "Groww",
    });
    expect(resolveSharedEmployerKey(canonical, domainOnly)).toBe("domain:groww.in");
  });
});

describe("half-open date ranges and promotion merge", () => {
  it("does not count a one-day promotion boundary as overlap", () => {
    const a = toHalfOpenInterval({
      startDate: "2019-01-01",
      endDate: "2020-06-01",
      isCurrent: false,
    });
    const b = toHalfOpenInterval({
      startDate: "2020-06-01",
      endDate: "2021-01-01",
      isCurrent: false,
    });
    expect(halfOpenOverlapDays(a!, b!)).toBe(0);
  });

  it("rejects historical rows with no end date", () => {
    expect(
      toHalfOpenInterval({
        startDate: "2020-01-01",
        endDate: null,
        isCurrent: false,
      }),
    ).toBeNull();
  });

  it("allows open end only for current roles", () => {
    const current = toHalfOpenInterval({
      startDate: "2022-01-01",
      endDate: null,
      isCurrent: true,
      asOfDate: "2024-01-01",
    });
    expect(current).not.toBeNull();
    expect(current?.endExclusive).toBe("2024-01-01");
  });

  it("merges promotions then intersects once (Groww-style)", () => {
    const personA = mergePersonEmployerIntervals([
      { startDate: "2019-01-01", endDate: "2020-06-01", isCurrent: false },
      { startDate: "2020-06-01", endDate: "2021-01-01", isCurrent: false },
    ]);
    const personB = mergePersonEmployerIntervals([
      { startDate: "2019-01-01", endDate: "2021-01-01", isCurrent: false },
    ]);
    expect(totalIntersectedOverlapDays(personA, personB)).toBe(731);
  });
});

describe("scoring and stable ids", () => {
  const asOfDate = "2024-06-01";

  it("scores strong long recent same-function overlap", () => {
    const result = scorePotentialConnectionStrength({
      overlapDays: 800,
      functionsA: ["engineering"],
      functionsB: ["engineering"],
      startA: "2018-01-01",
      startB: "2018-03-01",
      overlapEnd: "2023-01-01",
      sharedEmployerCount: 2,
      asOfDate,
    });
    expect(result.strengthScore).toBeGreaterThanOrEqual(75);
    expect(result.band).toBe("strong");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(["OVERLAP_12M_PLUS", "SAME_FUNCTION", "RECENT_OVERLAP"]),
    );
  });

  it("builds order-independent stable connection ids", () => {
    expect(buildStableConnectionId("b-person", "a-person", "domain:groww.in")).toBe(
      buildStableConnectionId("a-person", "b-person", "domain:groww.in"),
    );
  });

  it("labels evidence quality without claiming acquaintance probability", () => {
    const quality = scoreEvidenceQuality({
      hasProviderCompanyId: true,
      employerMatchKind: "domain",
      datesComplete: true,
      provenanceFresh: true,
    });
    expect(quality.label).toBe("strong");
    expect(quality.score).toBeGreaterThan(0);
  });
});
