import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/server/worker/index.ts",
    migrate: "src/server/infrastructure/db/migrate.ts",
  },
  outDir: "dist/worker",
  format: ["esm"],
  target: "node24",
  platform: "node",
  tsconfig: "tsconfig.worker.json",
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outExtension() {
    return { js: ".js" };
  },
  external: [
    "pg-boss",
    "playwright",
    "pg",
    "pino",
    "openai",
    "drizzle-orm",
    "drizzle-orm/node-postgres",
    "drizzle-orm/node-postgres/migrator",
    "drizzle-orm/pg-core",
    "next",
    "react",
    "react-dom",
  ],
});
