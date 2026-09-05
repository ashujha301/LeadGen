import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/architecture/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests/integration/**", "tests/e2e/**"],
  },
});
