import { DomainSearchForm } from "@/features/search/domain-search-form";
import { NaturalSearch } from "@/features/search/natural-search";
import { RecentRuns } from "@/features/runs/recent-runs";
import { Clock } from "lucide-react";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Domain search</h1>
        <p className="text-sm text-muted">
          Enter a company domain to discover decision-makers with evidence-backed scores.
        </p>
      </header>

      <DomainSearchForm />

      <NaturalSearch />

      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-accent" />
          Recent runs
        </div>
        <RecentRuns />
      </section>
    </div>
  );
}
