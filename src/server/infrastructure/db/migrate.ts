import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate] DATABASE_URL is required");
    process.exit(1);
  }

  const migrationsFolder =
    process.env.DRIZZLE_MIGRATIONS_FOLDER ?? path.join(process.cwd(), "drizzle");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    console.log(`[migrate] Applying migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] Migrations applied successfully");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
