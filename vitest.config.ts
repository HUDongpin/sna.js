import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __SNA_VERSION__: JSON.stringify("test"),
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
