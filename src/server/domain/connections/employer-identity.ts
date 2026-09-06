export type EmployerIdentityInput = {
  employerDomain?: string | null;
  providerCompanyId?: string | null;
  employerLinkedinUrl?: string | null;
  companyId?: string | null;
  companyDomain?: string | null;
  employerName?: string | null;
};

function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return trimmed || null;
}

function normalizeLinkedinCompanyUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase().replace(/\/$/, "");
  const match = trimmed.match(/linkedin\.com\/company\/([^/?#]+)/);
  return match?.[1] ? `linkedin-company:${match[1]}` : null;
}

function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

/**
 * Exact employer identity precedence:
 * domain > crustdata company id > linkedin company url > canonical company id > normalized name.
 * When a canonical company has a domain, prefer that domain key so domain-only rows can match.
 */
export function buildEmployerIdentityKey(input: EmployerIdentityInput): string | null {
  const domain = normalizeDomain(input.employerDomain) ?? normalizeDomain(input.companyDomain);
  if (domain) {
    return `domain:${domain}`;
  }

  if (input.providerCompanyId?.trim()) {
    return `provider:${input.providerCompanyId.trim()}`;
  }

  const linkedin = normalizeLinkedinCompanyUrl(input.employerLinkedinUrl);
  if (linkedin) {
    return linkedin;
  }

  if (input.companyId?.trim()) {
    return `company:${input.companyId.trim()}`;
  }

  const name = normalizeName(input.employerName);
  if (name) {
    return `name:${name}`;
  }

  return null;
}

export function resolveSharedEmployerKey(keyA: string | null, keyB: string | null): string | null {
  if (!keyA || !keyB) {
    return null;
  }
  if (keyA === keyB) {
    return keyA;
  }
  return null;
}

export function employerMatchKind(
  key: string,
): "domain" | "provider" | "linkedin" | "company" | "name" {
  if (key.startsWith("domain:")) return "domain";
  if (key.startsWith("provider:")) return "provider";
  if (key.startsWith("linkedin-company:")) return "linkedin";
  if (key.startsWith("company:")) return "company";
  return "name";
}
