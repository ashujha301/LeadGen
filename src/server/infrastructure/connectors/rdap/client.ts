import { USER_AGENT } from "@/shared/config";

import type { ConnectorResult, RdapDomainResult } from "../types";

const RDAP_BASE_URL = "https://rdap.org/domain";
const DEFAULT_TIMEOUT_MS = 15_000;

export type LookupDomainOptions = {
  timeoutMs?: number;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readEventDate(events: unknown[], action: string): string | null {
  if (!Array.isArray(events)) {
    return null;
  }

  for (const event of events) {
    if (!event || typeof event !== "object") {
      continue;
    }

    const record = event as Record<string, unknown>;
    if (record.eventAction === action) {
      return readString(record.eventDate);
    }
  }

  return null;
}

function readNameservers(nameservers: unknown): string[] {
  if (!Array.isArray(nameservers)) {
    return [];
  }

  return nameservers
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      return readString((entry as Record<string, unknown>).ldhName);
    })
    .filter((value): value is string => Boolean(value));
}

function readRegistrar(payload: Record<string, unknown>): string | null {
  const entities = payload.entities;
  if (!Array.isArray(entities)) {
    return null;
  }

  for (const entity of entities) {
    if (!entity || typeof entity !== "object") {
      continue;
    }

    const record = entity as Record<string, unknown>;
    const roles = record.roles;
    if (!Array.isArray(roles) || !roles.includes("registrar")) {
      continue;
    }

    const vcard = record.vcardArray;
    if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
      for (const field of vcard[1]) {
        if (Array.isArray(field) && field[0] === "fn") {
          const name = readString(field[3]);
          if (name) {
            return name;
          }
        }
      }
    }

    return readString(record.handle);
  }

  return null;
}

export function mapRdapPayload(domain: string, payload: unknown): RdapDomainResult {
  const record =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  const status = Array.isArray(record.status)
    ? record.status.filter((value): value is string => typeof value === "string")
    : [];

  return {
    domain,
    registrar: readRegistrar(record),
    createdDate: readEventDate(record.events as unknown[], "registration"),
    updatedDate: readEventDate(record.events as unknown[], "last changed"),
    expiresDate: readEventDate(record.events as unknown[], "expiration"),
    status,
    nameservers: readNameservers(record.nameservers),
    raw: payload,
  };
}

export async function lookupDomain(
  domain: string,
  options: LookupDomainOptions = {},
): Promise<ConnectorResult<RdapDomainResult>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${RDAP_BASE_URL}/${encodeURIComponent(domain)}`, {
      method: "GET",
      headers: {
        Accept: "application/rdap+json, application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: "error",
        error: `RDAP lookup failed with status ${response.status}`,
      };
    }

    const payload = (await response.json()) as unknown;
    return {
      status: "success",
      data: mapRdapPayload(domain, payload),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown RDAP error";
    return { status: "error", error: message };
  } finally {
    clearTimeout(timeout);
  }
}
