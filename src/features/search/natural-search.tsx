"use client";

import { useState } from "react";
import type { NaturalSearchResponse } from "@/shared/contracts";
import { Loader2, Search, Sparkles } from "lucide-react";
import { apiClient, ApiClientError } from "@/shared/utils/api-client";
import { formatPercent, formatScore } from "@/shared/utils/formatters";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type NaturalSearchProps = {
  runId?: string;
  compact?: boolean;
};

export function NaturalSearch({ runId, compact }: NaturalSearchProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<NaturalSearchResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.naturalSearch(query.trim(), runId);
      setResults(response);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Search failed");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`space-y-3 ${compact ? "" : "rounded-md border border-[var(--border)] bg-surface p-4"}`}>
      {!compact && (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-accent" />
          Natural language search
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          placeholder={
            runId
              ? "e.g. founders with score above 70"
              : "Search collected leads by role, score, or history"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" disabled={loading || !query.trim()} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive" title="Search failed">
          {error}
        </Alert>
      )}

      {results && (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            {results.results.length} result{results.results.length === 1 ? "" : "s"}
            {results.intent.sortBy && ` · sorted by ${results.intent.sortBy}`}
          </p>
          {results.results.length === 0 ? (
            <p className="text-sm text-muted">No leads matched your query.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
              {results.results.map((result) => (
                <li key={result.leadId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <Link href={`/leads/${result.leadId}`} className="font-medium text-accent hover:underline">
                      {result.personName}
                    </Link>
                    <span className="ml-2 text-muted">{result.companyName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{formatScore(result.score)}</Badge>
                    <span className="text-xs text-muted">{formatPercent(result.confidence)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
