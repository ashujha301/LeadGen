import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { leadService } from "@/server/application/services/lead-service";
import { getDb, highValueLeadsRepo } from "@/server/infrastructure/db";
import { requireSession } from "@/features/auth/session-guard";
import { Button } from "@/components/ui/button";
import { LeadDetailView } from "@/features/leads/lead-detail-view";
import { HvlLeadNavToolbar } from "@/features/leads/hvl-lead-nav-toolbar";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ companyId: string; leadId: string }>;
};

export default async function HighValueLeadDetailPage({ params }: PageProps) {
  const user = await requireSession();
  const { companyId, leadId } = await params;
  const db = getDb();
  const company = await highValueLeadsRepo.getHighValueCompanyById(db, companyId, user.id);
  if (!company) {
    notFound();
  }

  const lead = await leadService.getLead(leadId, user.id);
  if (!lead || lead.companyId !== companyId) {
    notFound();
  }

  const navigation = await highValueLeadsRepo.getHighValueLeadNavigation(
    db,
    companyId,
    leadId,
    user.id,
  );
  if (!navigation) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/high-value-leads/${companyId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to {company.name}
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Lead no longer qualifies as high value</h1>
        <p className="text-sm text-muted">
          {lead.personName} is still linked to {company.name}, but does not currently meet high-value
          criteria (score, confidence, LinkedIn, or active status).
        </p>
      </div>
    );
  }

  const graph = await leadService.getLeadGraph(leadId, user.id);

  return (
    <LeadDetailView
      lead={lead}
      graph={graph}
      headerSlot={
        <HvlLeadNavToolbar
          companyId={companyId}
          companyName={company.name}
          navigation={navigation}
        />
      }
    />
  );
}
