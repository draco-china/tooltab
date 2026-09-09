import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 2,
    projects: [
      {
        test: {
          name: "tools",
          root: "./packages/tools",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          server: { deps: { inline: [/openapi-typescript/] } },
        },
      },
    ],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "html", "json", "json-summary"],
      reportOnFailure: true,
      include: ["**/src/**/*.{ts,js}"],
      exclude: ["**/*.d.ts", "apps/web/**", "**/apps/web/**"],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
        perFile: true,
      },
    },
  },
});
