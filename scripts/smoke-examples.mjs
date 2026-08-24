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

const display = await import(join(root, "dist/display/index.js"));
check("display entry loads", Object.keys(display).length >= 50, `${Object.keys(display).length} exports`);

const compatEsm = await import(join(root, "dist/compat.js"));
const compatCjs = require(join(root, "dist/compat.cjs"));
check("compat entries load", typeof compatEsm.snaR === "object" && typeof compatCjs.snaR === "object");

const graphEntry = await import(join(root, "dist/graph/index.js"));
const centralityEntry = await import(join(root, "dist/centrality/index.js"));
const statisticsEntry = await import(join(root, "dist/statistics/index.js"));
const communityEntry = await import(join(root, "dist/community/index.js"));
const predictionEntry = await import(join(root, "dist/prediction/index.js"));
const modernEntry = await import(join(root, "dist/modern/index.js"));
const workerEntry = await import(join(root, "dist/worker/index.js"));
const modernGraph = {
  directed: false,
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
  edges: [{ source: "a", target: "b" }, { source: "b", target: "c" }],
};
const sparse = graphEntry.makeSparseGraph(modernGraph);
check("graph entry builds sparse CSR/CSC", sparse.order === 3 && sparse.size === 2 && sparse.csr.offsets.length === 4);
const ranks = centralityEntry.pageRank(sparse, { maxIterations: 500 });
check("centrality entry runs PageRank", ranks.nodes.join(",") === "a,b,c" && Math.abs(ranks.values.reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
check("statistics entry runs triangles", statisticsEntry.triangles(sparse).values.every((value) => value === 0));
check("community entry runs Louvain", communityEntry.louvain(sparse, { seed: 5 }).membership.length === 3);
check("prediction entry runs explicit pairs", predictionEntry.commonNeighbors(sparse, [["a", "c"]]).pairs[0]?.score === 1);
check("modern aggregate entry loads", typeof modernEntry.pageRank === "function" && typeof modernEntry.makeSparseGraph === "function");
check("worker entry keeps three runtime exports", Object.keys(workerEntry).length === 3, `${Object.keys(workerEntry).length} exports`);
check(
  "worker executes typed modern task",
  workerEntry.executeSnaTask({ fn: "pageRank", payload: { input: sparse }, options: { maxIterations: 500 } }).values.length === 3,
);

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
