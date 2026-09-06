import type {
  ClarificationQuestion,
  NaturalSearchInterpretationV2,
  NaturalSearchV2Response,
} from "@/shared/contracts/natural-search-v2";

export type ClarificationSessionPayload = {
  sessionId: string;
  version: number;
  expiresAt: string;
  questions: ClarificationQuestion[];
  interpretation?: NaturalSearchInterpretationV2;
};

export function buildClarificationResponse(
  payload: ClarificationSessionPayload,
): Extract<NaturalSearchV2Response, { status: "needs_clarification" }> {
  return {
    status: "needs_clarification",
    sessionId: payload.sessionId,
    version: payload.version,
    expiresAt: payload.expiresAt,
    questions: payload.questions.slice(0, 3),
    interpretation: payload.interpretation,
  };
}

export const SESSION_TTL_MS = 20 * 60_000;
export const MAX_CLARIFICATION_ROUNDS = 2;
export const MAX_QUESTIONS_PER_RESPONSE = 3;
