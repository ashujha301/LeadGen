import { and, eq, isNull, or, sql } from "drizzle-orm";

import { normalizeDomain } from "@/server/domain/normalization/domain";
import { normalizeUrl } from "@/server/domain/normalization/url";
import { companies, companyExternalProfiles, employments, getDb } from "@/server/infrastructure/db";

type RepairAction = {
  employmentId: string;
  personId: string;
  currentCompanyId: string | null;
  proposedCompanyId: string;
  matchVia: "provider_company_id" | "employer_domain" | "employer_linkedin_url";
  matchValue: string;
};

async function collectRepairActions(): Promise<RepairAction[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: employments.id,
      personId: employments.personId,
      companyId: employments.companyId,
      providerCompanyId: employments.providerCompanyId,
      employerDomain: employments.employerDomain,
      employerProfessionalNetworkUrl: employments.employerProfessionalNetworkUrl,
    })
    .from(employments)
    .where(
      or(
        isNull(employments.companyId),
        sql`${employments.providerCompanyId} is not null`,
        sql`${employments.employerDomain} is not null`,
        sql`${employments.employerProfessionalNetworkUrl} is not null`,
      ),
    );

  const actions: RepairAction[] = [];

  for (const row of rows) {
    if (row.providerCompanyId) {
      const byProvider = await db.query.companyExternalProfiles.findFirst({
        where: and(
          eq(companyExternalProfiles.provider, "crustdata"),
          eq(companyExternalProfiles.providerCompanyId, row.providerCompanyId),
        ),
      });
      if (byProvider?.companyId && byProvider.companyId !== row.companyId) {
        actions.push({
          employmentId: row.id,
          personId: row.personId,
          currentCompanyId: row.companyId,
          proposedCompanyId: byProvider.companyId,
          matchVia: "provider_company_id",
          matchValue: row.providerCompanyId,
        });
        continue;
      }
    }

    const domain = row.employerDomain ? normalizeDomain(row.employerDomain) : null;
    if (domain) {
      const byDomain = await db.query.companies.findFirst({
        where: eq(companies.normalizedDomain, domain),
      });
      if (byDomain && byDomain.id !== row.companyId) {
        actions.push({
          employmentId: row.id,
          personId: row.personId,
          currentCompanyId: row.companyId,
          proposedCompanyId: byDomain.id,
          matchVia: "employer_domain",
          matchValue: domain,
        });
        continue;
      }
    }

    const linkedinUrl = row.employerProfessionalNetworkUrl
      ? normalizeUrl(row.employerProfessionalNetworkUrl)
      : null;
    if (linkedinUrl) {
      const byLinkedin = await db.query.companies.findFirst({
        where: eq(companies.professionalNetworkUrl, linkedinUrl),
      });
      if (byLinkedin && byLinkedin.id !== row.companyId) {
        actions.push({
          employmentId: row.id,
          personId: row.personId,
          currentCompanyId: row.companyId,
          proposedCompanyId: byLinkedin.id,
          matchVia: "employer_linkedin_url",
          matchValue: linkedinUrl,
        });
      }
    }
  }

  return actions;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const actions = await collectRepairActions();

  if (actions.length === 0) {
    console.log("No employer-link repairs needed.");
    return;
  }

  console.log(`${apply ? "Applying" : "Report-only"} ${actions.length} employer-link repair(s):`);
  for (const action of actions) {
    console.log(
      `- employment=${action.employmentId} person=${action.personId} ` +
        `${action.currentCompanyId ?? "null"} -> ${action.proposedCompanyId} ` +
        `via ${action.matchVia}=${action.matchValue}`,
    );
  }

  if (!apply) {
    console.log("\nRe-run with --apply to persist these changes.");
    return;
  }

  const db = getDb();
  for (const action of actions) {
    await db
      .update(employments)
      .set({ companyId: action.proposedCompanyId, updatedAt: new Date() })
      .where(eq(employments.id, action.employmentId));
  }

  console.log(`Applied ${actions.length} employer-link repair(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
