"use client";

import type { RunProgress, RunStatus } from "@/shared/contracts";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const STAGES: RunStatus[] = [
  "queued",
  "discovering",
  "extracting",
  "resolving",
  "enriching",
  "scoring",
  "completed",
];

const STAGE_LABELS: Record<RunStatus, string> = {
  queued: "Queued",
  discovering: "Discovering pages",
  extracting: "Extracting data",
  resolving: "Resolving entities",
  enriching: "Enriching profiles",
  scoring: "Scoring leads",
  completed: "Completed",
  failed: "Failed",
};

function stageIndex(status: RunStatus): number {
  if (status === "failed") return -1;
  const idx = STAGES.indexOf(status);
  return idx >= 0 ? idx : 0;
}

function progressPercent(status: RunStatus): number {
  if (status === "completed") return 100;
  if (status === "failed") return 0;
  const idx = stageIndex(status);
  return Math.round((idx / (STAGES.length - 1)) * 100);
}

type RunProgressProps = {
  status: RunStatus;
  progress?: RunProgress;
  error?: { code: string; message: string; recoverable: boolean };
  elapsedMs?: number;
};

export function RunProgressPanel({ status, progress, error, elapsedMs }: RunProgressProps) {
  const currentIdx = stageIndex(status);
  const percent = progressPercent(status);

  return (
    <div className="space-y-4 rounded-md border border-[var(--border)] bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === "failed" ? (
            <XCircle className="h-5 w-5 text-red-400" />
          ) : status === "completed" ? (
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          )}
          <span className="text-sm font-medium">{STAGE_LABELS[status]}</span>
        </div>
        <Badge variant={status === "failed" ? "destructive" : status === "completed" ? "success" : "default"}>
          {status}
        </Badge>
      </div>

      <Progress value={percent} />

      {elapsedMs != null && (
        <p className="text-xs text-muted">Elapsed: {Math.round(elapsedMs / 1000)}s</p>
      )}

      {progress && (
        <div className="grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-4">
          {progress.pagesDiscovered != null && (
            <span>Pages discovered: {progress.pagesDiscovered}</span>
          )}
          {progress.pagesExtracted != null && (
            <span>Pages extracted: {progress.pagesExtracted}</span>
          )}
          {progress.peopleResolved != null && (
            <span>People resolved: {progress.peopleResolved}</span>
          )}
          {progress.leadsScored != null && <span>Leads scored: {progress.leadsScored}</span>}
        </div>
      )}

      <ol className="flex flex-wrap gap-2">
        {STAGES.filter((s) => s !== "completed").map((stage, idx) => {
          const done = currentIdx > idx || status === "completed";
          const active = progress?.stage === stage || status === stage;
          return (
            <li
              key={stage}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                done
                  ? "bg-green-500/10 text-green-400"
                  : active
                    ? "bg-accent/10 text-accent-light"
                    : "bg-surface-raised text-muted"
              }`}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              {STAGE_LABELS[stage]}
            </li>
          );
        })}
      </ol>

      {error && (
        <div
          className={`rounded-md border p-3 text-sm ${
            error.recoverable
              ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
              : "border-red-500/50 bg-red-500/10 text-red-200"
          }`}
        >
          <p className="font-medium">{error.code}</p>
          <p className="mt-1">{error.message}</p>
        </div>
      )}
    </div>
  );
}
