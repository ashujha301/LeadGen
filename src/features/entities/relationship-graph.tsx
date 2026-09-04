"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { GraphResponse } from "@/shared/contracts";
import { Network } from "lucide-react";

const NODE_COLORS: Record<string, string> = {
  Person: "#14b8a6",
  Company: "#3b82f6",
  BusinessSignal: "#f59e0b",
};

const EDGE_COLORS: Record<string, string> = {
  CURRENTLY_WORKS_AT: "#14b8a6",
  WORKED_AT: "#64748b",
  SHARED_EMPLOYMENT: "#8b5cf6",
  HAS_SIGNAL: "#f59e0b",
};

type RelationshipGraphProps = {
  graph: GraphResponse;
  height?: number;
};

export function RelationshipGraph({ graph, height = 400 }: RelationshipGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || graph.nodes.length === 0) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...graph.nodes, ...graph.edges],
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
            width: 36,
            height: 36,
          },
        },
        ...Object.entries(NODE_COLORS).map(([type, color]) => ({
          selector: `node[type = "${type}"]`,
          style: { "background-color": color },
        })),
        {
          selector: "edge",
          style: {
            label: "data(label)",
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "line-color": "#64748b",
            "target-arrow-color": "#64748b",
            color: "#9ca3af",
            "font-size": "8px",
            width: 2,
          },
        },
        ...Object.entries(EDGE_COLORS).map(([type, color]) => ({
          selector: `edge[type = "${type}"]`,
          style: { "line-color": color, "target-arrow-color": color },
        })),
      ],
      layout: {
        name: "cose",
        animate: false,
        padding: 30,
        nodeRepulsion: 8000,
        idealEdgeLength: 80,
      },
      minZoom: 0.3,
      maxZoom: 3,
    });

    return () => {
      cy.destroy();
    };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[var(--border)] p-8 text-center text-sm text-muted">
        <Network className="mb-2 h-8 w-8" />
        No relationship data to visualize.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Network className="h-4 w-4 text-accent" />
        Relationship graph
      </h3>
      <div
        ref={containerRef}
        className="w-full rounded-md border border-[var(--border)] bg-background"
        style={{ height }}
      />
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(NODE_COLORS).map(([type, color]) => (
          <span key={type} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}
