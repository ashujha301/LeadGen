const CTA_PREFIXES = [
  /^connect\s+/i,
  /^meet\s+/i,
  /^contact\s+/i,
  /^view profile\s*/i,
  /^learn more\s*/i,
];

const COLLECTIVE_PATTERNS = [
  /\bteam\b/i,
  /\bstaff\b/i,
  /\bdepartment\b/i,
  /\bour people\b/i,
  /\bleadership team\b/i,
];

const ROLE_ONLY_PATTERNS = [
  /^(ceo|cfo|cto|coo|vp|director|manager|founder|president)$/i,
  /^(head of|chief)\s+/i,
];

export function stripPersonMentionPrefix(value: string): string {
  let result = value.trim();
  for (const pattern of CTA_PREFIXES) {
    result = result.replace(pattern, "").trim();
  }
  return result;
}

export function isCollectiveName(name: string): boolean {
  return COLLECTIVE_PATTERNS.some((pattern) => pattern.test(name));
}

export function isRoleOnlyText(name: string): boolean {
  const trimmed = name.trim();
  if (ROLE_ONLY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }
  return trimmed.split(/\s+/).length <= 1 && /^(dr|mr|ms|mrs)\.?$/i.test(trimmed);
}

export function isImplausiblePersonName(name: string): boolean {
  const trimmed = stripPersonMentionPrefix(name);
  if (!trimmed || trimmed.length < 2) {
    return true;
  }
  if (trimmed.length > 80) {
    return true;
  }
  if (/[.!?]{2,}/.test(trimmed)) {
    return true;
  }
  if (trimmed.includes("\n")) {
    return true;
  }
  const words = trimmed.split(/\s+/);
  if (words.length > 6) {
    return true;
  }
  if (words.some((word) => word.length > 30)) {
    return true;
  }
  return false;
}

export function validatePersonMention(name: string): { valid: boolean; normalizedName: string } {
  const normalizedName = stripPersonMentionPrefix(name).replace(/\s+/g, " ").trim();
  if (
    isImplausiblePersonName(normalizedName) ||
    isCollectiveName(normalizedName) ||
    isRoleOnlyText(normalizedName)
  ) {
    return { valid: false, normalizedName };
  }
  return { valid: true, normalizedName };
}

export function normalizeProfileUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) {
    return null;
  }
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (pathname.length === 0) {
      pathname = "/";
    }
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}
