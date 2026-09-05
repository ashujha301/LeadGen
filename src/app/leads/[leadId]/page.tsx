import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { leadService } from "@/server/application/services/lead-service";
import { Button } from "@/components/ui/button";
import { LeadDetailView } from "@/features/leads/lead-detail-view";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const lead = await leadService.getLead(leadId);

  if (!lead) {
    notFound();
  }

  const graph = await leadService.getLeadGraph(leadId);

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
