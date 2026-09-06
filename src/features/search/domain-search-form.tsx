"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { apiClient, ApiClientError } from "@/shared/utils/api-client";
import {
  buildRoleCriteriaPayload,
  IcpFilters,
  type IcpFiltersValue,
} from "@/features/search/icp-filters";

const DEFAULT_FILTERS: IcpFiltersValue = {
  roleCriteria: {
    seniorities: ["founder", "c_suite"],
    functions: [],
    customTitles: [],
  },
};

export function DomainSearchForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [filters, setFilters] = useState<IcpFiltersValue>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const industry = filters.industries?.[0];
    const location = filters.locations?.[0];
    const roleCriteria = buildRoleCriteriaPayload(filters);

    try {
      const run = (await apiClient.createRun({
        domain,
        icp: {
          ...(industry ? { industries: [industry] } : {}),
          ...(location ? { locations: [location] } : {}),
        },
        ...(roleCriteria ? { roleCriteria } : {}),
      })) as { id: string };

      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create run");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-md border border-[var(--border)] bg-surface p-4"
    >
      <div className="space-y-2">
        <label htmlFor="domain" className="text-sm font-medium">
          Company domain or website URL
        </label>
        <div className="flex gap-2">
          <Input
            id="domain"
            placeholder="https://www.appknox.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
          />
          <Button type="submit" disabled={loading || !domain}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-2">Search</span>
          </Button>
        </div>
      </div>

      <IcpFilters value={filters} onChange={setFilters} compact />

      <div className="space-y-1">
        <label htmlFor="sortBy" className="text-xs text-muted">
          Sort preference
        </label>
        <Select id="sortBy" defaultValue="score">
          <option value="score">Score (desc)</option>
          <option value="confidence">Confidence (desc)</option>
          <option value="freshness">Freshness (desc)</option>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive" title="Search failed">
          {error}
        </Alert>
      )}
    </form>
  );
}
