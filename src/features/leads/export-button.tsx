"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient, ApiClientError } from "@/shared/utils/api-client";

type ExportButtonProps = {
  runId: string;
  disabled?: boolean;
};

export function ExportButton({ runId, disabled }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiClient.exportRunUrl(runId));
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiClientError(
          body?.error?.code ?? "EXPORT_FAILED",
          body?.error?.message ?? "Export failed",
          body?.error?.requestId ?? "",
          res.status,
        );
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `leads-${runId.slice(0, 8)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={handleExport} disabled={disabled || loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        <span className="ml-2">Export CSV</span>
      </Button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
