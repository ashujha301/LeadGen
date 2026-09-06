"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import cytoscape from "cytoscape";
import { Link2, Loader2, Network, Table2 } from "lucide-react";

import type { PotentialConnectionItem, PotentialConnectionsResponse } from "@/shared/contracts";
import { apiClient, ApiClientError } from "@/shared/utils/api-client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/features/shell/empty-state";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const POLL_MS = 5000;
const DISCLAIMER =
  "Potential connection based on shared employment. Direct interaction is not verified.";

function strengthVariant(band: string): "default" | "success" | "warning" | "destructive" {
  if (band === "strong") return "success";
  if (band === "moderate") return "warning";
  return "default";
}

export function PotentialConnectionsClient() {
  const [data, setData] = useState<PotentialConnectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentCompanyId, setCurrentCompanyId] = useState("");
  const [sharedEmployer, setSharedEmployer] = useState("");
  const [strengthBand, setStrengthBand] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const revisionRef = useRef<string | null>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef({ currentCompanyId, sharedEmployer, strengthBand });
  filtersRef.current = { currentCompanyId, sharedEmployer, strengthBand };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    const filters = filtersRef.current;
    try {
      const next = await apiClient.listPotentialConnections({
        currentCompanyId: filters.currentCompanyId || undefined,
        sharedEmployer: filters.sharedEmployer || undefined,
        strengthBand: (filters.strengthBand as "strong" | "moderate" | "weak") || undefined,
      });
      setData((prev) => {
        if (prev && next.revision === prev.revision) {
          return { ...next, items: reconcileItems(prev.items, next.items) };
        }
        return next;
      });
      revisionRef.current = next.revision;
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load connections");
    } finally {
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [currentCompanyId, sharedEmployer, strengthBand, load]);

  useEffect(() => {
    if (!data?.hasActiveRuns) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      await load({ silent: true });
      if (cancelled) return;
      timer = setTimeout(() => {
        void tick();
      }, POLL_MS);
    };

    timer = setTimeout(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [data?.hasActiveRuns, load]);

  useEffect(() => {
    if (!graphRef.current || !data) return;
    const items = data.items;
    const nodes = new Map<string, { id: string; label: string; type: string }>();
    const edges: Array<{
      data: { id: string; source: string; target: string; label: string; type: string };
    }> = [];

    for (const item of items) {
      for (const person of [item.personA, item.personB]) {
        nodes.set(person.personId, {
          id: person.personId,
          label: person.personName,
          type: "Person",
        });
        nodes.set(person.currentCompanyId, {
          id: person.currentCompanyId,
          label: person.currentCompanyName,
          type: "Company",
        });
        edges.push({
          data: {
            id: `current:${person.personId}:${person.currentCompanyId}`,
            source: person.personId,
            target: person.currentCompanyId,
            label: "current",
            type: "CURRENTLY_WORKS_AT",
          },
        });
      }
      const sharedId = item.sharedEmployer.companyId ?? `shared:${item.sharedEmployer.key}`;
      nodes.set(sharedId, {
        id: sharedId,
        label: item.sharedEmployer.name,
        type: "Company",
      });
      edges.push({
        data: {
          id: item.id,
          source: item.personA.personId,
          target: item.personB.personId,
          label: `${item.overlapDays}d`,
          type: "SHARED_EMPLOYMENT",
        },
      });
    }

    const cy = cytoscape({
      container: graphRef.current,
      elements: [
        ...[...nodes.values()].map((node) => ({ data: node })),
        ...edges,
      ],
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "background-color": "#64748b",
            color: "#ffffff",
            "font-size": "10px",
            "text-valign": "bottom",
            "text-margin-y": 4,
            width: 34,
            height: 34,
          },
        },
        {
          selector: 'node[type = "Person"]',
          style: { "background-color": "#14b8a6" },
        },
        {
          selector: 'node[type = "Company"]',
          style: { "background-color": "#3b82f6" },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "line-color": "#64748b",
            width: 2,
            label: "data(label)",
            "font-size": "8px",
            color: "#9ca3af",
          },
        },
        {
          selector: 'edge[type = "SHARED_EMPLOYMENT"]',
          style: {
            "line-style": "dashed",
            "line-color": "#8b5cf6",
            width: 3,
          },
        },
      ],
      layout: { name: "cose", animate: false, padding: 24 },
      minZoom: 0.3,
      maxZoom: 3,
    });

    cy.on("tap", "edge", (event) => {
      const id = event.target.id();
      if (items.some((item) => item.id === id)) {
        setSelectedEdgeId(id);
        setExpandedId(id);
      }
    });

    return () => {
      cy.destroy();
    };
  }, [data]);

  const selectedItem =
    data?.items.find((item) => item.id === (selectedEdgeId ?? expandedId)) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold">Potential Connections</h1>
        </div>
        <p className="text-sm text-muted">
          Automatically discovered overlaps between your High Value Leads at different companies.
        </p>
        <p className="text-xs text-muted">{DISCLAIMER}</p>
      </header>

      {data && (
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge variant="default">Total {data.summary.total}</Badge>
          <Badge variant="success">Strong {data.summary.strong}</Badge>
          <Badge variant="warning">Moderate {data.summary.moderate}</Badge>
          <Badge>Weak {data.summary.weak}</Badge>
          {data.hasActiveRuns && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              Refreshing while runs are active
            </span>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-muted">
          Current company
          <Select
            value={currentCompanyId}
            onChange={(event) => setCurrentCompanyId(event.target.value)}
          >
            <option value="">All</option>
            {(data?.facets.currentCompanies ?? []).map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.count})
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Shared employer
          <Select
            value={sharedEmployer}
            onChange={(event) => setSharedEmployer(event.target.value)}
          >
            <option value="">All</option>
            {(data?.facets.sharedEmployers ?? []).map((employer) => (
              <option key={employer.key} value={employer.key}>
                {employer.name} ({employer.count})
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Strength
          <Select value={strengthBand} onChange={(event) => setStrengthBand(event.target.value)}>
            <option value="">All</option>
            <option value="strong">Strong</option>
            <option value="moderate">Moderate</option>
            <option value="weak">Weak</option>
          </Select>
        </label>
      </div>

      {error && (
        <Alert variant="destructive" title="Could not load connections">
          {error}
        </Alert>
      )}

      {loading && !data && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading potential connections…
        </div>
      )}

      {!loading && data && data.items.length === 0 && (
        <EmptyState
          title="No potential connections yet"
          description="Complete runs that produce High Value Leads with employment timelines to discover shared history."
        />
      )}

      {data && data.items.length > 0 && (
        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">
              <Table2 className="mr-1 h-3.5 w-3.5" />
              Table
            </TabsTrigger>
            <TabsTrigger value="graph">
              <Network className="mr-1 h-3.5 w-3.5" />
              Graph
            </TabsTrigger>
          </TabsList>
          <TabsContent value="table" className="mt-4">
            <div className="overflow-hidden rounded-md border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)] bg-surface-raised text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Person A</th>
                    <th className="px-3 py-2">Person B</th>
                    <th className="px-3 py-2">Shared employer</th>
                    <th className="px-3 py-2">Overlap</th>
                    <th className="px-3 py-2">Strength</th>
                    <th className="px-3 py-2">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <ConnectionRow
                      key={item.id}
                      item={item}
                      expanded={expandedId === item.id}
                      onToggle={() =>
                        setExpandedId((current) => (current === item.id ? null : item.id))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="graph" className="mt-4 space-y-3">
            <div
              ref={graphRef}
              className="h-[420px] w-full rounded-md border border-[var(--border)] bg-surface"
              data-testid="potential-connections-graph"
            />
            {selectedItem && (
              <EvidencePanel item={selectedItem} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function reconcileItems(
  previous: PotentialConnectionItem[],
  next: PotentialConnectionItem[],
): PotentialConnectionItem[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  return next.map((item) => {
    const existing = byId.get(item.id);
    return existing ? { ...existing, ...item } : item;
  });
}

function ConnectionRow({
  item,
  expanded,
  onToggle,
}: {
  item: PotentialConnectionItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-[var(--border)] hover:bg-surface-raised/40"
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <PersonCell person={item.personA} />
        </td>
        <td className="px-3 py-2">
          <PersonCell person={item.personB} />
        </td>
        <td className="px-3 py-2">{item.sharedEmployer.name}</td>
        <td className="px-3 py-2">{item.overlapDays}d</td>
        <td className="px-3 py-2">
          <Badge variant={strengthVariant(item.strengthBand)}>
            {item.strengthScore} · {item.strengthBand}
          </Badge>
        </td>
        <td className="px-3 py-2 capitalize">{item.evidenceQuality}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-[var(--border)] bg-surface-raised/20">
          <td colSpan={6} className="px-3 py-3">
            <EvidencePanel item={item} />
          </td>
        </tr>
      )}
    </>
  );
}

function PersonCell({
  person,
}: {
  person: PotentialConnectionItem["personA"];
}) {
  return (
    <div className="space-y-0.5">
      <Link
        href={`/high-value-leads/${person.currentCompanyId}/leads/${person.leadId}`}
        className="font-medium text-accent hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {person.personName}
      </Link>
      <div className="text-xs text-muted">
        {person.title ?? "—"} · {person.currentCompanyName}
      </div>
    </div>
  );
}

function EvidencePanel({ item }: { item: PotentialConnectionItem }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Why this connection?</p>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        {item.reasonCodes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Evidence score {item.evidenceScore} ({item.evidenceQuality}). {DISCLAIMER}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {item.roleSegments.map((segment, index) => (
          <div key={`${segment.personId}-${index}`} className="text-xs text-muted">
            {segment.title ?? "Role"} · {segment.startDate ?? "?"} →{" "}
            {segment.isCurrent ? "present" : (segment.endDate ?? "?")}
          </div>
        ))}
      </div>
    </div>
  );
}
