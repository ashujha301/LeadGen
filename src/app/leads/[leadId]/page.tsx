import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { leadService } from "@/server/application/services/lead-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeadScore } from "@/features/leads/lead-score";
import { ScoreBreakdown } from "@/features/leads/score-breakdown";
import { EvidencePanel } from "@/features/leads/evidence-panel";
import { ConflictAlert } from "@/features/leads/conflict-alert";
import { EmploymentTimeline } from "@/features/entities/employment-timeline";
import { RelationshipGraph } from "@/features/entities/relationship-graph";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const lead = await leadService.getLead(leadId);

  if (!lead) {
    notFound();
  }

  const graph = await leadService.getLeadGraph(leadId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/people/${lead.personId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            View person
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{lead.personName}</h1>
            <p className="text-sm text-muted">
              {lead.title ?? "Unknown title"} at{" "}
              <Link href={`/companies/${lead.companyId}`} className="text-accent hover:underline">
                {lead.companyName}
              </Link>
            </p>
          </div>
          <div className="flex gap-2">
            {lead.hasEmail && <Badge variant="success">Email</Badge>}
            {lead.hasPhone && <Badge variant="success">Phone</Badge>}
          </div>
        </div>
      </header>

      <div className="rounded-md border border-[var(--border)] bg-surface p-4">
        <LeadScore score={lead.score} confidence={lead.confidence} contactability={lead.contactability} />
        <p className="mt-4 text-sm leading-relaxed text-muted">{lead.explanation}</p>
      </div>

      <ConflictAlert conflicts={lead.conflicts} />

      <Tabs defaultValue="breakdown">
        <TabsList>
          <TabsTrigger value="breakdown">Score</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
        </TabsList>
        <TabsContent value="breakdown" className="rounded-md border border-[var(--border)] bg-surface p-4">
          <ScoreBreakdown components={lead.scoreComponents} />
          {lead.businessSignals.length > 0 && (
            <div className="mt-6 space-y-2">
              <h3 className="text-sm font-medium">Business signals</h3>
              <ul className="space-y-1 text-sm">
                {lead.businessSignals.map((signal) => (
                  <li key={`${signal.type}-${signal.value}`} className="flex justify-between text-muted">
                    <span>
                      {signal.type}: {signal.value}
                    </span>
                    <Badge variant="secondary">{Math.round(signal.confidence * 100)}%</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
        <TabsContent value="evidence" className="rounded-md border border-[var(--border)] bg-surface p-4">
          <EvidencePanel evidence={lead.evidence} />
        </TabsContent>
        <TabsContent value="timeline" className="rounded-md border border-[var(--border)] bg-surface p-4">
          <EmploymentTimeline employments={lead.employmentHistory} />
        </TabsContent>
        <TabsContent value="graph" className="rounded-md border border-[var(--border)] bg-surface p-4">
          {graph ? <RelationshipGraph graph={graph} /> : <p className="text-sm text-muted">Graph unavailable.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
