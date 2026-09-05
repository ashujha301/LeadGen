import { normalizeEmail } from "@/server/domain/entity-resolution/person";
import { isUsableEmail, isUsableProfileUrl } from "@/server/domain/entity-resolution/contact-identity";
import { nameSimilarity } from "@/server/domain/normalization/name";
import { normalizeUrl } from "@/server/domain/normalization/url";

export type PersonDraft = {
  name: string;
  normalizedName: string;
  title?: string;
  email?: string;
  phone?: string;
  profileUrl?: string;
  crustdataPersonId?: string;
  confidence: number;
  sourceDocumentId: string;
  subjectKey: string;
};

export function profileIdentityKey(profileUrl: string | undefined): string | null {
  if (!profileUrl || !isUsableProfileUrl(profileUrl)) {
    return null;
  }

  const normalized = normalizeUrl(profileUrl)?.toLowerCase() ?? profileUrl.trim().toLowerCase();
  try {
    const url = new URL(normalized.startsWith("http") ? normalized : `https://${normalized}`);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      return `linkedin:${path}`;
    }
    return `${host}${path}`;
  } catch {
    return normalized;
  }
}

function mergeDraft(existing: PersonDraft, incoming: PersonDraft): PersonDraft {
  const incomingPreferred = incoming.confidence >= existing.confidence;
  return {
    name: incomingPreferred ? incoming.name : existing.name,
    normalizedName: incomingPreferred ? incoming.normalizedName : existing.normalizedName,
    title: incoming.title || existing.title,
    email: incoming.email || existing.email,
    phone: incoming.phone || existing.phone,
    profileUrl: incoming.profileUrl || existing.profileUrl,
    crustdataPersonId: incoming.crustdataPersonId || existing.crustdataPersonId,
    confidence: Math.max(incoming.confidence, existing.confidence),
    sourceDocumentId: incomingPreferred ? incoming.sourceDocumentId : existing.sourceDocumentId,
    subjectKey: incoming.crustdataPersonId
      ? incoming.subjectKey
      : existing.crustdataPersonId
        ? existing.subjectKey
        : incomingPreferred
          ? incoming.subjectKey
          : existing.subjectKey,
  };
}

function identityKeys(draft: PersonDraft): string[] {
  const keys: string[] = [];
  if (draft.crustdataPersonId) {
    keys.push(`crustdata:${draft.crustdataPersonId}`);
  }
  const profileKey = profileIdentityKey(draft.profileUrl);
  if (profileKey) {
    keys.push(`profile:${profileKey}`);
  }
  if (draft.email && isUsableEmail(draft.email)) {
    keys.push(`email:${normalizeEmail(draft.email)}`);
  }
  return keys;
}

export function dedupePersonDrafts(drafts: PersonDraft[]): PersonDraft[] {
  const merged: PersonDraft[] = [];
  const indexByKey = new Map<string, number>();

  for (const draft of drafts) {
    const keys = identityKeys(draft);
    const existingIndex = keys
      .map((key) => indexByKey.get(key))
      .find((index) => index !== undefined);

    if (existingIndex === undefined) {
      const nextIndex = merged.length;
      merged.push(draft);
      for (const key of keys) {
        indexByKey.set(key, nextIndex);
      }
      continue;
    }

    merged[existingIndex] = mergeDraft(merged[existingIndex]!, draft);
    for (const key of identityKeys(merged[existingIndex]!)) {
      indexByKey.set(key, existingIndex);
    }
  }

  return merged;
}

const NAME_AT_COMPANY_THRESHOLD = 0.88;

export function findExistingPersonByNameAtCompany(
  draft: Pick<PersonDraft, "normalizedName">,
  existingPeople: Array<{ id: string; normalizedName: string }>,
): string | null {
  for (const person of existingPeople) {
    if (nameSimilarity(draft.normalizedName, person.normalizedName) >= NAME_AT_COMPANY_THRESHOLD) {
      return person.id;
    }
  }
  return null;
}
