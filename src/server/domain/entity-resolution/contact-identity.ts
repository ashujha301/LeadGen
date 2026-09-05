const GARBAGE_SINGLE_TOKEN = new Set(["/", "#", "-", ".", "n/a", "na", "none", "null", "undefined"]);

function trimmed(value: string | null | undefined): string | null {
  if (value == null) return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
}

export function isUsableEmail(value: string | null | undefined): boolean {
  const email = trimmed(value)?.toLowerCase();
  if (!email || GARBAGE_SINGLE_TOKEN.has(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isUsablePhone(value: string | null | undefined): boolean {
  const phone = trimmed(value);
  if (!phone || GARBAGE_SINGLE_TOKEN.has(phone.toLowerCase())) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function isUsableProfileUrl(value: string | null | undefined): boolean {
  const raw = trimmed(value);
  if (!raw || GARBAGE_SINGLE_TOKEN.has(raw.toLowerCase())) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (!(host === "linkedin.com" || host.endsWith(".linkedin.com"))) return false;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  if (parts[0]!.toLowerCase() !== "in") return false;
  const slug = parts[1]!;
  return slug.length >= 2 && slug !== "in";
}

export function sanitizePersonContacts(input: {
  email?: string | null;
  phone?: string | null;
  profileUrl?: string | null;
}): { email?: string; phone?: string; profileUrl?: string } {
  const result: { email?: string; phone?: string; profileUrl?: string } = {};
  const email = trimmed(input.email);
  const phone = trimmed(input.phone);
  const profileUrl = trimmed(input.profileUrl);

  if (email && isUsableEmail(email)) result.email = email;
  if (phone && isUsablePhone(phone)) result.phone = phone;
  if (profileUrl && isUsableProfileUrl(profileUrl)) result.profileUrl = profileUrl;
  return result;
}

export function sanitizePersonDraftContacts<
  T extends {
    email?: string;
    phone?: string;
    profileUrl?: string;
  },
>(draft: T): T {
  const clean = sanitizePersonContacts(draft);
  return {
    ...draft,
    email: clean.email,
    phone: clean.phone,
    profileUrl: clean.profileUrl,
  };
}
