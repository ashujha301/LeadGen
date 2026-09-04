import { Briefcase } from "lucide-react";
import Link from "next/link";
import { formatPercent } from "@/shared/utils/formatters";
import { Badge } from "@/components/ui/badge";

type Employment = {
  companyId: string | null;
  companyName: string;
  title: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  confidence: number;
  employerDomain?: string | null;
};

type EmploymentTimelineProps = {
  employments: Employment[];
};

function formatDateRange(start: string | null, end: string | null, isCurrent: boolean): string {
  const startLabel = start ? new Date(start).toLocaleDateString(undefined, { year: "numeric", month: "short" }) : "?";
  const endLabel = isCurrent ? "Present" : end ? new Date(end).toLocaleDateString(undefined, { year: "numeric", month: "short" }) : "?";
  return `${startLabel} – ${endLabel}`;
}

export function EmploymentTimeline({ employments }: EmploymentTimelineProps) {
  const sorted = [...employments].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
    const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
    return bDate - aDate;
  });

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-muted">
        No employment history recorded.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Briefcase className="h-4 w-4 text-accent" />
        Employment timeline
      </h3>
      <ol className="relative ml-3 border-l border-[var(--border)] pl-6">
        {sorted.map((employment) => (
          <li key={`${employment.companyId ?? employment.companyName}-${employment.startDate}`} className="mb-4 last:mb-0">
            <span
              className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background ${
                employment.isCurrent ? "bg-accent" : "bg-muted"
              }`}
            />
            <div className="flex flex-wrap items-center gap-2">
              {employment.companyId ? (
                <Link
                  href={`/companies/${employment.companyId}`}
                  className="font-medium text-accent hover:underline"
                >
                  {employment.companyName}
                </Link>
              ) : (
                <span className="font-medium">{employment.companyName}</span>
              )}
              {employment.isCurrent && <Badge variant="success">Current</Badge>}
              <Badge variant="secondary">{formatPercent(employment.confidence)}</Badge>
            </div>
            {employment.title && <p className="text-sm text-muted">{employment.title}</p>}
            <p className="text-xs text-muted">
              {formatDateRange(employment.startDate, employment.endDate, employment.isCurrent)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
