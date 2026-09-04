import { getEnv } from "@/shared/config/server";

import type { ConnectorResult, EmailVerificationResult } from "../types";

const DEFAULT_TIMEOUT_MS = 15_000;
const EMAIL_VERIFIER_BASE_URL = "https://api.emailverifier.io/v1";

export function isEmailVerifierEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.ENABLE_EMAIL_VERIFIER && env.EMAIL_VERIFIER_API_KEY);
}

export type VerifyEmailOptions = {
  timeoutMs?: number;
};

function mapProviderStatus(value: unknown): EmailVerificationResult["status"] {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.toLowerCase();
  if (["valid", "verified", "deliverable"].includes(normalized)) {
    return "verified";
  }
  if (["invalid", "undeliverable", "disposable"].includes(normalized)) {
    return "invalid";
  }
  if (["risky", "unknown", "catch_all"].includes(normalized)) {
    return "unverified";
  }

  return "unknown";
}

export async function verifyEmail(
  email: string,
  options: VerifyEmailOptions = {},
): Promise<ConnectorResult<EmailVerificationResult>> {
  const env = getEnv();

  if (!env.ENABLE_EMAIL_VERIFIER || !env.EMAIL_VERIFIER_API_KEY) {
    return {
      status: "disabled",
      reason: "Email verification is disabled or missing API key",
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${EMAIL_VERIFIER_BASE_URL}/verify?email=${encodeURIComponent(email)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${env.EMAIL_VERIFIER_API_KEY}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return {
        status: "error",
        error: `Email verifier request failed with status ${response.status}`,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;

    return {
      status: "success",
      data: {
        email,
        status: mapProviderStatus(payload.status ?? payload.result),
        provider: "email_verifier",
        raw: payload,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email verifier error";
    return { status: "error", error: message };
  } finally {
    clearTimeout(timeout);
  }
}
