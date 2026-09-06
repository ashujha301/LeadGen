"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient, ApiClientError } from "@/shared/utils/api-client";

type TimelineBackfillButtonProps = {
  personId: string;
  className?: string;
};

export function TimelineBackfillButton({ personId, className = "" }: TimelineBackfillButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBackfill() {
    setLoading(true);
    setError(null);
    try {
      await apiClient.backfillPersonTimeline(personId);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Failed to re-run Crustdata person enrich.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void handleBackfill()}
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Re-enriching…" : "Re-run Crustdata enrich"}
      </Button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
