import { describe, expect, it } from "vitest";
import {
  isUsableEmail,
  isUsablePhone,
  isUsableProfileUrl,
  sanitizePersonContacts,
  sanitizePersonDraftContacts,
} from "@/server/domain/entity-resolution/contact-identity";
import { normalizeProfileUrl } from "@/server/domain/entity-resolution/mention-validation";
import { profileIdentityKey } from "@/server/domain/entity-resolution/person-drafts";

describe("contact identity guards", () => {
  it("rejects slash, hash, empty, and relative profile urls", () => {
    expect(isUsableProfileUrl("/")).toBe(false);
    expect(isUsableProfileUrl("#")).toBe(false);
    expect(isUsableProfileUrl("")).toBe(false);
    expect(isUsableProfileUrl("linkedin.com/in/jane")).toBe(false);
    expect(isUsableProfileUrl("https://example.com/")).toBe(false);
    expect(isUsableProfileUrl("https://www.linkedin.com/company/acme")).toBe(false);
  });

  it("accepts absolute LinkedIn /in/{slug} profile urls", () => {
    expect(isUsableProfileUrl("https://www.linkedin.com/in/abhishek-ksingh")).toBe(true);
    expect(isUsableProfileUrl("https://linkedin.com/in/jane-doe/")).toBe(true);
    expect(isUsableProfileUrl("http://in.linkedin.com/in/arindam-ghosh-a6bba21")).toBe(true);
  });

  it("rejects slash and non-email strings as emails", () => {
    expect(isUsableEmail("/")).toBe(false);
    expect(isUsableEmail("#")).toBe(false);
    expect(isUsableEmail("not-an-email")).toBe(false);
    expect(isUsableEmail("jane@acme.com")).toBe(true);
  });

  it("rejects slash and too-short phones", () => {
    expect(isUsablePhone("/")).toBe(false);
    expect(isUsablePhone("123")).toBe(false);
    expect(isUsablePhone("+91 98765 43210")).toBe(true);
  });

  it("sanitizePersonContacts drops unusable fields and keeps usable ones", () => {
    expect(
      sanitizePersonContacts({
        email: "/",
        phone: "/",
        profileUrl: "https://linkedin.com/in/jane",
      }),
    ).toEqual({ profileUrl: "https://linkedin.com/in/jane" });
  });

  it("profileIdentityKey returns null for slash urls", () => {
    expect(profileIdentityKey("/")).toBeNull();
    expect(profileIdentityKey("https://linkedin.com/in/jane")).toBe("linkedin:/in/jane");
  });

  it("normalizeProfileUrl returns null for slash", () => {
    expect(normalizeProfileUrl("/")).toBeNull();
    expect(normalizeProfileUrl("https://linkedin.com/in/jane")).toContain("linkedin.com/in/jane");
  });

  it("sanitizePersonDraftContacts clears garbage identity fields on a draft-like object", () => {
    const cleaned = sanitizePersonDraftContacts({
      name: "Mr. Arindam Ghosh",
      email: "/",
      phone: "/",
      profileUrl: "/",
      title: "Founder",
    });
    expect(cleaned.email).toBeUndefined();
    expect(cleaned.phone).toBeUndefined();
    expect(cleaned.profileUrl).toBeUndefined();
    expect(cleaned.title).toBe("Founder");
  });

  it("policy: only usable profile urls are eligible for global person lookup", () => {
    expect(isUsableProfileUrl("/")).toBe(false);
    expect(isUsableProfileUrl("https://linkedin.com/in/abhishek-ksingh")).toBe(true);
  });
});
