import { getEnv } from "@/shared/config/server";

import { buildCacheKey, getCached, setCached } from "./cache";
import {
  closeEndpointCircuit,
  isEndpointCircuitOpen,
  openEndpointCircuit,
  resetCircuitBreakers,
} from "./circuit-breaker";
import {
  mapCompanyDataToResult,
  mapPersonDataToEnrichResult,
  mapSearchProfileToPersonResult,
} from "./mapper";
import {
  configureEndpointLimiter,
  getEndpointLimiter,
  type EndpointLimiterKey,
} from "./rate-limiter";
import {
  crustdataCompanyEnrichResponseSchema,
  crustdataPersonEnrichEntrySchema,
  crustdataPersonSearchResponseSchema,
} from "./schemas";
import type {
  ConnectorResult,
  CrustdataCompanyResult,
  CrustdataPeopleSearchResult,
  CrustdataPersonEnrichResult,
  CrustdataPersonResult,
} from "../types";
import type { ZodError } from "zod";

export type CrustdataRequestMeta = {
  endpoint: string;
  status: number;
  durationMs: number;
  attempts: number;
  recordsReturned: number;
  cacheStatus: "hit" | "miss" | "bypass";
  creditsUsed?: number;
};

export type CrustdataOutcome<T> =
  | { status: "success"; data: T; meta: CrustdataRequestMeta }
  | { status: "no_match"; meta: CrustdataRequestMeta }
  | { status: "terminal"; outcome: "not_found" | "redacted"; meta: CrustdataRequestMeta }
  | { status: "disabled"; reason: string }
  | { status: "error"; error: string; errorCode?: string; meta?: CrustdataRequestMeta };

let limitersInitialized = false;

export function isCrustdataEnabled(): boolean {
  const env = getEnv();
  return Boolean(env.ENABLE_CRUSTDATA && env.CRUSTDATA_API_KEY);
}

export function resetCrustdataClientState(): void {
  resetCircuitBreakers();
  limitersInitialized = false;
}

export async function initializeCrustdataLimiters(): Promise<void> {
  if (limitersInitialized) {
    return;
  }

  const env = getEnv();
  const defaults: Record<EndpointLimiterKey, number> = {
    company_enrich: env.CRUSTDATA_COMPANY_RPM,
    person_search: env.CRUSTDATA_PERSON_SEARCH_RPM,
    person_enrich: env.CRUSTDATA_PERSON_ENRICH_RPM,
  };

  for (const [key, rpm] of Object.entries(defaults) as Array<[EndpointLimiterKey, number]>) {
    configureEndpointLimiter(key, rpm);
  }

  limitersInitialized = true;
}

function buildHeaders(version: string, apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-version": version,
  };
}

type FetchOptions = {
  endpoint: string;
  limiterKey: EndpointLimiterKey;
  body: unknown;
  timeoutMs: number;
  cacheTtlMs?: number;
  cacheBypass?: boolean;
  signal?: AbortSignal;
};

async function fetchWithRetry<T>(
  options: FetchOptions,
  parse: (payload: unknown) => T,
  isEmpty: (data: T) => boolean,
): Promise<CrustdataOutcome<T>> {
  const env = getEnv();

  if (!env.ENABLE_CRUSTDATA || !env.CRUSTDATA_API_KEY) {
    return { status: "disabled", reason: "Crustdata is disabled or missing API key" };
  }

  if (isEndpointCircuitOpen(options.limiterKey)) {
    return {
      status: "disabled",
      reason: `Crustdata ${options.limiterKey} circuit open after auth failure`,
    };
  }

  await initializeCrustdataLimiters();

  console.log(`[crustdata] start ${options.limiterKey} ${options.endpoint}`);

  const cacheKey = buildCacheKey(options.endpoint, options.body);
  if (options.cacheTtlMs && !options.cacheBypass) {
    const cached = getCached<T>(cacheKey, options.cacheTtlMs);
    if (cached) {
      return {
        status: isEmpty(cached) ? "no_match" : "success",
        data: cached,
        meta: {
          endpoint: options.endpoint,
          status: 200,
          durationMs: 0,
          attempts: 0,
          recordsReturned: countRecords(cached),
          cacheStatus: "hit",
        },
      } as CrustdataOutcome<T>;
    }
  }

  const limiter = getEndpointLimiter(options.limiterKey);
  let attempts = 0;
  const startedAt = Date.now();

  while (attempts < 3) {
    attempts += 1;

    try {
      const result = await limiter.schedule(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
        const onExternalAbort = () => controller.abort();
        options.signal?.addEventListener("abort", onExternalAbort, { once: true });

        try {
          if (options.signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          const response = await fetch(`${env.CRUSTDATA_API_BASE_URL}${options.endpoint}`, {
            method: "POST",
            headers: buildHeaders(env.CRUSTDATA_API_VERSION, env.CRUSTDATA_API_KEY!),
            body: JSON.stringify(options.body),
            signal: controller.signal,
          });

          const durationMs = Date.now() - startedAt;
          const creditsUsed = readCreditsHeader(response.headers);

          if (response.status === 400) {
            const errorBody = await response.json().catch(() => null);
            const sanitized = sanitizeCrustdataError(errorBody);
            console.warn(
              `[crustdata] http_400 endpoint=${options.endpoint} reason=${sanitized.reason} type=${sanitized.type} requestId=${sanitized.requestId} durationMs=${durationMs} attempts=${attempts} credits=${creditsUsed ?? "n/a"} fields=${summarizeRequestedFields(options.body)}`,
            );
            return {
              kind: "error" as const,
              error: sanitized.reason
                ? `Bad request (${response.status}): ${sanitized.reason}`
                : `Bad request (${response.status})`,
              meta: buildMeta(
                options.endpoint,
                response.status,
                durationMs,
                attempts,
                0,
                "miss",
                creditsUsed,
              ),
            };
          }

          if (response.status === 401) {
            openEndpointCircuit(options.limiterKey);
            return {
              kind: "error" as const,
              error: "Unauthorized",
              meta: buildMeta(
                options.endpoint,
                response.status,
                durationMs,
                attempts,
                0,
                "miss",
                creditsUsed,
              ),
            };
          }

          if (response.status === 403) {
            const errorBody = await response.json().catch(() => null);
            const sanitized = sanitizeCrustdataError(errorBody);
            const errorCode = classifyCrustdata403(sanitized);
            console.warn(
              `[crustdata] http_403 endpoint=${options.endpoint} code=${errorCode} reason=${sanitized.reason} type=${sanitized.type} requestId=${sanitized.requestId} durationMs=${durationMs} attempts=${attempts} credits=${creditsUsed ?? "n/a"}`,
            );
            return {
              kind: "error" as const,
              error:
                errorCode === "CRUSTDATA_CREDITS_EXHAUSTED"
                  ? "Crustdata credits exhausted"
                  : "Crustdata access denied",
              errorCode,
              meta: buildMeta(
                options.endpoint,
                response.status,
                durationMs,
                attempts,
                0,
                "miss",
                creditsUsed,
              ),
            };
          }

          if (response.status === 404) {
            return {
              kind: "no_match" as const,
              meta: buildMeta(
                options.endpoint,
                response.status,
                durationMs,
                attempts,
                0,
                "miss",
                creditsUsed,
              ),
            };
          }

          if (response.status === 429) {
            const retryAfterMs = readRetryAfterMs(response.headers);
            await sleep(retryAfterMs);
            throw new RetryableError("Rate limited");
          }

          if (response.status >= 500) {
            throw new RetryableError(`Server error ${response.status}`);
          }

          if (!response.ok) {
            return {
              kind: "error" as const,
              error: `Request failed with status ${response.status}`,
              meta: buildMeta(
                options.endpoint,
                response.status,
                durationMs,
                attempts,
                0,
                "miss",
                creditsUsed,
              ),
            };
          }

          const payload = await response.json();
          const data = parse(payload);
          const recordsReturned = countRecords(data);

          closeEndpointCircuit(options.limiterKey);

          if (options.cacheTtlMs) {
            setCached(cacheKey, data);
          }

          if (isEmpty(data)) {
            return {
              kind: "no_match" as const,
              meta: buildMeta(
                options.endpoint,
                response.status,
                durationMs,
                attempts,
                recordsReturned,
                "miss",
                creditsUsed,
              ),
            };
          }

          return {
            kind: "success" as const,
            data,
            meta: buildMeta(
              options.endpoint,
              response.status,
              durationMs,
              attempts,
              recordsReturned,
              "miss",
              creditsUsed,
            ),
          };
        } finally {
          clearTimeout(timeout);
          options.signal?.removeEventListener("abort", onExternalAbort);
        }
      });

      if (result.kind === "success") {
        return { status: "success", data: result.data, meta: result.meta };
      }
      if (result.kind === "no_match") {
        return { status: "no_match", meta: result.meta };
      }
      return {
        status: "error",
        error: result.error,
        errorCode: "errorCode" in result ? result.errorCode : undefined,
        meta: result.meta,
      };
    } catch (error) {
      if (error instanceof RetryableError && attempts < 3) {
        await sleep(exponentialBackoffMs(attempts));
        continue;
      }

      const message = error instanceof Error ? error.message : "Unknown Crustdata error";
      const isTimeout = /abort|timeout/i.test(message);
      return {
        status: "error",
        error: isTimeout ? "Request timed out" : message,
        meta: buildMeta(options.endpoint, 0, Date.now() - startedAt, attempts, 0, "miss"),
      };
    }
  }

  return { status: "error", error: "Maximum retry attempts exceeded" };
}

class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

function buildMeta(
  endpoint: string,
  status: number,
  durationMs: number,
  attempts: number,
  recordsReturned: number,
  cacheStatus: "hit" | "miss" | "bypass",
  creditsUsed?: number,
): CrustdataRequestMeta {
  return { endpoint, status, durationMs, attempts, recordsReturned, cacheStatus, creditsUsed };
}

function countRecords(data: unknown): number {
  if (data === null || data === undefined) {
    return 0;
  }
  if (Array.isArray(data)) {
    return data.length;
  }
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.people)) {
      return record.people.length;
    }
  }
  return 1;
}

function readCreditsHeader(headers: Headers): number | undefined {
  const value = headers.get("x-credits-used") ?? headers.get("X-Credits-Used");
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readRetryAfterMs(headers: Headers): number {
  const retryAfter = headers.get("Retry-After") ?? headers.get("X-RateLimit-Reset");
  if (!retryAfter) {
    return 5_000;
  }
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1_000;
  }
  const resetAt = Date.parse(retryAfter);
  if (Number.isFinite(resetAt)) {
    return Math.max(resetAt - Date.now(), 1_000);
  }
  return 5_000;
}

function exponentialBackoffMs(attempt: number): number {
  const base = 500 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCompanyEnrich(domain: string, payload: unknown): CrustdataCompanyResult | null {
  const parsed = crustdataCompanyEnrichResponseSchema.parse(payload);
  const match = parsed[0]?.matches[0];
  if (!match) {
    return null;
  }
  return mapCompanyDataToResult(domain, match.company_data, match.confidence_score);
}

function buildPersonSearchBody(
  domain: string,
  limit: number,
  titleConditions?: string[],
): Record<string, unknown> {
  const domainFilter = {
    field: "experience.employment_details.current.company_website_domain",
    type: "=",
    value: domain,
  };

  const body: Record<string, unknown> = {
    filters: domainFilter,
    limit,
    fields: [
      "crustdata_person_id",
      "basic_profile.name",
      "basic_profile.current_title",
      "social_handles.professional_network_identifier.profile_url",
    ],
  };

  if (titleConditions && titleConditions.length > 0) {
    body.filters = {
      op: "and",
      conditions: [
        domainFilter,
        {
          op: "or",
          conditions: titleConditions.map((title) => ({
            field: "experience.employment_details.current.title",
            type: "(.)",
            value: title,
          })),
        },
      ],
    };
  }

  return body;
}

function parsePersonSearch(domain: string, payload: unknown): CrustdataPeopleSearchResult {
  const parsed = crustdataPersonSearchResponseSchema.parse(payload);
  const people = parsed.profiles
    .map(mapSearchProfileToPersonResult)
    .filter((person): person is NonNullable<typeof person> => person !== null);

  return { domain, people, raw: parsed };
}

function buildPersonNameSearchBody(name: string, domain: string): Record<string, unknown> {
  return {
    filters: {
      op: "and",
      conditions: [
        {
          field: "experience.employment_details.current.company_website_domain",
          type: "=",
          value: domain,
        },
        {
          field: "basic_profile.name",
          type: "(.)",
          value: escapeTitleCondition(name),
        },
      ],
    },
    limit: 1,
    fields: [
      "crustdata_person_id",
      "basic_profile.name",
      "basic_profile.current_title",
      "social_handles.professional_network_identifier.profile_url",
    ],
  };
}

function emptyEnrichResult(
  status: CrustdataPersonEnrichResult["status"],
  raw: unknown,
  extras: Partial<CrustdataPersonEnrichResult> = {},
): CrustdataPersonEnrichResult {
  return {
    crustdataPersonId: null,
    status,
    name: null,
    headline: null,
    location: null,
    linkedinUrl: null,
    matchedOn: null,
    providerExperienceYears: null,
    providerUpdatedAt: null,
    matchConfidence: null,
    experience: [],
    education: [],
    skills: [],
    raw,
    ...extras,
  };
}

function describeZodFailure(error: ZodError): { path: string; type: string } {
  const issue = error.issues[0] as
    | {
        path?: Array<string | number>;
        received?: unknown;
        code?: string;
        unionErrors?: Array<{ issues?: Array<{ received?: unknown }> }>;
      }
    | undefined;
  const received =
    issue?.received ?? issue?.unionErrors?.[0]?.issues?.[0]?.received ?? issue?.code ?? "unknown";
  return {
    path: issue?.path?.join(".") || "unknown",
    type: String(received),
  };
}

export function parsePersonEnrich(payload: unknown): CrustdataPersonEnrichResult[] {
  if (!Array.isArray(payload)) {
    throw new Error("Person enrich response must be an array");
  }

  return payload.map((entry) => {
    const parsed = crustdataPersonEnrichEntrySchema.safeParse(entry);
    if (!parsed.success) {
      const failure = describeZodFailure(parsed.error);
      console.warn(`[crustdata] schema_failure path=${failure.path} type=${failure.type}`);
      return emptyEnrichResult("failed", entry, {
        schemaFailurePath: failure.path,
        schemaFailureType: failure.type,
      });
    }

    const status = parsed.data.match_status ?? "matched";
    const match = parsed.data.matches[0];
    if (!match) {
      return emptyEnrichResult(status, parsed.data, {
        linkedinUrl: parsed.data.matched_on ?? null,
        matchedOn: parsed.data.matched_on ?? null,
      });
    }

    return mapPersonDataToEnrichResult(
      match.person_data,
      status,
      parsed.data.matched_on ?? null,
      match.confidence_score ?? null,
    );
  });
}

export function sanitizeCrustdataError(body: unknown): {
  type: string | null;
  reason: string | null;
  requestId: string | null;
} {
  if (!body || typeof body !== "object") {
    return { type: null, reason: null, requestId: null };
  }

  const record = body as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null;

  const type =
    typeof record.type === "string"
      ? record.type
      : typeof nested?.type === "string"
        ? nested.type
        : typeof record.error === "string"
          ? record.error
          : null;

  const reason =
    typeof record.reason === "string"
      ? record.reason
      : typeof nested?.reason === "string"
        ? nested.reason
        : typeof record.description === "string"
          ? record.description
          : typeof nested?.description === "string"
            ? nested.description
            : typeof record.message === "string"
              ? record.message
              : typeof nested?.message === "string"
                ? nested.message
                : null;

  const requestId =
    typeof record.request_id === "string"
      ? record.request_id
      : typeof record.requestId === "string"
        ? record.requestId
        : typeof nested?.request_id === "string"
          ? nested.request_id
          : typeof nested?.requestId === "string"
            ? nested.requestId
            : null;

  return { type, reason, requestId };
}

const CREDIT_EXHAUSTION_PATTERN =
  /insufficient\s+credits?|credits?\s+(are\s+)?exhausted|out\s+of\s+credits?|no\s+credits?\s+remaining|credit\s+limit/i;

export function classifyCrustdata403(sanitized: {
  type: string | null;
  reason: string | null;
}): "CRUSTDATA_CREDITS_EXHAUSTED" | "CRUSTDATA_ACCESS_DENIED" {
  const haystack = [sanitized.type, sanitized.reason].filter(Boolean).join(" ");
  if (CREDIT_EXHAUSTION_PATTERN.test(haystack)) {
    return "CRUSTDATA_CREDITS_EXHAUSTED";
  }
  return "CRUSTDATA_ACCESS_DENIED";
}

function summarizeRequestedFields(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "n/a";
  }
  const fields = (body as { fields?: unknown }).fields;
  return Array.isArray(fields) ? fields.map(String).join(",") : "n/a";
}

export type EnrichCompanyOptions = {
  timeoutMs?: number;
  cacheBypass?: boolean;
  signal?: AbortSignal;
};

export async function enrichCompany(
  domain: string,
  options: EnrichCompanyOptions = {},
): Promise<ConnectorResult<CrustdataCompanyResult>> {
  const env = getEnv();
  const body = {
    domains: [domain],
    exact_match: true,
    fields: ["basic_info", "headcount", "taxonomy", "locations", "people"],
  };

  const outcome = await fetchWithRetry<CrustdataCompanyResult | null>(
    {
      endpoint: "/company/enrich",
      limiterKey: "company_enrich",
      body,
      timeoutMs: options.timeoutMs ?? env.CRUSTDATA_TIMEOUT_MS,
      cacheTtlMs: env.CRUSTDATA_CACHE_TTL_HOURS * 3_600_000,
      cacheBypass: options.cacheBypass,
      signal: options.signal,
    },
    (payload) => parseCompanyEnrich(domain, payload),
    (data) => data === null,
  );

  if (outcome.status === "no_match") {
    return {
      status: "success",
      data: {
        domain,
        crustdataCompanyId: null,
        name: null,
        industry: null,
        employeeCount: null,
        location: null,
        linkedinUrl: null,
        description: null,
        matchScore: null,
        providerUpdatedAt: null,
        founders: [],
        cxos: [],
        decisionMakers: [],
        raw: null,
      },
    };
  }

  return toConnectorResult(outcome as CrustdataOutcome<CrustdataCompanyResult>);
}

export type SearchPeopleOptions = {
  timeoutMs?: number;
  limit?: number;
  titleConditions?: string[];
  signal?: AbortSignal;
};

export async function searchPeopleByCompany(
  domain: string,
  options: SearchPeopleOptions = {},
): Promise<ConnectorResult<CrustdataPeopleSearchResult>> {
  const env = getEnv();
  const body = buildPersonSearchBody(
    domain,
    options.limit ?? env.CRUSTDATA_MAX_PEOPLE_PER_RUN,
    options.titleConditions,
  );

  const outcome = await fetchWithRetry<CrustdataPeopleSearchResult>(
    {
      endpoint: "/person/search",
      limiterKey: "person_search",
      body,
      timeoutMs: options.timeoutMs ?? env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
      cacheTtlMs: env.CRUSTDATA_CACHE_TTL_HOURS * 3_600_000,
      signal: options.signal,
    },
    (payload) => parsePersonSearch(domain, payload),
    (data) => data.people.length === 0,
  );

  if (outcome.status === "no_match") {
    return { status: "success", data: { domain, people: [], raw: null } };
  }

  return toConnectorResult(outcome);
}

export async function searchPersonByNameAndCompany(
  name: string,
  domain: string,
  options: SearchPeopleOptions = {},
): Promise<ConnectorResult<CrustdataPersonResult | null>> {
  const env = getEnv();
  const body = buildPersonNameSearchBody(name, domain);

  const outcome = await fetchWithRetry<CrustdataPeopleSearchResult>(
    {
      endpoint: "/person/search",
      limiterKey: "person_search",
      body,
      timeoutMs: options.timeoutMs ?? env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
      cacheTtlMs: env.CRUSTDATA_CACHE_TTL_HOURS * 3_600_000,
      signal: options.signal,
    },
    (payload) => parsePersonSearch(domain, payload),
    (data) => data.people.length === 0,
  );

  if (outcome.status === "success") {
    return { status: "success", data: outcome.data.people[0] ?? null };
  }
  if (outcome.status === "no_match") {
    return { status: "success", data: null };
  }
  if (outcome.status === "disabled") {
    return { status: "disabled", reason: outcome.reason };
  }
  if (outcome.status === "error") {
    return { status: "error", error: outcome.error, errorCode: outcome.errorCode };
  }
  return { status: "success", data: null };
}

export type EnrichPersonOptions = {
  timeoutMs?: number;
  cacheBypass?: boolean;
  signal?: AbortSignal;
};

export async function enrichPerson(
  profileUrls: string[],
  options: EnrichPersonOptions = {},
): Promise<ConnectorResult<CrustdataPersonEnrichResult[]>> {
  const env = getEnv();
  const body = {
    professional_network_profile_urls: profileUrls,
    fields: ["basic_profile", "social_handles", "experience"],
  };

  const outcome = await fetchWithRetry(
    {
      endpoint: "/person/enrich",
      limiterKey: "person_enrich",
      body,
      timeoutMs: options.timeoutMs ?? env.CRUSTDATA_PEOPLE_TIMEOUT_MS,
      cacheTtlMs: env.CRUSTDATA_CACHE_TTL_HOURS * 3_600_000,
      cacheBypass: options.cacheBypass,
      signal: options.signal,
    },
    (payload) => parsePersonEnrich(payload),
    (data) => data.length === 0,
  );

  if (outcome.status === "success") {
    return { status: "success", data: outcome.data };
  }
  if (outcome.status === "no_match") {
    return { status: "success", data: [] };
  }
  if (outcome.status === "disabled") {
    return { status: "disabled", reason: outcome.reason };
  }
  if (outcome.status === "error") {
    return { status: "error", error: outcome.error, errorCode: outcome.errorCode };
  }
  return { status: "error", error: "terminal_outcome" };
}

function toConnectorResult<T>(outcome: CrustdataOutcome<T>): ConnectorResult<T> {
  if (outcome.status === "success") {
    return { status: "success", data: outcome.data };
  }
  if (outcome.status === "no_match") {
    return { status: "error", error: "no_match" };
  }
  if (outcome.status === "terminal") {
    return { status: "error", error: outcome.outcome };
  }
  if (outcome.status === "disabled") {
    return { status: "disabled", reason: outcome.reason };
  }
  return { status: "error", error: outcome.error, errorCode: outcome.errorCode };
}

/** Escape a custom title for safe use in Crustdata (.) conditions. */
export function escapeTitleCondition(title: string): string {
  return title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build provider-safe title conditions from role criteria. Values only — (.) operator is applied in filters. */
export function buildTitleConditions(titles: string[]): string[] {
  return titles.map((title) => escapeTitleCondition(title.trim())).filter(Boolean);
}
