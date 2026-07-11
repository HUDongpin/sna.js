// Post-build smoke test: the packaged entry points load in ESM and CJS, the
// bundled example runs, and headline numbers stay sane.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "ok" : "FAIL"} - ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
};

const esm = await import(join(root, "dist/index.js"));
check("ESM entry loads", Object.keys(esm).length >= 200, `${Object.keys(esm).length} exports`);

const cjs = require(join(root, "dist/index.cjs"));
check("CJS entry loads", Object.keys(cjs).length >= 200, `${Object.keys(cjs).length} exports`);

const min = await import(join(root, "dist/browser.min.js"));
check("browser.min entry loads", Object.keys(min).length >= 200, `${Object.keys(min).length} exports`);

const viz = await import(join(root, "dist/visualization/index.js"));
check("visualization entry loads", typeof viz.gplot === "function");

const { runBasicAnalysis } = await import(join(root, "examples/analysis.mjs"));
const analysis = runBasicAnalysis();
check("example analysis runs", analysis.order === 4);
check("example density", Math.abs(analysis.density - 3 / 12) < 1e-12, String(analysis.density));
check("example indegree", JSON.stringify(analysis.indegree) === "[1,1,1,0]", JSON.stringify(analysis.indegree));

const svg = viz.gplot([[0, 1], [1, 0]], { mode: "graph" });
check("gplot renders SVG", typeof svg.svg === "string" && svg.svg.includes("<svg"));

if (failures > 0) {
  console.error(`${failures} smoke check(s) failed`);
  process.exit(1);
}
console.log("smoke: all checks passed");
