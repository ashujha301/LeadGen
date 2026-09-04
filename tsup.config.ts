import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server/worker/index.ts"],
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
    "drizzle-orm/pg-core",
    "next",
    "react",
    "react-dom",
  ],
});
