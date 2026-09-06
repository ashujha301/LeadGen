"use client";

import { useMemo, useState } from "react";
import type {
  ClarificationQuestion,
  NaturalSearchV2Response,
} from "@/shared/contracts/natural-search-v2";
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

function InterpretationChips({ response }: { response: NaturalSearchV2Response }) {
  const filters =
    response.status === "completed" || response.status === "no_results"
      ? response.interpretation.appliedFilters
      : response.interpretation?.appliedFilters ?? [];

  const chips = filters.map((filter) => {
    const op = filter.operator ? ` ${filter.operator}` : "";
    return `${filter.field}${op}: ${filter.label}`;
  });

  if (response.status === "completed" && response.interpretation.semanticPhrase) {
    chips.push(`semantic:${response.interpretation.semanticPhrase}`);
  }
  if (response.status === "completed" && response.interpretation.widened) {
    chips.push("widened");
  }

  if (chips.length === 0) return null;

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

function ClarificationForm({
  questions,
  disabled,
  onSubmit,
}: {
  questions: ClarificationQuestion[];
  disabled: boolean;
  onSubmit: (answers: Array<{ questionId: string; optionIds?: string[]; customAnswer?: string }>) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});

  const ready = useMemo(() => {
    return questions.every((question) => {
      const hasOption = (selected[question.id] ?? []).length > 0;
      const hasCustom = Boolean(custom[question.id]?.trim()) && question.allowCustomAnswer;
      return hasOption || hasCustom;
    });
  }, [questions, selected, custom]);

  return (
    <form
      className="space-y-3 rounded-md border border-[var(--border)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit(
          questions.map((question) => {
            const customAnswer = custom[question.id]?.trim();
            if (customAnswer && question.allowCustomAnswer) {
              return { questionId: question.id, customAnswer };
            }
            return { questionId: question.id, optionIds: selected[question.id] ?? [] };
          }),
        );
      }}
    >
      <p className="text-sm font-medium">A few clarifications will improve this search</p>
      {questions.map((question) => (
        <fieldset key={question.id} className="space-y-2">
          <legend className="text-sm">{question.prompt}</legend>
          <div className="space-y-1">
            {question.options.map((option) => {
              const checked = (selected[question.id] ?? []).includes(option.id);
              return (
                <label key={option.id} className="flex items-start gap-2 text-sm">
                  <input
                    type={question.selection === "multi_select" ? "checkbox" : "radio"}
                    name={question.id}
                    checked={checked}
                    onChange={() => {
                      setSelected((prev) => {
                        if (question.selection === "multi_select") {
                          const current = new Set(prev[question.id] ?? []);
                          if (current.has(option.id)) current.delete(option.id);
                          else current.add(option.id);
                          return { ...prev, [question.id]: [...current] };
                        }
                        return { ...prev, [question.id]: [option.id] };
                      });
                      setCustom((prev) => ({ ...prev, [question.id]: "" }));
                    }}
                  />
                  <span>
                    <span className="font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="block text-xs text-muted">{option.description}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
          {question.allowCustomAnswer ? (
            <Input
              placeholder="Or type a custom answer"
              value={custom[question.id] ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setCustom((prev) => ({ ...prev, [question.id]: value }));
                if (value.trim()) {
                  setSelected((prev) => ({ ...prev, [question.id]: [] }));
                }
              }}
            />
          ) : null}
        </fieldset>
      ))}
      <Button type="submit" disabled={disabled || !ready} variant="outline">
        Continue search
      </Button>
    </form>
  );
}

export function NaturalSearch({ runId, compact }: NaturalSearchProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [results, setResults] = useState<NaturalSearchV2Response | null>(null);

  async function runSearch(nextQuery: string) {
    setLoading(true);
    setError(null);
    setErrorRequestId(null);
    try {
      const response = await apiClient.naturalSearch(nextQuery, runId);
      setResults(response);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Search failed");
      setErrorRequestId(err instanceof ApiClientError ? err.requestId : null);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    await runSearch(query.trim());
  }

  async function handleClarify(
    answers: Array<{ questionId: string; optionIds?: string[]; customAnswer?: string }>,
  ) {
    if (!results || results.status !== "needs_clarification") return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.resolveNaturalSearch(results.sessionId, {
        version: results.version,
        answers,
      });
      setResults(response);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Clarification failed");
      setErrorRequestId(err instanceof ApiClientError ? err.requestId : null);
      if (err instanceof ApiClientError && err.code === "SESSION_EXPIRED") {
        setResults(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleWiden(optionId: string) {
    if (!results || results.status !== "no_results" || !results.sessionId || !results.version) {
      setError("Widening session is unavailable. Please re-run the search.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.resolveNaturalSearch(results.sessionId, {
        version: results.version,
        answers: [],
        wideningOptionId: optionId,
      });
      setResults(response);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Widening failed");
      setErrorRequestId(err instanceof ApiClientError ? err.requestId : null);
    } finally {
      setLoading(false);
    }
  }

  const itemCount =
    results?.status === "completed"
      ? results.result.kind === "leads"
        ? results.result.items.length
        : results.result.kind === "timelines"
          ? results.result.items.length
          : results.result.items.length
      : 0;

  return (
    <div
      className={`space-y-3 ${compact ? "" : "rounded-md border border-[var(--border)] bg-surface p-4"}`}
    >
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
          <p>{error}</p>
          {errorRequestId ? (
            <p className="mt-1 text-xs opacity-80">Request ID: {errorRequestId}</p>
          ) : null}
        </Alert>
      )}

      {results?.status === "needs_clarification" && (
        <div className="space-y-2">
          <InterpretationChips response={results} />
          <p className="text-xs text-muted">
            Session expires {new Date(results.expiresAt).toLocaleTimeString()}
          </p>
          <ClarificationForm questions={results.questions} disabled={loading} onSubmit={handleClarify} />
        </div>
      )}

      {results?.status === "no_results" && (
        <div className="space-y-2">
          <InterpretationChips response={results} />
          <p className="text-sm text-muted">No results matched. Choose a widening option to continue:</p>
          <ul className="space-y-2">
            {results.wideningOptions.map((option) => (
              <li key={option.id}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || option.executed}
                  onClick={() => void handleWiden(option.id)}
                >
                  {option.label}
                  {option.estimatedCount !== undefined ? ` (~${option.estimatedCount})` : ""}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {results?.status === "completed" && (
        <div className="space-y-2">
          <InterpretationChips response={results} />
          <p className="text-xs text-muted">
            {itemCount} result{itemCount === 1 ? "" : "s"} · {results.interpretation.summary}
          </p>
          {results.interpretation.warnings.length > 0 ? (
            <p className="text-xs text-muted">Warnings: {results.interpretation.warnings.join(", ")}</p>
          ) : null}

          {results.result.kind === "leads" &&
            (results.result.items.length === 0 ? (
              <p className="text-sm text-muted">No leads matched your query.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
                {results.result.items.map((result) => (
                  <li
                    key={result.leadId}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <div>
                      <Link
                        href={`/leads/${result.leadId}`}
                        className="font-medium text-accent hover:underline"
                      >
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
                  <li
                    key={item.personId}
                    className="rounded-md border border-[var(--border)] p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        {item.leadId ? (
                          <Link
                            href={`/leads/${item.leadId}`}
                            className="font-medium text-accent hover:underline"
                          >
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
                  <li
                    key={`${item.personA.id}-${item.personB.id}-${index}`}
                    className="px-3 py-2 text-sm"
                  >
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
