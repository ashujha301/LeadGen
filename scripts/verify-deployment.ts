#!/usr/bin/env tsx
import { getEnv } from "@/shared/config/server";
import { getDb } from "@/server/infrastructure/db";
import { sql } from "drizzle-orm";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

async function verifyDeployment(): Promise<void> {
  const env = getEnv();
  const checks: CheckResult[] = [];

  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.push({ name: "database", ok: true, detail: "Connected" });
  } catch (error) {
    checks.push({
      name: "database",
      ok: false,
      detail: error instanceof Error ? error.message : "Connection failed",
    });
  }

  try {
    const response = await fetch(`${env.APP_URL}/api/health/live`, {
      signal: AbortSignal.timeout(10_000),
    });
    checks.push({
      name: "health_live",
      ok: response.ok,
      detail: `HTTP ${response.status}`,
    });
  } catch (error) {
    checks.push({
      name: "health_live",
      ok: false,
      detail: error instanceof Error ? error.message : "Request failed",
    });
  }

  try {
    const response = await fetch(`${env.APP_URL}/api/health/ready`, {
      signal: AbortSignal.timeout(10_000),
    });
    checks.push({
      name: "health_ready",
      ok: response.ok,
      detail: `HTTP ${response.status}`,
    });
  } catch (error) {
    checks.push({
      name: "health_ready",
      ok: false,
      detail: error instanceof Error ? error.message : "Request failed",
    });
  }

  const failed = checks.filter((check) => !check.ok);
  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

verifyDeployment().catch((error) => {
  console.error(error);
  process.exit(1);
});
