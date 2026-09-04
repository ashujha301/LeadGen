import pino, { type Logger, type LoggerOptions } from "pino";
import { APP_NAME } from "@/shared/config";
import { getRequestId } from "./request-context";

const defaultOptions: LoggerOptions = {
  name: APP_NAME,
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "DATABASE_URL",
      "OPENAI_API_KEY",
      "CRUSTDATA_API_KEY",
      "EMAIL_VERIFIER_API_KEY",
      "IP_HASH_SALT",
    ],
    censor: "[REDACTED]",
  },
};

export function createLogger(options: LoggerOptions = {}): Logger {
  return pino({ ...defaultOptions, ...options });
}

export const logger = createLogger();

export type { Logger, LoggerOptions };
