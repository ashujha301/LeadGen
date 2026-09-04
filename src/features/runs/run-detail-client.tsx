"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LeadSummary, RunResponse } from "@/shared/contracts";
import { ArrowLeft } from "lucide-react";
import { apiClient, ApiClientError } from "@/shared/utils/api-client";
import { formatDomain } from "@/shared/utils/formatters";
import { Button } from "@/components/ui/button";
import { LeadTable } from "@/features/leads/lead-table";
import { NaturalSearch } from "@/features/search/natural-search";
import { RunProgressPanel } from "@/features/runs/run-progress";
import { ExportButton } from "@/features/leads/export-button";
import { ErrorState } from "@/features/shell/error-state";
import { EmptyState } from "@/features/shell/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"]);
const POLL_MS = 3000;
const SSE_RECONNECT_MS = 5_000;

type LeadScope = "matched" | "all";

type RunDetailClientProps = {
  runId: string;
};

function upsertLead(leads: LeadSummary[], incoming: LeadSummary): LeadSummary[] {
  const index = leads.findIndex((lead) => lead.id === incoming.id);
  if (index === -1) {
    return [...leads, incoming];
  }
  const next = [...leads];
  next[index] = incoming;
  return next;
}

export function RunDetailClient({ runId }: RunDetailClientProps) {
  const [run, setRun] = useState<RunResponse | null>(null);
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [leadScope, setLeadScope] = useState<LeadScope>("matched");
  const [loadingRun, setLoadingRun] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseFailuresRef = useRef(0);
  const seenEventSequencesRef = useRef<Set<string>>(new Set());
  const terminalReconciledRef = useRef(false);
  const [canceling, setCanceling] = useState(false);

  const handleCancel = useCallback(async () => {
    setCanceling(true);
    try {
      const updated = await apiClient.cancelRun(runId);
      setRun(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to cancel run");
    } finally {
      setCanceling(false);
    }
  }, [runId]);

  const fetchRun = useCallback(async () => {
    try {
      const data = await apiClient.getRun(runId);
      setRun(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load run");
      return null;
    } finally {
      setLoadingRun(false);
    }
  }, [runId]);

  const fetchLeads = useCallback(
    async (scope: LeadScope, cursor?: string, options?: { silent?: boolean }) => {
      if (cursor) setLoadingMore(true);
      else if (!options?.silent) setLoadingLeads(true);

      try {
        const { leads: page, nextCursor: cursorNext } = await apiClient.getRunLeads(
          runId,
          scope,
          cursor,
        );
        setLeads((prev) => (cursor ? [...prev, ...page] : page));
        setNextCursor(cursorNext);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load leads");
      } finally {
        setLoadingLeads(false);
        setLoadingMore(false);
      }
    },
    [runId],
  );

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  useEffect(() => {
    setLeads([]);
    setNextCursor(null);
    fetchLeads(leadScope);
  }, [runId, leadScope, fetchLeads]);

  useEffect(() => {
    if (!run || TERMINAL_STATUSES.has(run.status)) {
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      eventSourceRef.current?.close();
      const source = new EventSource(`/api/v1/runs/${runId}/events`);
      eventSourceRef.current = source;

      source.onopen = () => {
        sseFailuresRef.current = 0;
      };

      const handleLeadEvent = (event: MessageEvent<string>) => {
        if (event.lastEventId) {
          if (seenEventSequencesRef.current.has(event.lastEventId)) {
            return;
          }
          seenEventSequencesRef.current.add(event.lastEventId);
        }

        try {
          const payload = JSON.parse(event.data) as LeadSummary;
          setLeads((prev) => upsertLead(prev, payload));
        } catch {
          // Ignore malformed SSE payloads.
        }
      };

      source.addEventListener("lead.created", handleLeadEvent);
      source.addEventListener("lead.updated", handleLeadEvent);

      source.onerror = () => {
        source.close();
        sseFailuresRef.current += 1;
        if (sseFailuresRef.current < 3) {
          reconnectTimer = setTimeout(connect, SSE_RECONNECT_MS);
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [runId, run?.status]);

  useEffect(() => {
    if (!run || TERMINAL_STATUSES.has(run.status)) {
      return;
    }

    const interval = setInterval(async () => {
      const updated = await fetchRun();
      if (updated && TERMINAL_STATUSES.has(updated.status) && !terminalReconciledRef.current) {
        terminalReconciledRef.current = true;
        clearInterval(interval);
        await fetchLeads(leadScope, undefined, { silent: true });
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [run?.status, fetchRun, run, leadScope, fetchLeads]);

  function handleScopeChange(scope: LeadScope) {
    setLeadScope(scope);
  }

  if (loadingRun && !run) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error && !run) {
    return (
      <div className="mx-auto max-w-5xl">
        <ErrorState title="Run not found" message={error} onRetry={fetchRun} />
      </div>
    );
  }

  if (!run) return null;

  const elapsedMs = Date.now() - startedAt.current;
  const isComplete = run.status === "completed";
  const isActive = !TERMINAL_STATUSES.has(run.status);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">{formatDomain(run.normalizedDomain)}</h1>
          <p className="text-sm text-muted">Run {run.id.slice(0, 8)}…</p>
        </div>
        {isActive && (
          <Button variant="outline" size="sm" disabled={canceling} onClick={handleCancel}>
            {canceling ? "Canceling…" : "Cancel search"}
          </Button>
        )}
        {isComplete && <ExportButton runId={runId} disabled={leads.length === 0} />}
      </header>

      <RunProgressPanel
        status={run.status}
        progress={run.progress}
        error={run.error}
        elapsedMs={elapsedMs}
      />

      {(isComplete || isActive) && (
        <>
          {isComplete && <NaturalSearch runId={runId} />}

          <section className="space-y-3">
            <Tabs
              defaultValue="matched"
              value={leadScope}
              onValueChange={(scope) => handleScopeChange(scope as LeadScope)}
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium">
                  {isActive ? "Live discovered people" : "Discovered people"}
                </h2>
                <TabsList>
                  <TabsTrigger value="matched">Target matches</TabsTrigger>
                  <TabsTrigger value="all">All discovered people</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value={leadScope}>
                {loadingLeads ? (
                  <Skeleton className="h-48 w-full" />
                ) : leads.length === 0 ? (
                  <EmptyState
                    title={
                      isActive
                        ? "Waiting for people"
                        : leadScope === "matched"
                          ? "No target matches"
                          : "No people discovered"
                    }
                    description={
                      isActive
                        ? "Leads appear here as the pipeline resolves and scores candidates."
                        : leadScope === "matched"
                          ? "The run completed but no people matched your role criteria."
                          : "The run completed without discovering people on the website."
                    }
                  />
                ) : (
                  <>
                    <LeadTable leads={leads} />
                    {nextCursor && (
                      <div className="flex justify-center pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={loadingMore}
                          onClick={() => fetchLeads(leadScope, nextCursor)}
                        >
                          {loadingMore ? "Loading…" : "Load more"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </section>
        </>
      )}

      {run.status === "canceled" && (
        <EmptyState
          title="Run canceled"
          description="This search was stopped before completion."
        />
      )}

      {run.status === "failed" && (
        <EmptyState
          title="Run failed"
          description={run.error?.message ?? "An unrecoverable error occurred during processing."}
        />
      )}
    </div>
  );
}
