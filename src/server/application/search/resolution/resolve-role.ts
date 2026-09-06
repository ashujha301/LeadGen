import { normalizeTitle } from "@/server/domain/normalization/title";
import { classifyTitle } from "@/server/domain/roles/classification";

const ROLE_ABBREVIATIONS: Record<string, { canonical: string; aliases: string[] }> = {
  cto: {
    canonical: "chief technology officer",
    aliases: ["cto", "chief technology officer", "chief technical officer"],
  },
  ceo: {
    canonical: "chief executive officer",
    aliases: ["ceo", "chief executive officer"],
  },
  cfo: {
    canonical: "chief financial officer",
    aliases: ["cfo", "chief financial officer"],
  },
  coo: {
    canonical: "chief operating officer",
    aliases: ["coo", "chief operating officer"],
  },
  vp: {
    canonical: "vice president",
    aliases: ["vp", "vice president"],
  },
};

export type RoleResolution =
  | {
      status: "resolved";
      canonicalTitle: string;
      aliases: string[];
      seniorities: string[];
      functions: string[];
      matchStrategy: "abbreviation" | "normalized" | "taxonomy";
    }
  | {
      status: "semantic_fallback";
      raw: string;
      semanticText: string;
    }
  | {
      status: "unresolved";
      raw: string;
    };

/**
 * Deterministic role resolution: abbreviation expansion, normalizeTitle, taxonomy.
 */
export function resolveRoleConstraint(raw: string): RoleResolution {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { status: "unresolved", raw };
  }

  const key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  const abbrev = ROLE_ABBREVIATIONS[key] ?? ROLE_ABBREVIATIONS[trimmed.toLowerCase()];
  if (abbrev) {
    const classification = classifyTitle(abbrev.canonical);
    return {
      status: "resolved",
      canonicalTitle: abbrev.canonical,
      aliases: [...new Set(abbrev.aliases.map((a) => a.toLowerCase()))],
      seniorities: classification.seniorities,
      functions: classification.functions,
      matchStrategy: "abbreviation",
    };
  }

  const normalized = normalizeTitle(trimmed);
  if (!normalized) {
    return { status: "unresolved", raw: trimmed };
  }

  const classification = classifyTitle(normalized);
  const knownAbbrevHit = Object.values(ROLE_ABBREVIATIONS).find(
    (entry) => entry.canonical === normalized || entry.aliases.includes(normalized),
  );
  if (knownAbbrevHit) {
    return {
      status: "resolved",
      canonicalTitle: knownAbbrevHit.canonical,
      aliases: [...new Set(knownAbbrevHit.aliases.map((a) => a.toLowerCase()))],
      seniorities: classification.seniorities,
      functions: classification.functions,
      matchStrategy: "abbreviation",
    };
  }

  if (classification.seniorities.length > 0 || classification.functions.length > 0) {
    return {
      status: "resolved",
      canonicalTitle: normalized,
      aliases: [normalized, trimmed.toLowerCase()],
      seniorities: classification.seniorities,
      functions: classification.functions,
      matchStrategy: "taxonomy",
    };
  }

  // Descriptive / conceptual roles fall through to semantic retrieval.
  if (/\b(leader|leaders|technical|engineering|product|growth)\b/i.test(normalized)) {
    return {
      status: "semantic_fallback",
      raw: trimmed,
      semanticText: trimmed,
    };
  }

  return {
    status: "resolved",
    canonicalTitle: normalized,
    aliases: [normalized],
    seniorities: [],
    functions: [],
    matchStrategy: "normalized",
  };
}
