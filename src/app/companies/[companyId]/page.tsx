import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { entityService } from "@/server/application/services/entity-service";
import { formatPercent, formatRelativeTime } from "@/shared/utils/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EvidencePanel } from "@/features/leads/evidence-panel";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const company = await entityService.getCompany(companyId);

  if (!company) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex items-start gap-3">
          <Building2 className="mt-1 h-6 w-6 text-accent" />
          <div>
            <h1 className="text-xl font-semibold">{company.name}</h1>
            <p className="text-sm text-muted">{company.normalizedDomain}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Confidence {formatPercent(company.confidence)}</Badge>
          <Badge variant="secondary">Freshness {formatPercent(company.freshness)}</Badge>
          {company.industry && <Badge>{company.industry}</Badge>}
          {company.location && <Badge variant="secondary">{company.location}</Badge>}
          {company.employeeCount != null && (
            <Badge variant="secondary">{company.employeeCount} employees</Badge>
          )}
        </div>
      </header>

      {company.aliases.length > 0 && (
        <section className="rounded-md border border-[var(--border)] bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium">Aliases</h2>
          <div className="flex flex-wrap gap-1.5">
            {company.aliases.map((alias) => (
              <span
                key={alias}
                className="rounded bg-surface-raised px-2 py-0.5 text-xs text-muted"
              >
                {alias}
              </span>
            ))}
          </div>
        </section>
      )}

      {company.businessSignals.length > 0 && (
        <section className="rounded-md border border-[var(--border)] bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Business signals</h2>
          <ul className="divide-y divide-[var(--border)]">
            {company.businessSignals.map((signal) => (
              <li
                key={`${signal.type}-${signal.value}`}
                className="flex justify-between py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{signal.type}</span>
                  <span className="ml-2 text-muted">{signal.value}</span>
                </span>
                <span className="text-xs text-muted">
                  {formatPercent(signal.confidence)} · {formatRelativeTime(signal.observedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-md border border-[var(--border)] bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium">People ({company.people.length})</h2>
        {company.people.length === 0 ? (
          <p className="text-sm text-muted">No people linked to this company.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {company.people.map((person) => (
              <li key={person.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <Link
                    href={`/people/${person.id}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {person.name}
                  </Link>
                  {person.title && <span className="ml-2 text-muted">{person.title}</span>}
                </div>
                {person.isCurrent && <Badge variant="success">Current</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-[var(--border)] bg-surface p-4">
        <EvidencePanel
          evidence={company.evidence.map((e) => ({
            ...e,
            confidence: company.confidence,
            freshness: company.freshness,
          }))}
          title="Source evidence"
        />
      </section>

      <p className="text-xs text-muted">Updated {formatRelativeTime(company.updatedAt)}</p>
    </div>
  );
}
