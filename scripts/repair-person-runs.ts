import { getDb, entitiesRepo, runsRepo } from "@/server/infrastructure/db";

type RepairReport = {
  duplicateGroups: number;
  suspiciousPeople: number;
  inconsistentRuns: number;
};

async function collectRepairReport(options: {
  runId?: string;
  companyId?: string;
}): Promise<RepairReport> {
  const db = getDb();
  let duplicateGroups = 0;
  const suspiciousPeople = 0;
  let inconsistentRuns = 0;

  if (options.runId) {
    const run = await runsRepo.getRunById(db, options.runId);
    if (
      run &&
      run.status !== "failed" &&
      run.status !== "completed" &&
      (run.errorCode || run.completedAt)
    ) {
      inconsistentRuns += 1;
    }
  } else {
    const runs = await runsRepo.listRecentRuns(db, 100);
    for (const run of runs) {
      if (
        run.status !== "failed" &&
        run.status !== "completed" &&
        (run.errorCode || run.completedAt)
      ) {
        inconsistentRuns += 1;
      }
    }
  }

  if (options.companyId) {
    const employments = await entitiesRepo.getEmploymentsByCompanyId(db, options.companyId);
    const names = new Map<string, number>();
    for (const employment of employments) {
      const person = await entitiesRepo.getPersonById(db, employment.personId);
      if (!person) {
        continue;
      }
      names.set(person.normalizedName, (names.get(person.normalizedName) ?? 0) + 1);
    }
    duplicateGroups += [...names.values()].filter((count) => count > 1).length;
  }

  return { duplicateGroups, suspiciousPeople, inconsistentRuns };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const runIdArg = process.argv.find((arg) => arg.startsWith("--run-id="));
  const companyIdArg = process.argv.find((arg) => arg.startsWith("--company-id="));
  const runId = runIdArg?.split("=")[1];
  const companyId = companyIdArg?.split("=")[1];

  const report = await collectRepairReport({ runId, companyId });

  console.log("Person/run repair report");
  console.log(`- duplicate groups: ${report.duplicateGroups}`);
  console.log(`- suspicious people: ${report.suspiciousPeople}`);
  console.log(`- inconsistent runs: ${report.inconsistentRuns}`);

  if (!apply) {
    console.log("\nRe-run with --apply after reviewing this report.");
    return;
  }

  console.log(
    "\nApply mode is not implemented yet. Review the report and approve a follow-up change set.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
