"use client";

import { useState } from "react";
import Link from "next/link";
import type { OverlapResult } from "@/shared/contracts";
import { Link2, Loader2, Search } from "lucide-react";
import { apiClient, ApiClientError } from "@/shared/utils/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/features/shell/empty-state";
import { Badge } from "@/components/ui/badge";

export default function ConnectionsPage() {
  const [companyId, setCompanyId] = useState("");
  const [personId, setPersonId] = useState("");
  const [minOverlapDays, setMinOverlapDays] = useState("90");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OverlapResult[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const overlaps = await apiClient.findOverlaps({
        companyId: companyId.trim(),
        personId: personId.trim() || undefined,
        minOverlapDays: minOverlapDays ? Number(minOverlapDays) : undefined,
      });
      setResults(overlaps);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold">Connections</h1>
        </div>
        <p className="text-sm text-muted">
          Find shared-employment overlaps and relationship intelligence between people at a company.
        </p>
      </header>

      <form
        onSubmit={handleSearch}
        className="space-y-4 rounded-md border border-[var(--border)] bg-surface p-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="companyId" className="text-xs text-muted">
              Company ID
            </label>
            <Input
              id="companyId"
              placeholder="UUID of target company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="minOverlap" className="text-xs text-muted">
              Min overlap (days)
            </label>
            <Input
              id="minOverlap"
              type="number"
              min={1}
              value={minOverlapDays}
              onChange={(e) => setMinOverlapDays(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="personId" className="text-xs text-muted">
            Person ID (optional — filter to one person&apos;s overlaps)
          </label>
          <Input
            id="personId"
            placeholder="UUID of person"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading || !companyId.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-2">Find overlaps</span>
        </Button>
      </form>

      {error && (
        <Alert variant="destructive" title="Search failed">
          {error}
        </Alert>
      )}

      {results.length === 0 && !loading && !error && (
        <EmptyState
          title="No overlaps yet"
          description="Enter a company ID from a completed run to search for shared employment history."
        />
      )}

      {results.length > 0 && (
        <div className="overflow-hidden rounded-md border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-surface-raised text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Person A</th>
                <th className="px-3 py-2 font-medium">Person B</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Overlap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-surface">
              {results.map((row, idx) => (
                <tr key={idx} className="hover:bg-surface-raised/50">
                  <td className="px-3 py-2">
                    <Link href={`/people/${row.personA.id}`} className="text-accent hover:underline">
                      {row.personA.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/people/${row.personB.id}`} className="text-accent hover:underline">
                      {row.personB.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/companies/${row.company.id}`} className="text-accent hover:underline">
                      {row.company.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge>{row.overlapDays}d</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
