import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User } from "lucide-react";
import { entityService } from "@/server/application/services/entity-service";
import { requireSession } from "@/features/auth/session-guard";
import { formatPercent, formatRelativeTime } from "@/shared/utils/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmploymentTimeline } from "@/features/entities/employment-timeline";
import { EvidencePanel } from "@/features/leads/evidence-panel";

export const dynamic = "force-dynamic";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const user = await requireSession();
  const { personId } = await params;
  const person = await entityService.getPerson(personId, user.id);

  if (!person) {
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
          <User className="mt-1 h-6 w-6 text-accent" />
          <div>
            <h1 className="text-xl font-semibold">{person.name}</h1>
            {person.profileUrl && (
              <a
                href={person.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline"
              >
                View profile
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Confidence {formatPercent(person.confidence)}</Badge>
          <Badge variant="secondary">Freshness {formatPercent(person.freshness)}</Badge>
        </div>
      </header>

      {person.contacts.length > 0 && (
        <section className="rounded-md border border-[var(--border)] bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Contacts</h2>
          <ul className="divide-y divide-[var(--border)]">
            {person.contacts.map((contact) => (
              <li
                key={`${contact.type}-${contact.value}`}
                className="flex justify-between py-2 text-sm"
              >
                <span>
                  <Badge variant="secondary" className="mr-2 capitalize">
                    {contact.type}
                  </Badge>
                  {contact.value}
                </span>
                <Badge
                  variant={
                    contact.verificationStatus === "verified"
                      ? "success"
                      : contact.verificationStatus === "invalid"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {contact.verificationStatus}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-md border border-[var(--border)] bg-surface p-4">
        <EmploymentTimeline employments={person.employments} personId={person.id} />
      </section>

      {person.evidence.length > 0 && (
        <section className="rounded-md border border-[var(--border)] bg-surface p-4">
          <EvidencePanel
            evidence={person.evidence.map((e) => ({
              ...e,
              confidence: person.confidence,
              freshness: person.freshness,
            }))}
          />
        </section>
      )}

      <p className="text-xs text-muted">Updated {formatRelativeTime(person.updatedAt)}</p>
    </div>
  );
}
