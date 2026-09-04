import type { ExplainLeadInput } from "../schemas/lead-explanation";

export function buildExplainLeadPrompt(input: ExplainLeadInput): string {
  const componentLines = input.scoreComponents
    .map(
      (component) =>
        `- ${component.label}: ${component.contribution} points (${component.reasonCode})`,
    )
    .join("\n");

  const evidenceLines = input.evidence
    .slice(0, 5)
    .map((item) => `- ${item.excerpt} (${item.sourceUrl}, confidence ${item.confidence})`)
    .join("\n");

  return [
    "Write a concise sales-facing explanation for why this lead was prioritized.",
    "Reference only the supplied score components and evidence.",
    "Do not invent facts, contacts, or score values.",
    "",
    `Person: ${input.personName}`,
    `Company: ${input.companyName}`,
    `Total score: ${input.totalScore}`,
    "",
    "Score components:",
    componentLines || "- none provided",
    "",
    "Evidence:",
    evidenceLines || "- none provided",
  ].join("\n");
}
