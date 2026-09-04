import type {
  ApiError,
  ApiSuccess,
  CompanyDetail,
  GraphResponse,
  LeadDetail,
  LeadSummary,
  NaturalSearchResponse,
  OverlapResult,
  PersonDetail,
  RoleCriteria,
  RunResponse,
} from "@/shared/contracts";

const API_BASE = "/api";

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function parseResponse<T>(response: Response): Promise<{ data: T; nextCursor?: string | null }> {
  const body = (await response.json()) as ApiSuccess<T> | { error: ApiError };

  if (!response.ok) {
    const err = "error" in body ? body.error : null;
    throw new ApiClientError(
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? "Request failed",
      err?.requestId ?? crypto.randomUUID(),
      response.status,
    );
  }

  const success = body as ApiSuccess<T>;
  return { data: success.data, nextCursor: success.meta?.nextCursor };
}

export const apiClient = {
  async createRun(payload: {
    domain: string;
    icp?: { industries?: string[]; locations?: string[]; employeeRange?: { min?: number; max?: number } };
    roleCriteria?: RoleCriteria;
    targetRoles?: string[];
  }) {
    const res = await fetch(`${API_BASE}/v1/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });
    return (await parseResponse<RunResponse>(res)).data;
  },

  async listRecentRuns() {
    const res = await fetch(`${API_BASE}/v1/runs`);
    return (await parseResponse<RunResponse[]>(res)).data;
  },

  async getRun(runId: string) {
    const res = await fetch(`${API_BASE}/v1/runs/${runId}`);
    return (await parseResponse<RunResponse>(res)).data;
  },

  async getRunLeads(runId: string, scope: "matched" | "all" = "matched", cursor?: string) {
    const params = new URLSearchParams();
    params.set("scope", scope);
    if (cursor) params.set("cursor", cursor);
    const query = params.toString();
    const res = await fetch(`${API_BASE}/v1/runs/${runId}/leads?${query}`);
    const { data, nextCursor } = await parseResponse<LeadSummary[]>(res);
    return { leads: data, nextCursor: nextCursor ?? null };
  },

  async getLead(leadId: string) {
    const res = await fetch(`${API_BASE}/v1/leads/${leadId}`);
    return (await parseResponse<LeadDetail>(res)).data;
  },

  async getLeadGraph(leadId: string) {
    const res = await fetch(`${API_BASE}/v1/leads/${leadId}/graph`);
    return (await parseResponse<GraphResponse>(res)).data;
  },

  async getCompany(companyId: string) {
    const res = await fetch(`${API_BASE}/v1/companies/${companyId}`);
    return (await parseResponse<CompanyDetail>(res)).data;
  },

  async getPerson(personId: string) {
    const res = await fetch(`${API_BASE}/v1/people/${personId}`);
    return (await parseResponse<PersonDetail>(res)).data;
  },

  async naturalSearch(query: string, runId?: string) {
    const res = await fetch(`${API_BASE}/v1/search/natural`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, runId }),
    });
    return (await parseResponse<NaturalSearchResponse>(res)).data;
  },

  async findOverlaps(params: { companyId: string; personId?: string; minOverlapDays?: number }) {
    const search = new URLSearchParams({ companyId: params.companyId });
    if (params.personId) search.set("personId", params.personId);
    if (params.minOverlapDays) search.set("minOverlapDays", String(params.minOverlapDays));
    const res = await fetch(`${API_BASE}/v1/connections/overlap?${search}`);
    return (await parseResponse<OverlapResult[]>(res)).data;
  },

  async getEntityMatches() {
    const res = await fetch(`${API_BASE}/v1/entity-matches`);
    return (await parseResponse<
      Array<{
        id: string;
        entityType: string;
        candidateA: { id: string; label: string };
        candidateB: { id: string; label: string };
        matchScore: number;
        reasons: string[];
        decision: string;
      }>
    >(res)).data;
  },

  exportRunUrl(runId: string) {
    return `${API_BASE}/v1/exports/${runId}`;
  },
};
