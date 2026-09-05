import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { entityService } from "@/server/application/services/entity-service";
import { requireSession } from "@/features/auth/session-guard";
import { formatPercent } from "@/shared/utils/formatters";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/features/shell/empty-state";
import { Alert } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const user = await requireSession();
  const matches = await entityService.getUnresolvedMatches(user.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold">Entity review</h1>
        </div>
        <p className="text-sm text-muted">
          Review ambiguous entity matches flagged during resolution. Merge and reject actions
          require authentication and are not available in this demo.
        </p>
      </header>

      <Alert title="Read-only mode">
        This queue is view-only. Matches scoring above the review threshold but below auto-merge are
        listed here for manual inspection in a production deployment.
      </Alert>

      {matches.length === 0 ? (
        <EmptyState
          title="No pending matches"
          description="Entity resolution did not flag any ambiguous person pairs for review."
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-surface-raised text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Candidate A</th>
                <th className="px-3 py-2 font-medium">Candidate B</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Reasons</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-surface">
              {matches.map((match) => (
                <tr key={match.id} className="hover:bg-surface-raised/50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/people/${match.candidateA.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {match.candidateA.label}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/people/${match.candidateB.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {match.candidateB.label}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="warning">{formatPercent(match.matchScore)}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {match.reasons.length > 0 ? match.reasons.join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
