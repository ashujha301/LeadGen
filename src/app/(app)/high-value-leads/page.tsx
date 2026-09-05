import Link from "next/link";
import { highValueLeadsRepo, getDb } from "@/server/infrastructure/db";
import { requireSession } from "@/features/auth/session-guard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function HighValueLeadsPage() {
  const user = await requireSession();
  const db = getDb();
  const companies = await highValueLeadsRepo.listHighValueCompanies(db, user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">High Value Leads</h1>
        <p className="text-sm text-muted">
          Companies from your searches that have qualifying high-value leads.
        </p>
      </div>

      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>High-value leads</TableHead>
              <TableHead>Top score</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <Link
                    href={`/high-value-leads/${company.id}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {company.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {company.websiteUrl ? (
                    <a
                      href={company.websiteUrl}
                      className="text-accent hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {company.websiteUrl}
                    </a>
                  ) : (
                    `https://${company.normalizedDomain}`
                  )}
                </TableCell>
                <TableCell>
                  {company.professionalNetworkUrl ? (
                    <a
                      href={company.professionalNetworkUrl}
                      className="text-accent hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      LinkedIn
                    </a>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{company.industry ?? "—"}</TableCell>
                <TableCell>
                  {company.qualifyingLeadCount > 0 ? (
                    <Badge>{company.qualifyingLeadCount}</Badge>
                  ) : (
                    <span className="text-muted">0</span>
                  )}
                </TableCell>
                <TableCell>{company.topScore ?? "—"}</TableCell>
                <TableCell>
                  {company.hasActiveRun ? (
                    <Badge variant="secondary">Active run</Badge>
                  ) : (
                    <span className="text-muted">Idle</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
