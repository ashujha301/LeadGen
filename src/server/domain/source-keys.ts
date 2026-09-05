import { createHash } from "node:crypto";

import { normalizeUrl } from "@/server/domain/normalization/url";

export function buildWebsiteSourceKey(finalUrl: string): string {
  return (normalizeUrl(finalUrl) ?? finalUrl.trim()).replace(/\/$/, "");
}

export function buildCompanyEnrichSourceKey(normalizedDomain: string): string {
  return `company_enrich:${normalizedDomain}`;
}

export function buildPersonSearchSourceKey(
  normalizedDomain: string,
  criteriaHash?: string,
): string {
  const hash = criteriaHash ?? "default";
  return `person_search:${normalizedDomain}:${hash}`;
}

export function buildPersonEnrichSourceKey(normalizedProfileUrl: string): string {
  return `person_enrich:${normalizedProfileUrl}`;
}

export function buildRdapSourceKey(normalizedDomain: string): string {
  return `rdap:${normalizedDomain}`;
}

export function buildEmailVerifySourceKey(normalizedEmail: string): string {
  return `email_verify:${normalizedEmail}`;
}

export function hashRoleCriteria(criteria: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(criteria ?? {}))
    .digest("hex")
    .slice(0, 16);
}
