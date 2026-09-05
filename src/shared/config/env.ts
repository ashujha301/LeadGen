import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(2000),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  CRUSTDATA_API_KEY: z.string().optional(),
  CRUSTDATA_API_BASE_URL: z.string().url().default("https://api.crustdata.com"),
  CRUSTDATA_API_VERSION: z.string().default("2025-11-01"),
  CRUSTDATA_COMPANY_RPM: z.coerce.number().int().positive().default(12),
  CRUSTDATA_PERSON_SEARCH_RPM: z.coerce.number().int().positive().default(24),
  CRUSTDATA_PERSON_ENRICH_RPM: z.coerce.number().int().positive().default(12),
  CRUSTDATA_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(168),
  EMAIL_VERIFIER_API_KEY: z.string().optional(),
  ENABLE_CRUSTDATA: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  ENABLE_EMAIL_VERIFIER: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  CRAWL_MAX_SUCCESSFUL_PAGES: z.coerce.number().int().positive().default(10),
  CRAWL_MAX_ATTEMPTS: z.coerce.number().int().positive().default(25),
  CRAWL_MAX_DEPTH: z.coerce.number().int().positive().default(2),
  CRAWL_CONCURRENCY: z.coerce.number().int().positive().default(2),
  CRAWL_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  CRAWL_PAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  AI_EXTRACTION_CONCURRENCY: z.coerce.number().int().positive().default(2),
  RESOLUTION_CONCURRENCY: z.coerce.number().int().positive().default(2),
  PERSON_ENRICHMENT_CONCURRENCY: z.coerce.number().int().positive().default(3),
  CRUSTDATA_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  CRUSTDATA_PEOPLE_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  CRUSTDATA_MAX_PEOPLE_PER_RUN: z.coerce.number().int().positive().default(25),
  RAW_DATA_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  RAW_ARTIFACTS_BUCKET: z.string().optional(),
  PUBLIC_RUN_LIMIT_PER_IP_DAY: z.coerce.number().int().positive().default(3),
  PUBLIC_GLOBAL_RUN_LIMIT_DAY: z.coerce.number().int().positive().default(50),
  PUBLIC_ACTIVE_RUNS_PER_IP: z.coerce.number().int().positive().default(1),
  IP_HASH_SALT: z.string().min(8).default("dev-salt-change-me"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
  // Auth.js — empty defaults so Docker `next build` works without secrets;
  // sign-in requires real values at runtime.
  AUTH_SECRET: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
