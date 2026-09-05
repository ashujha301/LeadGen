import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

import { buildObservationFingerprint } from "@/server/domain/observation-fingerprint";
import { observations } from "@/server/infrastructure/db/schema/observations";
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

describe("observation fingerprint unique index", () => {
  it("defines a non-partial unique index matching ON CONFLICT (source_document_id, fingerprint)", () => {
    const { indexes } = getTableConfig(observations);
    const fingerprintIndex = indexes.find(
      (index) => index.config.name === "observations_source_document_fingerprint_idx",
    );

    expect(fingerprintIndex).toBeDefined();
    expect(fingerprintIndex?.config.unique).toBe(true);
    expect(fingerprintIndex?.config.where).toBeUndefined();
    expect(fingerprintIndex?.config.columns.map((column) => column.name)).toEqual([
      "source_document_id",
      "fingerprint",
    ]);
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
    expect(buildObservationFingerprint({ ...base, normalizedValue: "jane doe" })).not.toBe(
      buildObservationFingerprint({ ...base, normalizedValue: "john doe" }),
    );
  });
});
