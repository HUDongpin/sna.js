# SNA.js

SNA.js is a TypeScript/JavaScript port of the R `sna` package into a browser- and Node-compatible social network analysis library.

The goal is not to do a blind line-by-line translation. The goal is to preserve user-visible semantics where possible, make the algorithms scalable for web applications, and build a test harness that can prove parity with the R reference implementation.

## What is included

- A TypeScript package with ESM/CJS builds and a stable browser ESM entry.
- Dense graph primitives and ports for data preparation, density, dyad/triad census, reciprocity, transitivity, Krackhardt graph indices, centralization, degree, closeness, betweenness, Bonacich/flow/load/stress/information/Gil-Schmidt/graph/eigenvector centrality, prestige, shortest paths, components, reachability, neighborhoods, isolate checks, random graph generation, CUG/QAP tests, model helpers, and visualization subpaths.
- Vitest tests for small directed and undirected graphs.
- A Codex prompt in [`CODEX_PROMPT.md`](./CODEX_PROMPT.md).
- Codex/agent repo instructions in [`AGENTS.md`](./AGENTS.md).
- Porting documentation in [`docs/`](./docs/).
- Original R package reference source in [`reference/r-sna-2.8/`](./reference/r-sna-2.8/).

## Setup

```bash
npm install
npm test
npm run typecheck
npm run build
npm run check:publish
```

## Web usage

SNA.js supports two web-facing import paths:

```ts
// npm/bundler usage, for Vite, React, Next.js, and similar projects.
import { degree, gden } from "sna.js";
```

```html
<!-- No-build local usage after `npm run build`. -->
<script type="module">
  import { degree, gden } from "./dist/browser.js";

  const graph = [
    [0, 1],
    [0, 0],
  ];

  console.log(gden(graph, { mode: "digraph" }));
  console.log(degree(graph, { mode: "digraph", cmode: "outdegree" }));
</script>
```

```html
<!-- CDN usage after publish. Replace 0.0.0 with the package version you want. -->
<script type="module">
  import { gden } from "https://cdn.jsdelivr.net/npm/sna.js@0.0.0/dist/browser.js";

  console.log(gden([[0, 1], [0, 0]], { mode: "digraph" }));
</script>
```

The stable no-build browser entry is also available as the package subpath `sna.js/browser` for tools that resolve package exports. Three.js-based 3D helpers stay isolated under `sna.js/visualization/three`; importing the root package or browser entry does not import Three.js.

## Example

```ts
import {
  betweenness,
  closeness,
  componentDist,
  connectedness,
  degree,
  dyadCensus,
  efficiency,
  evcent,
  gden,
  geodist,
  graphcent,
  grecip,
  gtrans,
  hierarchy,
  isolates,
  mutuality,
  prestige,
  reachability,
  symmetrize,
} from "sna.js";

const graph = [
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 0],
];

console.log(gden(graph, { mode: "digraph" }));
console.log(dyadCensus(graph));
console.log(mutuality(graph));
console.log(grecip(graph, { measure: "edgewise" }));
console.log(gtrans(graph, { measure: "weak" }));
console.log(connectedness(graph));
console.log(efficiency(graph));
console.log(hierarchy(graph, { measure: "krackhardt" }));
console.log(degree(graph, { mode: "digraph", cmode: "outdegree" }));
console.log(closeness(graph, { mode: "digraph", cmode: "directed" }));
console.log(betweenness(graph, { mode: "digraph", cmode: "directed" }));
console.log(graphcent(graph, { mode: "digraph" }));
console.log(evcent(graph));
console.log(prestige(graph, { cmode: "domain" }));
console.log(geodist(graph, { mode: "digraph" }).distances);
console.log(isolates(graph, { mode: "digraph" }));
console.log(reachability(graph, { mode: "digraph" }));
console.log(componentDist(graph, { mode: "digraph", connected: "weak" }));
console.log(symmetrize(graph, { rule: "weak" }));
```

The browser example in [`examples/browser.html`](./examples/browser.html) uses the built `dist/browser.js` bundle and runs fully in the page:

```bash
npm run build
python3 -m http.server 4173
```

Then open `http://localhost:4173/examples/browser.html`.

## Visualization API

Visualization lives outside the core entry point so `import "sna.js"` stays lightweight. The 2D entry returns structured drawing data plus an SVG string:

```ts
import { gplot, plotSociomatrix } from "sna.js/visualization";

const plot = gplot(graph, {
  mode: "circle",
  label: ["A", "B", "C"],
  displaylabels: true,
});

document.body.innerHTML = plot.svg;

const matrixPlot = plotSociomatrix(graph, {
  labels: [["A", "B", "C"], ["A", "B", "C"]],
});
```

The 3D entry imports Three.js only from `sna.js/visualization/three`:

```ts
import { gplot3d } from "sna.js/visualization/three";

const result = gplot3d(graph, {
  mode: "random",
  seed: "demo",
});

renderer.render(result.scene, result.camera);
```

`gplot3d()` returns a `THREE.Scene`, graph `Group`, and camera, but does not create a `WebGLRenderer` unless a `container` is supplied. R base graphics parameters are mapped where they have browser/SVG/Three equivalents; interactive locator mode is intentionally not implemented and throws a clear error.

## Core API

Graph inputs may be square adjacency matrices or explicit edge-list objects:

```ts
const matrix = [
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 0],
];

const edgeList = {
  order: 3,
  directed: true,
  edges: [
    [0, 1],
    [1, 2, 2],
  ],
};
```

Common `GraphOptions`:

- `mode: "digraph" | "graph"` selects directed or undirected interpretation.
- `directed` can override `mode`.
- `diag: true` preserves loops; by default loops are suppressed for R-like SNA behavior.
- `threshold` dichotomizes numeric ties using absolute value in core graph normalization.
- `ignoreEval` asks algorithms to treat valued ties as binary where supported.
- `indexBase: 1` converts one-based edge-list vertices at input boundaries.
- `NaN` represents an R-like missing tie (`NA`) in graph inputs; `null`, `undefined`, and infinite values remain no tie.

Current public analysis and data-preparation functions include `asSociomatrixSna`, `asEdgelistSna`, `addIsolates`, `diagRemove`, `upperTriRemove`, `lowerTriRemove`, `egoExtract`, `gt`, `gvectorize`, `event2dichot`, `makeStochastic`, `stackcount`, `isEdgelistSna`, `sr2css`, `intervalGraph`, `symmetrize`, `readDot`, `readNos`, `writeDl`, `writeNos`, `gden`, `nties`, `dyadCensus`, `triadClassify`, `triadCensus`, `mutuality`, `grecip`, `gtrans`, `connectedness`, `efficiency`, `hierarchy`, `lubness`, `centralization`, `degree`, `closeness`, `betweenness`, `bonpow`, `flowbet`, `gilschmidt`, `infocent`, `loadcent`, `stresscent`, `graphcent`, `evcent`, `prestige`, `geodist`, `reachability`, `neighborhood`, `components`, `componentDist`, `componentLargest`, `componentSizeByVertex`, `cutpoints`, `bicomponentDist`, `kcores`, `cliqueCensus`, `kpathCensus`, `kcycleCensus`, `maxflow`, `simmelian`, `structureStatistics`, `centralgraph`, `gcor`, `gcov`, `gscor`, `gscov`, `hdist`, `sdmat`, `structdist`, `gclustCentralgraph`, `gclustBoxstats`, `sedist`, `redist`, `equivClust`, `blockmodel`, `blockmodelExpand`, `rgraph`, `rgnm`, `rguman`, `rgws`, `rgbn`, `rewireWs`, `rewireUd`, `numperm`, `rperm`, `rmperm`, `qaptest`, `cugtest`, `netlm`, `netlogit`, `lnam`, `pstar`, `bbnam`, `bbnamFixed`, `bbnamPooled`, `bbnamActor`, `bbnamBf`, `bn`, `isConnected`, `isolates`, and `isIsolate`. R-style names that are awkward in JavaScript are exposed through `snaR`, such as `snaR.infocent`, `snaR["as.edgelist.sna"]`, `snaR["triad.census"]`, `snaR["dyad.census"]`, `snaR["component.dist"]`, `snaR["make.stochastic"]`, `snaR["read.dot"]`, `snaR["write.dl"]`, `snaR["equiv.clust"]`, `snaR["blockmodel.expand"]`, and `snaR["bbnam.fixed"]`.

## Current porting notes

- `isolates()` and `isIsolate()` follow R `sna` loop handling: loops are ignored unless `diag: true`.
- `reachability()` is reflexive, matching R `sna`: each vertex reaches itself via a length-0 path.
- `componentDist()` returns zero-based component memberships; R memberships are one-based.
- Data-preparation helpers port `add.isolates`, `as.edgelist.sna`, `as.sociomatrix.sna`, `diag.remove`, `ego.extract`, `event2dichot`, `gt`, `gvectorize`, `interval.graph`, `is.edgelist.sna`, `lower.tri.remove`, `make.stochastic`, `sr2css`, `stackcount`, `symmetrize`, and `upper.tri.remove`. SNA.js edgelists use zero-based vertices and explicit `{ order, edges, indexBase: 0 }` fields instead of R matrix attributes.
- File format helpers are browser-safe string parsers/serializers. `readDot()` implements the directed `->` subset used by R `read.dot`, while `readNos()`, `writeNos()`, and `writeDl()` leave actual file access to the caller.
- `gvectorize()` follows the R wrapper's column-major matrix vectorization order. `NaN` is used for R-like censored or missing cells.
- `dyadCensus()` returns a named object `{ mutual, asymmetric, nullDyads, missingDyads }` instead of R's one-row `Mut`/`Asym`/`Null` matrix. Missing dyads are omitted from the MAN counts.
- `triadClassify()` uses zero-based triad vertices and returns Davis-Leinhardt class strings for directed graphs, `0` through `3` for undirected graphs, or `null` for R-like missing triads. `triadCensus()` returns a named count object instead of R's one-row matrix, skips missing triads, and returns zero-filled counts for graphs with fewer than three vertices.
- `grecip()` supports dyadic, non-null dyadic, edgewise, edgewise log-relative-risk, and correlation reciprocity. Dyads with `NaN` ties are omitted where R omits missing dyads.
- `gtrans()` supports weak, strong, weakcensus, strongcensus, rank, and correlation transitivity. The rank path follows the native `transitivity_R` ordered two-path risk-set behavior, including missing ordered-triad omission.
- `mutuality()`, `connectedness()`, `efficiency()`, `hierarchy()`, and `lubness()` follow the R `gli.R` wrappers for mutual dyad counts and Krackhardt graph-level indices.
- `closeness()` follows R's directed, undirected, inverse-distance, Gil-Schmidt, `rescale`, and `tmaxdev` modes. Node selection uses zero-based `nodes`.
- In undirected graph mode, `closeness(..., { cmode: "suminvdir" })` follows the documented behavior and is treated as inverse-distance undirected closeness.
- `betweenness()` ports the native `betweenness_R` accumulation modes for standard, endpoints, proximal, length-scaled, and linearly-scaled betweenness. Positive valued edges are treated as distances when `ignoreEval: false`.
- `stresscent()` and `loadcent()` share the shortest-path predecessor core with `betweenness()` and port the native stress/load accumulation modes. `loadcent()` follows R's directed transpose convention.
- `flowbet()` ports R's Edmonds-Karp based raw, normalized, and fractional flow betweenness modes. Edge values are capacities unless `ignoreEval: true`.
- `bonpow()` and `infocent()` use an internal browser-safe dense linear solver. Singular systems throw a clear error, matching R `solve()` failure semantics.
- `gilschmidt()` supports normalized and unnormalized Gil-Schmidt power scores; `centralization()` computes Freeman graph centralization over built-in or custom centrality functions.
- `graphcent()` follows R's Harary graph centrality definition, including directed/undirected geodesics, `geodistPrecomp`, `rescale`, `nodes`, and weighted geodesics when `ignoreEval: false`.
- `evcent()` ports R's default native power method. It does not symmetrize asymmetric data before extracting eigenvectors, and `useEigen: true` uses a browser-safe dense eigen fallback for cases where the power method is not desired.
- `prestige()` supports the documented indegree, normalized indegree, eigenvector, domain, and domain-proximity modes. Row-column stochastic prestige uses the shared `makeStochastic()` annealer and accepts `{ seed, rng }` for reproducible JavaScript draws.
- Structural helpers port `cutpoints`, `bicomponent.dist`, `kcores`, `clique.census`, `kpath.census`, `kcycle.census`, `maxflow`, `simmelian`, and `structure.statistics`. Census routines enumerate simple subgraphs, so they are intended for interactive small-to-medium graph analysis rather than unrestricted large-network scans.
- `cliqueCensus()`, `kpathCensus()`, and `kcycleCensus()` return typed objects with R-like count/comembership fields. Length and size rows are zero-based JavaScript arrays corresponding to R lengths/sizes in order.
- `kcores()` follows R's valued-edge default: use `ignoreEval: true` to force binary degree cores.
- `maxflow()` uses Edmonds-Karp over nonnegative capacities and returns either one scalar or a source-by-sink matrix. `simmelian()` returns a symmetric matrix by default, or a zero-based SNA.js edge list when `returnAsEdgeList: true`.
- Graph comparison helpers port `centralgraph`, `gcor`, `gcov`, `gscor`, `gscov`, `hdist`, `sdmat`, `structdist`, `gclust.centralgraph`, and `gclust.boxstats`. Structural comparison methods support `none`, `exhaustive`, `hillclimb`, `mc`, and a deterministic annealing-style heuristic.
- `gclustBoxstats()` returns grouped values and five-number-style statistics instead of drawing R boxplots. Plotting remains outside the browser-safe core package.
- Role-analysis helpers port `sedist`, `redist`, `equiv.clust`, `blockmodel`, and `blockmodel.expand`. `blockmodelExpand()` supports density blockmodels, matching the only expansion rule implemented by R `sna` 2.8, and rejects other block content with an explicit error. `redist()` intentionally requires finite binary 0/1 graph values and throws a clear error for valued inputs; this replaces R's later CATREGE failure path. `equivClust()` uses an internal hclust-compatible implementation with stable JavaScript tie-breaking, so tied-distance merge order can differ from R on ambiguous inputs.
- Random graph helpers port `rgraph`, `rgnm`, `rguman`, `rgws`, `rewire.ws`, and `rewire.ud`; random paths accept `{ seed, rng }`, with injected `rng` taking precedence. The built-in seeded RNG is deterministic and browser-safe, but it is not cryptographic and does not match R's RNG stream.
- `rgbn()` implements the MCMC biased-net sampler, including `seedGraph`, `dichotomizeSibEffects`, inhibition/satiation parameters, and the density guard. `method: "cftp"` supports the R-compatible exact-sampling subset (`pi`, `sigma`, `rho`, `d`, `maxiter`, and `dichotomizeSibEffects`) and returns `cftpConverged`; as in R `sna` 2.8, CFTP rejects `delta` and `epsilon`.
- `rewireWs()` skips a dyad when no legal null dyad sharing one endpoint exists, avoiding the infinite search possible in the native R routine on saturated or tiny graphs.
- `qaptest()` and `cugtest()` return data objects with `testValue`, `distribution`, `pGreaterEqual`, `pLessEqual`, and `reps`; S3-style `summary*`, `print*`, and `plot*` helpers return typed summaries, strings, and SVG/data-first plots.
- `netlm()` and `netlogit()` perform R-style graph vectorization with classical, QAP, QAP-SPP, QAP-X/Y/all-X, and CUG null distributions. They return data objects rather than R `lm`/`glm` S3 objects, with SNA.js display helpers for R-like coefficient, diagnostic, and distribution summaries.
- `lnam()` ports the linear network autocorrelation likelihood with browser-safe Nelder-Mead optimization and numerical Hessian standard errors. Optimizer traces and exact BFGS parity with R `optim()` are not guaranteed.
- `bbnamFixed()`, `bbnamPooled()`, `bbnamActor()`, and `bbnamBf()` implement the documented Bayesian network accuracy model variants with injectable JavaScript RNGs. Draw streams do not match R's RNG.
- `pstar()` returns an MPLE/logistic result object with the legacy perturbation effects. The LUBness term is implemented in TypeScript and may differ from the R native helper on edge cases.
- `bn()` supports the R default `mple.triad` biased-net fit, plus `mple.edge`, `mple.dyad`, and `mtle`, along with dyad/triad parent-stat and likelihood helpers. Optimization uses SNA.js's browser-safe Nelder-Mead path, so estimates are tolerance-based rather than bit-for-bit R `optim()` parity.
- Display helpers under the main entry point cover implemented graph tests, role/blockmodel objects, and model classes (`qaptest`, `cugtest`, `equiv.clust`, `blockmodel`, `brokerage`, `netcancor`, `netlm`, `netlogit`, `pstar`, `lnam`, `bn`, `bbnam`, and `bayes.factor`). They return browser-safe strings, structured tables, and SVG/plot data instead of writing to console or depending on R graphics.
- Visualization helpers live under `sna.js/visualization` and `sna.js/visualization/three`. They port `gplot`, `plot.sociomatrix`, 2D/3D layout helpers, and SVG/Three primitives as data-first renderers. Pixel-perfect R base graphics parity is not a goal; behavior and parameter semantics are prioritized.
- JavaScript vertex results and `isIsolate()` inputs are zero-based. For example, R isolate `4` is returned as `3`.
- R graph stacks/list inputs are only partially represented in the SNA.js public API. The data-preparation helpers accept arrays of graph inputs for stack-like workflows; most analysis functions still operate on one graph at a time.
- The current core graph normalization preserves `NaN` as missing metadata while keeping missing entries out of adjacency and weight calculations unless an algorithm explicitly handles missingness.
- Full R `sna` 2.8 parity is incremental. Remaining gaps are now concentrated in specialized/legacy front ends and exact R graphics behavior rather than the advanced core ports covered above.

## Browser performance notes

Most centrality and graph-summary helpers are suitable for interactive small-to-medium graphs in the main browser thread. Exhaustive routines such as `cliqueCensus()`, `kpathCensus()`, `kcycleCensus()`, exact structural-distance searches, large permutation tests, and model fits can grow quickly enough to freeze a page. For large user-supplied networks, run those paths behind explicit UI controls, progress messaging, or a Web Worker.

## API principles

1. Keep the public API familiar to R `sna` users, but idiomatic for JavaScript.
2. Use zero-based vertex indices in JavaScript APIs. Add explicit R-compatibility wrappers for one-based indexing when needed.
3. Support both matrix and edge-list inputs.
4. Keep the core package browser-safe. Do not add native Node-only dependencies to `src/`.
5. Prefer typed arrays and iterative algorithms for performance-sensitive paths.
6. Every ported function needs parity tests or documented divergence from R.

## Recommended development loop

1. Pick one function or one tight group of functions from `docs/FUNCTION_INVENTORY.md`.
2. Read the `.Rd` docs, the R wrapper, and any C routine called by that wrapper.
3. Add fixtures that compare expected R behavior on small graphs.
4. Implement the TypeScript function.
5. Run `npm test`, `npm run typecheck`, and `npm run build`.
6. Update docs with behavior notes, limitations, and performance considerations.

## License

This template is GPL-2.0-or-later because it is designed as a port of GPL-licensed R code. See [`NOTICE`](./NOTICE) and [`LICENSE`](./LICENSE).
