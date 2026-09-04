import type { Evidence } from "@/shared/contracts";
import { ExternalLink, FileText } from "lucide-react";
import { formatPercent, formatRelativeTime } from "@/shared/utils/formatters";
import { Badge } from "@/components/ui/badge";

type EvidencePanelProps = {
  evidence: Evidence[];
  title?: string;
};

export function EvidencePanel({ evidence, title = "Evidence" }: EvidencePanelProps) {
  if (evidence.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-muted">
        No evidence excerpts available.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-accent" />
        {title}
      </h3>
      <ul className="space-y-3">
        {evidence.map((item) => (
          <li
            key={item.id}
            className="rounded-md border border-[var(--border)] bg-surface p-3 text-sm"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                {new URL(item.sourceUrl).hostname}
                <ExternalLink className="h-3 w-3" />
              </a>
              <Badge variant="secondary">{formatPercent(item.confidence)} conf.</Badge>
              <Badge variant="secondary">{formatPercent(item.freshness)} fresh</Badge>
              <span className="text-xs text-muted">{formatRelativeTime(item.observedAt)}</span>
            </div>
            <p className="text-muted leading-relaxed">{item.excerpt}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
