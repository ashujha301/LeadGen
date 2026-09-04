import { z } from "zod";

import { getEnv } from "@/shared/config/env";

const workerEnvSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres://")),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  PLAYWRIGHT_HEADLESS: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadConfig(): WorkerConfig {
  return workerEnvSchema.parse(process.env);
}

export const QUEUE_NAME = "process-search-run";

export type CrawlLimits = {
  maxSuccessfulPages: number;
  maxAttempts: number;
  maxDepth: number;
  pageTimeoutMs: number;
  totalTimeoutMs: number;
  concurrency: number;
};

export function getCrawlLimits(): CrawlLimits {
  const env = getEnv();
  return {
    maxSuccessfulPages: env.CRAWL_MAX_SUCCESSFUL_PAGES,
    maxAttempts: env.CRAWL_MAX_ATTEMPTS,
    maxDepth: env.CRAWL_MAX_DEPTH,
    pageTimeoutMs: env.CRAWL_PAGE_TIMEOUT_MS,
    totalTimeoutMs: env.CRAWL_TIMEOUT_MS,
    concurrency: env.CRAWL_CONCURRENCY,
  };
}

/** @deprecated Use getCrawlLimits() for env-backed limits. */
export const CRAWL_LIMITS = {
  maxPages: 10,
  maxDepth: 2,
  concurrency: 1,
  timeoutMs: 90_000,
} as const;
