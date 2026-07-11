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
      "display/index": "src/display/index.ts",
      "worker/index": "src/worker/index.ts",
      "visualization/index": "src/visualization/index.ts",
      "visualization/three": "src/visualization/three.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    // `snaR` mirrors the whole API, so a bundled ./compat entry would
    // duplicate the root bundle (~500 kB in CJS). Emit thin wrappers over the
    // root entry instead; they become a real entry once the root drops its
    // deprecated compat re-exports.
    async onSuccess() {
      const { writeFile } = await import("node:fs/promises");
      await writeFile("dist/compat.js", 'export { snaR, onAttach, onLoad } from "./index.js";\n');
      await writeFile(
        "dist/compat.cjs",
        'const root = require("./index.cjs");\nmodule.exports = { snaR: root.snaR, onAttach: root.onAttach, onLoad: root.onLoad };\n',
      );
      const dts = 'export { snaR, onAttach, onLoad } from "./index.js";\nexport type { AttachOptions } from "./index.js";\n';
      await writeFile("dist/compat.d.ts", dts);
      await writeFile("dist/compat.d.cts", dts.replaceAll("./index.js", "./index.cjs"));
    },
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
