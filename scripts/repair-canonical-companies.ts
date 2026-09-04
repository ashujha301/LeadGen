import { pickCompanyName } from "@/server/domain/company-identity";
import { normalizeCompanyInput } from "@/server/domain/normalization/company-input";
import { normalizeName } from "@/server/domain";
import { entitiesRepo, getDb, runsRepo, sourcesRepo } from "@/server/infrastructure/db";

type RepairAction = {
  companyId: string;
  normalizedDomain: string;
  currentName: string;
  proposedName: string;
  websiteUrl: string | null;
  professionalNetworkUrl: string | null;
};

async function collectRepairActions(): Promise<RepairAction[]> {
  const db = getDb();
  const companies = await db.query.companies.findMany();
  const actions: RepairAction[] = [];

  for (const company of companies) {
    const latestRun = await runsRepo.getLatestCompletedRunByDomain(db, company.normalizedDomain);
    const observations = latestRun
      ? await sourcesRepo.getObservationsByRunId(db, latestRun.id)
      : [];
    const companyObs = observations.filter((obs) => obs.entityType === "company");
    const proposedName = pickCompanyName(companyObs, company.normalizedDomain);
    const normalizedInput = normalizeCompanyInput(company.normalizedDomain);
    const websiteUrl = company.websiteUrl ?? normalizedInput?.homepageUrl ?? null;
    const linkedinObs = companyObs.find((obs) => obs.attribute === "professional_network_url");

    if (
      proposedName !== company.name ||
      !company.websiteUrl ||
      (!company.professionalNetworkUrl && linkedinObs?.rawValue)
    ) {
      actions.push({
        companyId: company.id,
        normalizedDomain: company.normalizedDomain,
        currentName: company.name,
        proposedName,
        websiteUrl,
        professionalNetworkUrl: company.professionalNetworkUrl ?? linkedinObs?.rawValue ?? null,
      });
    }
  }

  return actions;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const actions = await collectRepairActions();

  if (actions.length === 0) {
    console.log("No canonical company repairs needed.");
    return;
  }

  console.log(`${apply ? "Applying" : "Report-only"} ${actions.length} company repair(s):`);
  for (const action of actions) {
    console.log(
      `- ${action.normalizedDomain}: "${action.currentName}" -> "${action.proposedName}"` +
        (action.websiteUrl ? ` website=${action.websiteUrl}` : "") +
        (action.professionalNetworkUrl ? ` linkedin=${action.professionalNetworkUrl}` : ""),
    );
  }

  if (!apply) {
    console.log("\nRe-run with --apply to persist these changes.");
    return;
  }

  const db = getDb();
  for (const action of actions) {
    await entitiesRepo.updateCompany(db, action.companyId, {
      name: action.proposedName,
      normalizedName: normalizeName(action.proposedName),
      websiteUrl: action.websiteUrl,
      professionalNetworkUrl: action.professionalNetworkUrl,
      nameSource: action.proposedName !== action.currentName ? "repair" : undefined,
      nameObservedAt: action.proposedName !== action.currentName ? new Date() : undefined,
    });
  }

  console.log("Repair complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
