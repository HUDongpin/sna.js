import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __SNA_VERSION__: JSON.stringify("test"),
  },
  test: {
    include: ["tests/modern/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/modern/**/*.ts",
        "src/graph/**/*.ts",
        "src/centrality/**/*.ts",
        "src/statistics/**/*.ts",
        "src/community/**/*.ts",
        "src/prediction/**/*.ts",
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 90,
      },
      reporter: ["text", "json-summary"],
    },
  },
});
