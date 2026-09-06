import type { RunWarning } from "@/shared/contracts";
import {
  CRUSTDATA_CREDITS_EXHAUSTED,
  CRUSTDATA_CREDITS_WARNING_MESSAGE,
  CRUSTDATA_CREDITS_WARNING_TITLE,
} from "@/shared/config/crustdata-warnings";

export {
  CRUSTDATA_CREDITS_EXHAUSTED,
  CRUSTDATA_ACCESS_DENIED,
  CRUSTDATA_CREDITS_WARNING_TITLE,
  CRUSTDATA_CREDITS_WARNING_MESSAGE,
} from "@/shared/config/crustdata-warnings";

type AttemptLike = {
  errorCode?: string | null;
  connectorName?: string | null;
};

export function buildRunWarnings(attempts: AttemptLike[]): RunWarning[] {
  const hasCreditExhaustion = attempts.some(
    (attempt) => attempt.errorCode === CRUSTDATA_CREDITS_EXHAUSTED,
  );
  if (!hasCreditExhaustion) {
    return [];
  }

  return [
    {
      code: CRUSTDATA_CREDITS_EXHAUSTED,
      provider: "crustdata",
      title: CRUSTDATA_CREDITS_WARNING_TITLE,
      message: CRUSTDATA_CREDITS_WARNING_MESSAGE,
    },
  ];
}
