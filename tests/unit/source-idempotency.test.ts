import { describe, expect, it } from "vitest";

import { buildObservationFingerprint } from "@/server/domain/observation-fingerprint";
import {
  buildCompanyEnrichSourceKey,
  buildPersonEnrichSourceKey,
  buildPersonSearchSourceKey,
  buildWebsiteSourceKey,
  hashRoleCriteria,
} from "@/server/domain/source-keys";

describe("source keys", () => {
  it("builds stable website source keys from final URLs", () => {
    expect(buildWebsiteSourceKey("https://www.appknox.com/about/")).toBe(
      "https://www.appknox.com/about",
    );
  });

  it("builds distinct crustdata operation keys", () => {
    expect(buildCompanyEnrichSourceKey("appknox.com")).toBe("company_enrich:appknox.com");
    expect(buildPersonSearchSourceKey("appknox.com", "abc123")).toBe(
      "person_search:appknox.com:abc123",
    );
    expect(buildPersonEnrichSourceKey("https://linkedin.com/in/jane")).toBe(
      "person_enrich:https://linkedin.com/in/jane",
    );
  });

  it("hashes role criteria deterministically", () => {
    const first = hashRoleCriteria({ customTitles: ["CEO"] });
    const second = hashRoleCriteria({ customTitles: ["CEO"] });
    expect(first).toBe(second);
    expect(first).toHaveLength(16);
  });
});

describe("observation fingerprints", () => {
  it("is stable for identical observation content", () => {
    const input = {
      entityType: "person",
      subjectKey: "person-1",
      attribute: "name",
      normalizedValue: "jane doe",
      rawValue: "Jane Doe",
      evidenceSpan: null,
    };
    expect(buildObservationFingerprint(input)).toBe(buildObservationFingerprint(input));
  });

  it("changes when normalized value changes", () => {
    const base = {
      entityType: "person",
      subjectKey: "person-1",
      attribute: "name",
      rawValue: "Jane Doe",
      evidenceSpan: null,
    };
    expect(
      buildObservationFingerprint({ ...base, normalizedValue: "jane doe" }),
    ).not.toBe(buildObservationFingerprint({ ...base, normalizedValue: "john doe" }));
  });
});
