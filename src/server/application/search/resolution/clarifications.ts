import type { ClarificationQuestion } from "@/shared/contracts/natural-search-v2";

export type ClarificationPlanInput = {
  mode: "leads" | "timeline" | "connections";
  personName?: string | null;
  unresolvedCompany?: string | null;
  relationshipAmbiguous?: boolean;
  companyCandidates?: Array<{ id: string; label: string; description?: string }>;
  personCandidates?: Array<{ id: string; label: string; description?: string }>;
};

/**
 * Build up to three grouped clarification questions for unresolved slots.
 */
export function planClarifications(input: ClarificationPlanInput): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];

  if (input.relationshipAmbiguous && input.unresolvedCompany) {
    questions.push({
      id: "relationship-1",
      slot: "relationship",
      prompt: input.personName
        ? `How is ${input.personName} related to ${input.unresolvedCompany}?`
        : `How should we treat ${input.unresolvedCompany} in this timeline search?`,
      selection: "single_select",
      allowCustomAnswer: false,
      options: [
        {
          id: "rel-current",
          label: "Current company",
          description: "They work there now",
        },
        {
          id: "rel-previous",
          label: "Previous company",
          description: "They worked there before",
        },
        {
          id: "rel-lead",
          label: "Lead / associated company",
          description: "Match the company on the lead record",
        },
      ],
    });
  }

  if (input.companyCandidates && input.companyCandidates.length > 0) {
    questions.push({
      id: "company-1",
      slot: "company",
      prompt: `Which company did you mean by "${input.unresolvedCompany ?? "that name"}"?`,
      selection: "single_select",
      allowCustomAnswer: true,
      options: input.companyCandidates.slice(0, 5).map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        description: candidate.description,
      })),
    });
  }

  if (input.personCandidates && input.personCandidates.length > 0) {
    questions.push({
      id: "person-1",
      slot: "personName",
      prompt: "Which person did you mean?",
      selection: "single_select",
      allowCustomAnswer: true,
      options: input.personCandidates.slice(0, 5).map((candidate) => ({
        id: candidate.id,
        label: candidate.label,
        description: candidate.description,
      })),
    });
  }

  return questions.slice(0, 3);
}
