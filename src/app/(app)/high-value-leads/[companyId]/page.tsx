import Link from "next/link";
import { notFound } from "next/navigation";
import { highValueLeadsRepo, getDb, entitiesRepo } from "@/server/infrastructure/db";
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
import { formatPercent, formatScore } from "@/shared/utils/formatters";
import { LinkedinCell } from "@/features/leads/linkedin-cell";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ companyId: string }>;
};

export default async function HighValueCompanyPage({ params }: PageProps) {
  const user = await requireSession();
  const { companyId } = await params;
  const db = getDb();
  const company = await highValueLeadsRepo.getHighValueCompanyById(db, companyId, user.id);

  if (!company) {
    notFound();
  }

  const page = await highValueLeadsRepo.getHighValueLeadsByCompanyId(db, companyId, {
    limit: 50,
    userId: user.id,
  });
  const leadRows = await Promise.all(
    page.leads.map(async (lead) => {
      const employments = await entitiesRepo.getEmploymentsByPersonId(db, lead.personId);
      const current = employments.find(
        (employment) => employment.companyId === companyId && employment.isCurrent,
      );
      const linkedin = await entitiesRepo.getContactPointsByPersonId(db, lead.personId);
      return {
        lead,
        title: current?.rawTitle ?? null,
        linkedinUrl:
          linkedin.find((contact) => contact.type === "linkedin")?.rawValue ??
          lead.person.profileUrl,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/high-value-leads" className="text-sm text-accent hover:underline">
          ← All companies
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{company.name}</h1>
        <p className="text-sm text-muted">
          {company.normalizedDomain}
          {company.industry ? ` · ${company.industry}` : ""}
          {company.employeeCount != null ? ` · ${company.employeeCount} employees` : ""}
        </p>
        {company.professionalNetworkUrl && (
          <a
            href={company.professionalNetworkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:underline"
          >
            LinkedIn company page
          </a>
        )}
      </div>

      <div className="rounded-md border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Current role</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Why high value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted">
                  No qualifying high-value leads yet for this company.
                </TableCell>
              </TableRow>
            ) : (
              leadRows.map(({ lead, title, linkedinUrl }) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link
                      href={`/high-value-leads/${companyId}/leads/${lead.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {lead.person.name}
                    </Link>
                  </TableCell>
                  <TableCell>{title ?? "—"}</TableCell>
                  <TableCell>
                    <LinkedinCell
                      linkedinUrl={linkedinUrl}
                      enrichmentStatus={lead.enrichmentStatus}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge>{formatScore(Number(lead.finalScore))}</Badge>
                  </TableCell>
                  <TableCell>{formatPercent(Number(lead.confidence))}</TableCell>
                  <TableCell>
                    {lead.explanation ?? lead.roleMatchReasons?.join(", ") ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
