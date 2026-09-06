import { createHash } from "node:crypto";

import type { FunctionToken } from "@/shared/contracts/roles";
import { employerMatchKind } from "./employer-identity";

export type StrengthBand = "strong" | "moderate" | "weak";
export type EvidenceLabel = "strong" | "supported" | "limited";

const FUNCTION_ADJACENCY: Record<string, FunctionToken[]> = {
  product: ["engineering"],
  engineering: ["product"],
  sales: ["customer_success", "marketing"],
  marketing: ["sales", "product"],
  customer_success: ["sales"],
  operations: ["finance", "people"],
  finance: ["operations"],
  people: ["operations"],
  executive: ["product", "engineering", "sales", "operations"],
};

function daysBetween(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
  return Math.floor((endMs - startMs) / 86_400_000);
}

function durationPoints(overlapDays: number): number {
  if (overlapDays >= 730) return 35;
  if (overlapDays >= 365) return 28;
  if (overlapDays >= 180) return 20;
  if (overlapDays >= 90) return 10;
  return 0;
}

function roleProximityPoints(
  functionsA: FunctionToken[],
  functionsB: FunctionToken[],
): { points: number; codes: string[] } {
  const setA = new Set(functionsA);
  const setB = new Set(functionsB);
  for (const token of setA) {
    if (setB.has(token)) {
      return { points: 30, codes: ["SAME_FUNCTION"] };
    }
  }

  for (const token of setA) {
    const neighbors = FUNCTION_ADJACENCY[token] ?? [];
    if (neighbors.some((neighbor) => setB.has(neighbor))) {
      const code =
        (token === "product" && setB.has("engineering")) ||
        (token === "engineering" && setB.has("product"))
          ? "ADJACENT_PRODUCT_ENGINEERING"
          : "ADJACENT_FUNCTION";
      return { points: 18, codes: [code] };
    }
  }

  return { points: 0, codes: [] };
}

function cohortPoints(startA: string, startB: string): number {
  const delta = Math.abs(daysBetween(startA, startB));
  if (delta <= 180) return 10;
  if (delta <= 365) return 5;
  return 0;
}

function recencyPoints(overlapEnd: string, asOfDate: string): { points: number; codes: string[] } {
  const ageDays = daysBetween(overlapEnd, asOfDate);
  if (ageDays <= 365 * 2) {
    return { points: 15, codes: ["RECENT_OVERLAP"] };
  }
  if (ageDays <= 365 * 5) {
    return { points: 10, codes: [] };
  }
  return { points: 5, codes: [] };
}

export function scorePotentialConnectionStrength(input: {
  overlapDays: number;
  functionsA: FunctionToken[];
  functionsB: FunctionToken[];
  startA: string;
  startB: string;
  overlapEnd: string;
  sharedEmployerCount: number;
  asOfDate: string;
  employerKey?: string;
}): {
  strengthScore: number;
  band: StrengthBand;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  let score = 0;

  const duration = durationPoints(input.overlapDays);
  score += duration;
  if (input.overlapDays >= 365) {
    reasonCodes.push("OVERLAP_12M_PLUS");
  }

  const role = roleProximityPoints(input.functionsA, input.functionsB);
  score += role.points;
  reasonCodes.push(...role.codes);

  score += cohortPoints(input.startA, input.startB);

  const recency = recencyPoints(input.overlapEnd, input.asOfDate);
  score += recency.points;
  reasonCodes.push(...recency.codes);

  if (input.sharedEmployerCount > 1) {
    score += 10;
    reasonCodes.push("REPEATED_CONTEXT");
  }

  if (input.employerKey?.startsWith("domain:")) {
    reasonCodes.push("EXACT_DOMAIN_MATCH");
  }

  const strengthScore = Math.min(100, score);
  const band: StrengthBand =
    strengthScore >= 75 ? "strong" : strengthScore >= 50 ? "moderate" : "weak";

  return { strengthScore, band, reasonCodes: [...new Set(reasonCodes)] };
}

export function scoreEvidenceQuality(input: {
  hasProviderCompanyId: boolean;
  employerMatchKind: ReturnType<typeof employerMatchKind> | "domain" | "provider" | "linkedin" | "company" | "name";
  datesComplete: boolean;
  provenanceFresh: boolean;
}): { score: number; label: EvidenceLabel } {
  let score = 0;
  if (input.hasProviderCompanyId || input.employerMatchKind === "domain") score += 40;
  else if (input.employerMatchKind === "linkedin" || input.employerMatchKind === "provider")
    score += 30;
  else if (input.employerMatchKind === "company") score += 20;
  else score += 5;

  if (input.datesComplete) score += 35;
  else score += 10;

  if (input.provenanceFresh) score += 25;
  else score += 10;

  const label: EvidenceLabel = score >= 80 ? "strong" : score >= 55 ? "supported" : "limited";
  return { score, label };
}

export function buildStableConnectionId(
  personAId: string,
  personBId: string,
  employerKey: string,
): string {
  const [left, right] = [personAId, personBId].sort();
  return createHash("sha256").update(`${left}|${right}|${employerKey}`).digest("hex").slice(0, 24);
}
