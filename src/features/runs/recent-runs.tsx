"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RunResponse } from "@/shared/contracts";
import { Clock, Loader2 } from "lucide-react";
import { apiClient, ApiClientError } from "@/shared/utils/api-client";
import { formatRelativeTime } from "@/shared/utils/formatters";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/features/shell/empty-state";
import { ErrorState } from "@/features/shell/error-state";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  completed: "success",
  failed: "destructive",
  queued: "secondary",
  discovering: "warning",
  extracting: "warning",
  resolving: "warning",
  enriching: "warning",
  scoring: "warning",
};

export function RecentRuns() {
  const [runs, setRuns] = useState<RunResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .listRecentRuns()
      .then(setRuns)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Failed to load runs"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Could not load runs" message={error} />;
  }

  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        description="Submit a domain above to start your first lead intelligence run."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] bg-surface-raised text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Domain</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] bg-surface">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-surface-raised/50">
              <td className="px-3 py-2">
                <Link href={`/runs/${run.id}`} className="font-medium text-accent hover:underline">
                  {run.normalizedDomain}
                </Link>
              </td>
              <td className="px-3 py-2">
                <Badge variant={STATUS_VARIANT[run.status] ?? "secondary"}>{run.status}</Badge>
              </td>
              <td className="px-3 py-2 text-muted">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(run.createdAt)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
