import type { GraphEdge, GraphNode, GraphResponse } from "@/shared/contracts";
import type { BusinessSignal, Company, Employment, Person } from "@/server/infrastructure/db";

export type LeadGraphInput = {
  leadId: string;
  person: Pick<Person, "id" | "name" | "confidence">;
  company: Pick<Company, "id" | "name" | "confidence">;
  currentEmployment?: Pick<
    Employment,
    "normalizedTitle" | "normalizedRole" | "startDate" | "endDate" | "isCurrent" | "confidence"
  >;
  employmentHistory: Array<
    Pick<
      Employment,
      | "id"
      | "normalizedTitle"
      | "normalizedRole"
      | "startDate"
      | "endDate"
      | "isCurrent"
      | "confidence"
    > & {
      companyId: string | null;
      companyName: string;
    }
  >;
  businessSignals: Array<
    Pick<BusinessSignal, "id" | "signalType" | "value" | "confidence" | "sourceDocumentId">
  >;
  relatedPeople?: Array<{
    person: Pick<Person, "id" | "name" | "confidence">;
    companyId: string;
    companyName: string;
    edgeType: "SHARED_EMPLOYMENT" | "WORKED_AT";
    role?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    confidence?: number;
  }>;
  evidenceIds?: Record<string, string[]>;
};

const MAX_NODES = 40;
const MAX_EDGES = 80;

function personNode(
  person: Pick<Person, "id" | "name" | "confidence">,
  evidenceIds?: string[],
): GraphNode {
  return {
    data: {
      id: person.id,
      label: person.name,
      type: "Person",
      confidence: Number(person.confidence),
      evidenceIds,
    },
  };
}

function companyNode(
  company: Pick<Company, "id" | "name" | "confidence">,
  evidenceIds?: string[],
): GraphNode {
  return {
    data: {
      id: company.id,
      label: company.name,
      type: "Company",
      confidence: Number(company.confidence),
      evidenceIds,
    },
  };
}

function signalNode(
  signal: Pick<BusinessSignal, "id" | "signalType" | "value" | "confidence" | "sourceDocumentId">,
): GraphNode {
  return {
    data: {
      id: signal.id,
      label: `${signal.signalType}: ${signal.value}`,
      type: "BusinessSignal",
      confidence: Number(signal.confidence),
      evidenceIds: signal.sourceDocumentId ? [signal.sourceDocumentId] : undefined,
    },
  };
}

export function buildLeadGraph(input: LeadGraphInput): GraphResponse {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  nodes.set(input.person.id, personNode(input.person, input.evidenceIds?.[input.person.id]));
  nodes.set(input.company.id, companyNode(input.company, input.evidenceIds?.[input.company.id]));

  const current = input.currentEmployment;
  if (current) {
    const edgeId = `edge-current-${input.person.id}-${input.company.id}`;
    edges.set(edgeId, {
      data: {
        id: edgeId,
        source: input.person.id,
        target: input.company.id,
        type: "CURRENTLY_WORKS_AT",
        label: current.normalizedTitle ?? current.normalizedRole ?? undefined,
        role: current.normalizedTitle ?? current.normalizedRole ?? undefined,
        startDate: current.startDate,
        endDate: current.endDate,
        confidence: Number(current.confidence),
      },
    });
  }

  for (const employment of input.employmentHistory) {
    const companyNodeId = employment.companyId ?? `unresolved:${employment.id}`;
    if (employment.companyId === input.company.id && employment.isCurrent) {
      continue;
    }

    if (!nodes.has(companyNodeId)) {
      nodes.set(companyNodeId, {
        data: {
          id: companyNodeId,
          label: employment.companyName,
          type: "Company",
          confidence: Number(employment.confidence),
        },
      });
    }

    const edgeId = `edge-worked-${input.person.id}-${companyNodeId}-${employment.id}`;
    edges.set(edgeId, {
      data: {
        id: edgeId,
        source: input.person.id,
        target: companyNodeId,
        type: employment.isCurrent ? "CURRENTLY_WORKS_AT" : "WORKED_AT",
        label: employment.normalizedTitle ?? employment.normalizedRole ?? undefined,
        role: employment.normalizedTitle ?? employment.normalizedRole ?? undefined,
        startDate: employment.startDate,
        endDate: employment.endDate,
        confidence: Number(employment.confidence),
      },
    });
  }

  for (const signal of input.businessSignals) {
    if (nodes.size >= MAX_NODES) {
      break;
    }

    nodes.set(signal.id, signalNode(signal));

    const edgeId = `edge-signal-${input.company.id}-${signal.id}`;
    edges.set(edgeId, {
      data: {
        id: edgeId,
        source: input.company.id,
        target: signal.id,
        type: "HAS_SIGNAL",
        label: signal.signalType,
        confidence: Number(signal.confidence),
        evidenceIds: signal.sourceDocumentId ? [signal.sourceDocumentId] : undefined,
      },
    });
  }

  for (const related of input.relatedPeople ?? []) {
    if (nodes.size >= MAX_NODES || edges.size >= MAX_EDGES) {
      break;
    }

    if (!nodes.has(related.person.id)) {
      nodes.set(related.person.id, personNode(related.person));
    }

    if (!nodes.has(related.companyId)) {
      nodes.set(related.companyId, {
        data: {
          id: related.companyId,
          label: related.companyName,
          type: "Company",
        },
      });
    }

    const edgeId = `edge-shared-${related.person.id}-${related.companyId}`;
    if (!edges.has(edgeId)) {
      edges.set(edgeId, {
        data: {
          id: edgeId,
          source: related.person.id,
          target: related.companyId,
          type: related.edgeType,
          label: related.role ?? undefined,
          role: related.role ?? undefined,
          startDate: related.startDate ?? null,
          endDate: related.endDate ?? null,
          confidence: related.confidence,
        },
      });
    }
  }

  return {
    nodes: [...nodes.values()].slice(0, MAX_NODES),
    edges: [...edges.values()].slice(0, MAX_EDGES),
  };
}

export function emptyGraph(): GraphResponse {
  return { nodes: [], edges: [] };
}
