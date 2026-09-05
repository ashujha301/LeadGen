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

function InterpretationChips({ response }: { response: NaturalSearchResponse }) {
  const { intent } = response.interpretation;
  const chips: string[] = [`mode:${intent.mode}`];

  if (intent.mode === "leads") {
    if (intent.roles?.length) chips.push(`roles:${intent.roles.join(",")}`);
    if (intent.company) chips.push(`company:${intent.company}`);
    if (intent.scoreThreshold !== undefined) chips.push(`score>=${intent.scoreThreshold}`);
    if (intent.confidenceThreshold !== undefined) {
      chips.push(`confidence>=${intent.confidenceThreshold}`);
    }
  } else if (intent.mode === "timeline") {
    if (intent.personName) chips.push(`person:${intent.personName}`);
    if (intent.previousCompany) chips.push(`previous:${intent.previousCompany}`);
    if (intent.currentCompany) chips.push(`current:${intent.currentCompany}`);
  } else {
    chips.push(`companyA:${intent.companyA}`);
    if (intent.companyB) chips.push(`companyB:${intent.companyB}`);
    if (intent.minOverlapDays) chips.push(`overlap>=${intent.minOverlapDays}d`);
  }

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <Badge key={chip} variant="secondary">
          {chip}
        </Badge>
      ))}
    </div>
  );
}

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

  const itemCount =
    results?.result.kind === "leads"
      ? results.result.items.length
      : results?.result.kind === "timelines"
        ? results.result.items.length
        : results?.result.kind === "connections"
          ? results.result.items.length
          : 0;

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
          <InterpretationChips response={results} />
          <p className="text-xs text-muted">
            {itemCount} result{itemCount === 1 ? "" : "s"} · {results.interpretation.summary}
          </p>

          {results.result.kind === "leads" &&
            (results.result.items.length === 0 ? (
              <p className="text-sm text-muted">No leads matched your query.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
                {results.result.items.map((result) => (
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
            ))}

          {results.result.kind === "timelines" &&
            (results.result.items.length === 0 ? (
              <p className="text-sm text-muted">No employment timelines matched.</p>
            ) : (
              <ul className="space-y-3">
                {results.result.items.map((item) => (
                  <li key={item.personId} className="rounded-md border border-[var(--border)] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        {item.leadId ? (
                          <Link href={`/leads/${item.leadId}`} className="font-medium text-accent hover:underline">
                            {item.personName}
                          </Link>
                        ) : (
                          <span className="font-medium">{item.personName}</span>
                        )}
                      </div>
                      <Badge variant="secondary">{item.timelineStatus}</Badge>
                    </div>
                    {item.timelineStatus !== "available" ? (
                      <p className="mt-2 text-muted">
                        Timeline unavailable ({item.timelineStatus.replaceAll("_", " ")}).
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-muted">
                        {item.employments.map((employment, index) => (
                          <li key={`${item.personId}-${index}`}>
                            {employment.companyName}
                            {employment.title ? ` · ${employment.title}` : ""}
                            {employment.isCurrent ? " · current" : ""}
                            {employment.startDate || employment.endDate
                              ? ` · ${employment.startDate ?? "?"} → ${employment.endDate ?? "present"}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ))}

          {results.result.kind === "connections" &&
            (results.result.items.length === 0 ? (
              <p className="text-sm text-muted">No overlapping employments matched.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
                {results.result.items.map((item, index) => (
                  <li key={`${item.personA.id}-${item.personB.id}-${index}`} className="px-3 py-2 text-sm">
                    <span className="font-medium">{item.personA.name}</span>
                    <span className="text-muted"> overlapped with </span>
                    <span className="font-medium">{item.personB.name}</span>
                    <span className="text-muted">
                      {" "}
                      at {item.company.name} for {item.overlapDays} days
                    </span>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </div>
  );
}
