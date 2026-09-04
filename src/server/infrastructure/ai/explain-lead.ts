import { REASON_CODES } from "@/server/domain/scoring";
import type { Db } from "@/server/infrastructure/db";

import { createStructuredResponse } from "./client";
import { buildExplainLeadPrompt } from "./prompts/explain";
import {
  LEAD_EXPLANATION_SCHEMA_VERSION,
  leadExplanationSchema,
  type ExplainLeadInput,
} from "./schemas/lead-explanation";

export type ExplainLeadResult =
  | { status: "success"; explanation: string; source: "ai" | "fallback"; durationMs: number }
  | { status: "disabled"; explanation: string; source: "fallback" }
  | { status: "error"; explanation: string; source: "fallback"; durationMs: number };

const REASON_CODE_MESSAGES: Record<string, string> = {
  [REASON_CODES.icp.industryMatch]: "The company aligns with the target industry profile.",
  [REASON_CODES.icp.locationMatch]: "The company matches the requested location focus.",
  [REASON_CODES.icp.employeeRangeMatch]: "Company size fits the configured employee range.",
  [REASON_CODES.icp.partialIcp]: "The lead partially matches the configured ICP filters.",
  [REASON_CODES.icp.noIcpMatch]: "ICP fit is limited based on available company attributes.",
  [REASON_CODES.authority.founderOwner]: "The person appears to be a founder or owner.",
  [REASON_CODES.authority.cSuite]: "The person holds C-suite decision authority.",
  [REASON_CODES.authority.vpDirector]: "The person holds VP or director-level authority.",
  [REASON_CODES.authority.manager]: "The person appears to be a manager-level contact.",
  [REASON_CODES.authority.individualContributor]: "The person appears to be an individual contributor.",
  [REASON_CODES.authority.unknownRole]: "Decision authority is uncertain from available role data.",
  [REASON_CODES.signals.funding]: "Recent funding activity suggests a timely outreach window.",
  [REASON_CODES.signals.hiring]: "Hiring activity indicates potential buying motion.",
  [REASON_CODES.signals.expansion]: "Expansion signals suggest active growth.",
  [REASON_CODES.signals.productLaunch]: "A recent product launch may create outreach relevance.",
  [REASON_CODES.signals.leadershipChange]: "Leadership change signals may increase receptivity.",
  [REASON_CODES.signals.none]: "No strong business timing signals were observed.",
  [REASON_CODES.contact.verifiedEmail]: "A verified email improves contactability.",
  [REASON_CODES.contact.unverifiedEmail]: "An email is available but not verified.",
  [REASON_CODES.contact.phone]: "A phone contact point is available.",
  [REASON_CODES.contact.linkedin]: "A LinkedIn profile provides an alternate contact path.",
  [REASON_CODES.contact.none]: "Contact details are limited.",
  [REASON_CODES.evidence.multiSource]: "Multiple independent sources support the lead.",
  [REASON_CODES.evidence.singleSource]: "Evidence comes from a single source.",
  [REASON_CODES.evidence.highConfidence]: "Supporting evidence is high confidence.",
  [REASON_CODES.evidence.lowConfidence]: "Supporting evidence confidence is limited.",
  [REASON_CODES.evidence.stale]: "Some supporting evidence appears stale.",
};

export function buildFallbackExplanation(input: ExplainLeadInput): string {
  const sortedComponents = [...input.scoreComponents].sort(
    (a, b) => b.contribution - a.contribution,
  );
  const topComponents = sortedComponents.slice(0, 3);
  const reasonSentences = topComponents.map((component) => {
    const message =
      REASON_CODE_MESSAGES[component.reasonCode] ??
      `${component.label} contributed ${component.contribution} points.`;
    return message;
  });

  const evidenceSentence =
    input.evidence.length > 0
      ? `Evidence includes "${input.evidence[0]?.excerpt}" from ${input.evidence[0]?.sourceUrl}.`
      : "Evidence is limited.";

  return [
    `${input.personName} at ${input.companyName} scored ${input.totalScore} based on deterministic scoring.`,
    reasonSentences.join(" "),
    evidenceSentence,
  ].join(" ");
}

export async function explainLead(
  input: ExplainLeadInput & { runId?: string; db?: Db },
): Promise<ExplainLeadResult> {
  const fallback = buildFallbackExplanation(input);
  const prompt = buildExplainLeadPrompt(input);

  const result = await createStructuredResponse({
    operation: "explain_lead",
    schema: leadExplanationSchema,
    schemaVersion: LEAD_EXPLANATION_SCHEMA_VERSION,
    prompt,
    runId: input.runId,
    db: input.db,
  });

  if (result.status === "disabled") {
    return {
      status: "disabled",
      explanation: fallback,
      source: "fallback",
    };
  }

  if (result.status === "error") {
    return {
      status: "error",
      explanation: fallback,
      source: "fallback",
      durationMs: result.durationMs,
    };
  }

  const explanation = [result.data.summary, ...result.data.highlights].filter(Boolean).join(" ");

  return {
    status: "success",
    explanation,
    source: "ai",
    durationMs: result.durationMs,
  };
}

export type { ExplainLeadInput };
