import { describe, expect, it } from "vitest";
import {
  normalizeDomain,
  normalizeName,
  normalizeTitle,
  normalizeUrl,
  nameSimilarity,
  titleSimilarity,
} from "@/server/domain";

describe("domain normalization", () => {
  it("lowercases and strips www", () => {
    expect(normalizeDomain("HTTPS://WWW.Example.COM/path")).toBe("example.com");
  });

  it("handles bare domains", () => {
    expect(normalizeDomain("example.com")).toBe("example.com");
  });

  it("returns null for invalid input", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("encodes unicode domains to punycode", () => {
    expect(normalizeDomain("https://münchen.de")).toBe("xn--mnchen-3ya.de");
  });
});

describe("name normalization", () => {
  it("normalizes casing and punctuation", () => {
    expect(normalizeName("  Jane O'Neil  ")).toBe("jane o'neil");
  });

  it("scores similar names", () => {
    expect(nameSimilarity("Jane O'Neil", "jane oneil")).toBeGreaterThan(0.7);
    expect(nameSimilarity("Jane O'Neil", "Jane O'Neil")).toBe(1);
  });
});

describe("title normalization", () => {
  it("expands common abbreviations", () => {
    expect(normalizeTitle("VP Sales")).toBe("vice president sales");
  });

  it("scores overlapping titles", () => {
    expect(titleSimilarity("CEO", "Chief Executive Officer")).toBeGreaterThan(0.5);
  });
});

describe("url normalization", () => {
  it("lowercases host and strips fragments", () => {
    expect(normalizeUrl("https://WWW.LinkedIn.com/in/jane#section")).toBe(
      "https://www.linkedin.com/in/jane",
    );
  });

  it("returns null for invalid urls", () => {
    expect(normalizeUrl("not a url")).toBeNull();
  });
});
