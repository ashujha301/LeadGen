import type { MappedObservation } from "../types";
import type { CompanyPageFetchResult } from "../types";
import { buildSubjectKey } from "@/server/domain";

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  return match?.[1]?.trim() ?? null;
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }

    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return blocks;
}

function extractOrganizationNameFromJsonLd(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractOrganizationNameFromJsonLd(entry);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type.map(String) : type != null ? [String(type)] : [];
  const isOrg = types.some((entry) =>
    /^(Organization|Corporation|LocalBusiness|WebSite)$/i.test(entry),
  );

  if (isOrg && typeof record.name === "string" && record.name.trim()) {
    return record.name.trim();
  }

  if (record["@graph"]) {
    return extractOrganizationNameFromJsonLd(record["@graph"]);
  }

  return null;
}

function extractEmails(html: string): string[] {
  const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = html.match(pattern) ?? [];
  return [...new Set(matches.map((email) => email.toLowerCase()))];
}

function extractPhoneLinks(html: string): string[] {
  const pattern = /href=["']tel:([^"']+)["']/gi;
  const phones: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const phone = match[1]?.trim();
    if (phone) {
      phones.push(phone);
    }
  }

  return [...new Set(phones)];
}

function extractVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePersonName(name: string): string {
  return name
    .trim()
    .replace(
      /^(?:the team|our team|leadership team|team|meet the brains behind the intelligence|meet the team)\s+/i,
      "",
    )
    .replace(/\s+/g, " ");
}

function extractLeadershipPeople(html: string): Array<{ name: string; title: string }> {
  const text = extractVisibleText(html);
  const titlePattern =
    "(?:Co-Founder|Co Founder|Cofounder|Founder|Chief Executive Officer|CEO|Chief Technology Officer|CTO|Chief Revenue Officer|CRO|Chief Operating Officer|COO|President|Managing Director|VP Sales|Vice President Sales|Head of Sales)";
  const pattern = new RegExp(
    `\\b([A-Z][a-zA-Z'.-]+(?:\\s+[A-Z][a-zA-Z'.-]+){1,3})\\s+(${titlePattern})\\b`,
    "g",
  );
  const people = new Map<string, { name: string; title: string }>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const name = normalizePersonName(match[1] ?? "");
    const title = match[2]?.replace(/\s+/g, " ").trim();

    if (!name || !title) {
      continue;
    }

    people.set(`${name.toLowerCase()}:${title.toLowerCase()}`, { name, title });
  }

  return [...people.values()];
}

export function mapCompanyPageToObservations(page: CompanyPageFetchResult): MappedObservation[] {
  const observations: MappedObservation[] = [];
  const title = extractTitle(page.html);
  const description = extractMetaDescription(page.html);

  if (title) {
    observations.push({
      entityType: "company",
      attribute: "page_title",
      rawValue: title,
      normalizedValue: title.toLowerCase(),
      confidence: 0.7,
    });
  }

  if (description) {
    observations.push({
      entityType: "company",
      attribute: "meta_description",
      rawValue: description,
      confidence: 0.65,
    });
  }

  for (const email of extractEmails(page.html)) {
    observations.push({
      entityType: "contact",
      attribute: "email",
      rawValue: email,
      normalizedValue: email,
      confidence: 0.5,
    });
  }

  for (const phone of extractPhoneLinks(page.html)) {
    observations.push({
      entityType: "contact",
      attribute: "phone",
      rawValue: phone,
      normalizedValue: phone.replace(/\s+/g, ""),
      confidence: 0.55,
    });
  }

  for (const [index, person] of extractLeadershipPeople(page.html).entries()) {
    const subjectKey = buildSubjectKey(person.name, index);
    observations.push({
      entityType: "person",
      attribute: "name",
      rawValue: person.name,
      normalizedValue: person.name.toLowerCase(),
      confidence: 0.62,
      subjectKey,
    });
    observations.push({
      entityType: "person",
      attribute: "title",
      rawValue: person.title,
      normalizedValue: person.title.toLowerCase(),
      confidence: 0.62,
      subjectKey,
    });
  }

  const jsonLdBlocks = extractJsonLdBlocks(page.html);
  if (jsonLdBlocks.length > 0) {
    observations.push({
      entityType: "company",
      attribute: "json_ld",
      rawValue: JSON.stringify(jsonLdBlocks),
      confidence: 0.75,
    });

    for (const block of jsonLdBlocks) {
      const orgName = extractOrganizationNameFromJsonLd(block);
      if (orgName) {
        observations.push({
          entityType: "company",
          attribute: "name",
          rawValue: orgName,
          normalizedValue: orgName.toLowerCase(),
          confidence: 0.85,
        });
        break;
      }
    }
  }

  observations.push({
    entityType: "company",
    attribute: "http_status",
    rawValue: String(page.statusCode),
    confidence: 1,
  });

  return observations;
}
