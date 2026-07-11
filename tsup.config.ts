import { defineConfig } from "tsup";

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

const shared = {
  target: "es2022" as const,
  external: ["three"] as (string | RegExp)[],
  define: {
    __SNA_VERSION__: JSON.stringify(pkg.version),
  },
  // Keep source maps small and publish `src/` in the tarball instead of
  // embedding every source file in the maps (also clearer for GPL compliance).
  esbuildOptions(options: { sourcesContent?: boolean }) {
    options.sourcesContent = false;
  },
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: "src/index.ts",
      "visualization/index": "src/visualization/index.ts",
      "visualization/three": "src/visualization/three.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    // Minified single-file ESM build for CDN (<script type="module">) usage.
    ...shared,
    entry: { "browser.min": "src/index.ts" },
    format: ["esm"],
    minify: true,
    sourcemap: false,
    dts: false,
    clean: false,
  },
]);
