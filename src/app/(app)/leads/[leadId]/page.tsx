import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { leadService } from "@/server/application/services/lead-service";
import { requireSession } from "@/features/auth/session-guard";
import { Button } from "@/components/ui/button";
import { LeadDetailView } from "@/features/leads/lead-detail-view";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const user = await requireSession();
  const { leadId } = await params;
  const lead = await leadService.getLead(leadId, user.id);

  if (!lead) {
    notFound();
  }

  const graph = await leadService.getLeadGraph(leadId, user.id);

  return (
    <LeadDetailView
      lead={lead}
      graph={graph}
      headerSlot={
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/people/${lead.personId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            View person
          </Link>
        </Button>
      }
    />
  );
}
