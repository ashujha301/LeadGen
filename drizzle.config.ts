import { defineConfig } from "drizzle-kit";

const schemaFiles = [
  "enums.ts",
  "helpers.ts",
  "auth-users.ts",
  "search-runs.ts",
  "source-documents.ts",
  "observations.ts",
  "companies.ts",
  "company-aliases.ts",
  "people.ts",
  "employments.ts",
  "contact-points.ts",
  "business-signals.ts",
  "entity-matches.ts",
  "lead-candidates.ts",
  "score-components.ts",
  "ai-calls.ts",
  "connector-attempts.ts",
  "request-limits.ts",
].map((file) => `./src/server/infrastructure/db/schema/${file}`);

export default defineConfig({
  schema: schemaFiles,
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://leadgen:leadgen@localhost:5432/leadgen",
  },
});
