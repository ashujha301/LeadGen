import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HighValueLeadNavigation } from "@/server/infrastructure/db/repositories/high-value-leads";

type HvlLeadNavToolbarProps = {
  companyId: string;
  companyName: string;
  navigation: HighValueLeadNavigation;
};

export function HvlLeadNavToolbar({ companyId, companyName, navigation }: HvlLeadNavToolbarProps) {
  const previousHref = navigation.previousLeadId
    ? `/high-value-leads/${companyId}/leads/${navigation.previousLeadId}`
    : null;
  const nextHref = navigation.nextLeadId
    ? `/high-value-leads/${companyId}/leads/${navigation.nextLeadId}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="ghost" size="sm" className="-ml-2 min-w-[8.5rem] justify-start">
        <Link href={`/high-value-leads/${companyId}`} aria-label={`Back to ${companyName}`}>
          <ArrowLeft className="mr-1 h-4 w-4 shrink-0" />
          <span className="truncate">Back to {companyName}</span>
        </Link>
      </Button>

      <div className="ml-auto flex items-center gap-1">
        {previousHref ? (
          <Button asChild variant="outline" size="sm" className="min-w-[6.5rem]">
            <Link href={previousHref} aria-label="Previous high-value lead">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="min-w-[6.5rem]"
            disabled
            aria-label="Previous high-value lead"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
        )}

        <span className="min-w-[4.5rem] text-center text-xs text-muted" aria-live="polite">
          {navigation.position} of {navigation.total}
        </span>

        {nextHref ? (
          <Button asChild variant="outline" size="sm" className="min-w-[6.5rem]">
            <Link href={nextHref} aria-label="Next high-value lead">
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="min-w-[6.5rem]"
            disabled
            aria-label="Next high-value lead"
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
