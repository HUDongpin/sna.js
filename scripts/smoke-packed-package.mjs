// Install the exact npm tarball into an empty project and validate the public
// ESM, CommonJS, and TypeScript consumer boundaries without network access.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build as esbuild } from "esbuild";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const temporaryBase = process.env.SNA_JS_TEMP_ROOT ? resolve(process.env.SNA_JS_TEMP_ROOT) : tmpdir();
await mkdir(temporaryBase, { recursive: true });
const temporaryRoot = await mkdtemp(join(temporaryBase, "sna-js-consumer-"));
const packageDirectory = join(temporaryRoot, "package");
const consumerDirectory = join(temporaryRoot, "consumer");
const npmEnvironment = { ...process.env, npm_config_cache: join(temporaryRoot, "npm-cache") };

try {
  await mkdir(packageDirectory, { recursive: true });
  await mkdir(consumerDirectory, { recursive: true });
  const packReport = JSON.parse(
    execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", packageDirectory], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      env: npmEnvironment,
    }),
  );
  const tarball = join(packageDirectory, packReport[0].filename);

  await writeFile(
    join(temporaryRoot, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2),
  );
  execFileSync(
    "npm",
    ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=optional", tarball],
    { cwd: temporaryRoot, stdio: "inherit", env: npmEnvironment },
  );

  const esmSource = `
    import * as root from "@peterhudongpin/sna.js";
    import * as browser from "@peterhudongpin/sna.js/browser";
    import * as display from "@peterhudongpin/sna.js/display";
    import * as visualization from "@peterhudongpin/sna.js/visualization";
    import * as graph from "@peterhudongpin/sna.js/graph";
    import * as centrality from "@peterhudongpin/sna.js/centrality";
    import * as statistics from "@peterhudongpin/sna.js/statistics";
    import * as community from "@peterhudongpin/sna.js/community";
    import * as prediction from "@peterhudongpin/sna.js/prediction";
    import * as modern from "@peterhudongpin/sna.js/modern";
    import * as worker from "@peterhudongpin/sna.js/worker";
    import * as compat from "@peterhudongpin/sna.js/compat";
    if (typeof root.degree !== "function") throw new Error("root ESM missing degree");
    if (typeof browser.gden !== "function" || typeof display.printNetlm !== "function" ||
        typeof visualization.gplot !== "function") throw new Error("legacy ESM subpath is incomplete");
    for (const [name, value] of Object.entries({
      makeSparseGraph: graph.makeSparseGraph,
      pageRank: centrality.pageRank,
      triangles: statistics.triangles,
      louvain: community.louvain,
      jaccardCoefficient: prediction.jaccardCoefficient,
      modernPageRank: modern.pageRank,
      executeSnaTask: worker.executeSnaTask,
    })) if (typeof value !== "function") throw new Error(\`ESM missing \${name}\`);
    if (typeof compat.snaR !== "object") throw new Error("ESM missing snaR");
    console.log("packed ESM consumer passed");
  `;
  await writeFile(join(consumerDirectory, "esm.mjs"), esmSource);

  const cjsSource = `
    const root = require("@peterhudongpin/sna.js");
    const browser = require("@peterhudongpin/sna.js/browser");
    const display = require("@peterhudongpin/sna.js/display");
    const visualization = require("@peterhudongpin/sna.js/visualization");
    const worker = require("@peterhudongpin/sna.js/worker");
    const graph = require("@peterhudongpin/sna.js/graph");
    const centrality = require("@peterhudongpin/sna.js/centrality");
    const statistics = require("@peterhudongpin/sna.js/statistics");
    const community = require("@peterhudongpin/sna.js/community");
    const prediction = require("@peterhudongpin/sna.js/prediction");
    const modern = require("@peterhudongpin/sna.js/modern");
    const compat = require("@peterhudongpin/sna.js/compat");
    if (typeof root.degree !== "function" || typeof browser.gden !== "function" ||
        typeof display.printNetlm !== "function" || typeof visualization.gplot !== "function" ||
        typeof worker.executeSnaTask !== "function" || typeof graph.makeSparseGraph !== "function" ||
        typeof centrality.pageRank !== "function" || typeof statistics.triangles !== "function" ||
        typeof community.louvain !== "function" || typeof prediction.jaccardCoefficient !== "function" ||
        typeof modern.pageRank !== "function" || typeof compat.snaR !== "object")
      throw new Error("packed CJS surface is incomplete");
    console.log("packed CJS consumer passed without three");
  `;
  await writeFile(join(consumerDirectory, "cjs.cjs"), cjsSource);

  const typeSource = `
    import { makeSparseGraph, type GraphData } from "@peterhudongpin/sna.js/graph";
    import { pageRank, type PageRankOptions } from "@peterhudongpin/sna.js/centrality";
    import { louvain, type LouvainOptions } from "@peterhudongpin/sna.js/community";
    import { jaccardCoefficient } from "@peterhudongpin/sna.js/prediction";
    import { snaR, onAttach, type AttachOptions } from "@peterhudongpin/sna.js/compat";
    const data: GraphData = { directed: false, nodes: [{ id: "a" }, { id: "b" }], edges: [{ source: "a", target: "b" }] };
    const graph = makeSparseGraph(data);
    const precise = makeSparseGraph({
      directed: false,
      nodes: [{ id: "Ada" as const }, { id: "Lin" as const }],
      edges: [{ source: "Ada" as const, target: "Lin" as const }],
    });
    const preciseId: "Ada" | "Lin" = precise.nodeIds[0]!;
    const rankOptions: PageRankOptions = { damping: 0.85 };
    const communityOptions: LouvainOptions = { seed: 7 };
    pageRank(graph, rankOptions);
    louvain(graph, communityOptions);
    jaccardCoefficient(graph, [["a", "b"]]);
    const attachOptions: AttachOptions = { version: "0.5.0" };
    onAttach(attachOptions);
    snaR.degree;
    preciseId;
  `;
  await writeFile(join(consumerDirectory, "consumer.ts"), typeSource);

  execFileSync("node", [join(consumerDirectory, "esm.mjs")], { cwd: temporaryRoot, stdio: "inherit" });
  execFileSync("node", [join(consumerDirectory, "cjs.cjs")], { cwd: temporaryRoot, stdio: "inherit" });
  const tsc = join(projectRoot, "node_modules", ".bin", "tsc");
  execFileSync(
    tsc,
    [
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      join(consumerDirectory, "consumer.ts"),
    ],
    { cwd: temporaryRoot, stdio: "inherit" },
  );

  const treeShakeCases = [
    ["graph", "makeSparseGraph"],
    ["centrality", "pageRank"],
    ["statistics", "triangles"],
    ["community", "louvain"],
    ["prediction", "jaccardCoefficient"],
    ["modern", "pageRank"],
  ];
  for (const [subpath, exported] of treeShakeCases) {
    const result = await esbuild({
      stdin: {
        contents: `import { ${exported} as selected } from "@peterhudongpin/sna.js/${subpath}"; globalThis.__selected = selected;`,
        resolveDir: consumerDirectory,
        sourcefile: `${subpath}-tree-shake.mjs`,
      },
      bundle: true,
      format: "esm",
      minify: true,
      platform: "browser",
      target: "es2022",
      treeShaking: true,
      write: false,
      logLevel: "silent",
    });
    const output = result.outputFiles[0]?.contents;
    if (!output || output.byteLength === 0) throw new Error(`${subpath} tree-shaken bundle is empty`);
    const gzipBytes = gzipSync(output, { level: 9 }).byteLength;
    if (gzipBytes > 75 * 1024) throw new Error(`${subpath} tree-shaken bundle exceeds 75 KiB gzip`);
    console.log(`packed ${subpath} tree-shaking passed (${(gzipBytes / 1024).toFixed(1)} KiB gzip)`);
  }

  const workerBundle = await esbuild({
    stdin: {
      contents: 'import "@peterhudongpin/sna.js/worker";',
      resolveDir: consumerDirectory,
      sourcefile: "worker-bootstrap.mjs",
    },
    bundle: true,
    format: "esm",
    minify: true,
    platform: "browser",
    target: "es2022",
    treeShaking: true,
    write: false,
    logLevel: "silent",
  });
  const workerText = workerBundle.outputFiles[0]?.text ?? "";
  if (!workerText.includes("addEventListener") || !workerText.includes("postMessage")) {
    throw new Error("worker bare import was removed or did not retain self-registration");
  }
  console.log("packed worker side-effect retention passed");

  await symlink(join(projectRoot, "node_modules", "three"), join(temporaryRoot, "node_modules", "three"), "dir");
  await mkdir(join(temporaryRoot, "node_modules", "@types"), { recursive: true });
  await symlink(
    join(projectRoot, "node_modules", "@types", "three"),
    join(temporaryRoot, "node_modules", "@types", "three"),
    "dir",
  );
  await writeFile(
    join(consumerDirectory, "three.mjs"),
    'import * as m from "@peterhudongpin/sna.js/visualization/three"; if (typeof m.gplot3d !== "function") process.exit(1);\n',
  );
  await writeFile(
    join(consumerDirectory, "three.cjs"),
    'const m = require("@peterhudongpin/sna.js/visualization/three"); if (typeof m.gplot3d !== "function") process.exit(1);\n',
  );
  await writeFile(
    join(consumerDirectory, "three.ts"),
    'import { gplot3d, type Gplot3dOptions } from "@peterhudongpin/sna.js/visualization/three";\nconst options: Gplot3dOptions = { vertexRadius: 1 };\nvoid gplot3d; void options;\n',
  );
  execFileSync("node", [join(consumerDirectory, "three.mjs")], { cwd: temporaryRoot, stdio: "inherit" });
  execFileSync("node", [join(consumerDirectory, "three.cjs")], { cwd: temporaryRoot, stdio: "inherit" });
  execFileSync(
    tsc,
    [
      "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext",
      join(consumerDirectory, "three.ts"),
    ],
    { cwd: temporaryRoot, stdio: "inherit" },
  );
  console.log("packed optional Three ESM/CJS/TypeScript consumer passed");
  const installed = JSON.parse(
    await readFile(join(temporaryRoot, "node_modules", "@peterhudongpin", "sna.js", "package.json"), "utf8"),
  );
  console.log(`packed TypeScript consumer passed (${basename(tarball)}, version ${installed.version})`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
