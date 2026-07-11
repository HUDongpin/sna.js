# Changelog

All notable changes to this project are documented here. This is a scientific
library: **any change that alters numerical results is called out explicitly.**

## 0.3.1 — 2026-07-11

No code changes. The 0.3.0 release-gate test that raises the graph-order cap
probed `geodist` at order 5500, which exceeded the test timeout on slower CI
runners; it now probes graph normalization directly (where the guard fires).
0.3.0 exists as a git tag only and was never published to npm.

## 0.3.0 — 2026-07-11

No changes to numerical results.

### Added

- **Web Worker adapter** (`@peterhudongpin/sna.js/worker`): a structured-
  clone-safe protocol over 20 heavy routines with progress events and hard
  cancellation via worker termination (auto-respawn on the next run). The
  module self-registers when loaded inside a worker; `executeSnaTask` is
  exported for other runtimes. Permutation tests accept named statistics
  (`gcor`/`gscor`/`hdist`, `gtrans`/`gden`/`grecip`/`mutuality`/`hierarchy`).
  Verified in-browser: see `examples/worker.html`.
- **Cancellation and progress on the main thread**: `betweenness`,
  `closeness`, `stresscent`, `loadcent`, `geodist`, `triadCensus`,
  `qaptest`, `cugtest`, and `cugTest` accept `{ signal, onProgress }`,
  checked per outer-loop step.
- **Input-size guard**: dense normalization rejects graph orders above 5000
  with an actionable error; `setMaxGraphOrder(n)` raises the cap
  deliberately (review F-012a).

### Changed

- Weighted shortest paths (`geodist`/`betweenness`/... with
  `ignoreEval: false`) now use a binary-heap Dijkstra instead of an O(n)
  selection scan per step — same results (parity fixtures unchanged),
  asymptotically faster on sparse graphs.

## 0.2.0 — 2026-07-11

### ⚠️ Results changed

- **`netlogit`**: `nullDeviance` now reproduces R exactly. R's `netlogit`
  calls `glm.fit(x, y, intercept=FALSE)` with the intercept inside `x`, so
  its null deviance is the empty-model (p = 0.5) deviance `2n·ln 2`, not the
  intercept-only mean-model deviance the previous release computed. `dfNull`
  is now `n` for the same reason. Coefficients, standard errors, deviance,
  and test statistics are unchanged.

### Added

- **Model parity fixtures**: the golden suite now covers `netlm` (classical
  null: coefficients, t-statistics, p-values exact to 1e-8), `netlogit`
  (classical null, 1e-5), `lnam` (point estimates and standard errors;
  R optimizes with BFGS, sna.js with Nelder–Mead, and both land on the same
  optimum on the fixture problem to ~1e-6), and `bbnam.fixed` with
  `outmode: "posterior"` (closed-form posterior, exact).
- **Subpath entries** `@peterhudongpin/sna.js/display` (59 print/summary/plot
  helpers) and `@peterhudongpin/sna.js/compat` (`snaR`, `onAttach`,
  `onLoad`). Root re-exports of both remain for compatibility but are now
  documented as deprecated.
- **API-surface gate**: every entry point's export list is pinned in
  `tests/api-surface.json`; unintended additions or removals fail CI.

## 0.1.1 — 2026-07-11

No code or numerical changes.

- Package renamed to **`@peterhudongpin/sna.js`**: the npm registry rejects
  bare `sna.js` as too similar to existing packages (`sql.js`, `sha.js`,
  `bn.js`, …). The GitHub project name is unchanged.
- Added `publishConfig.access: public` and a manually-dispatched
  `publish.yml` workflow that publishes from CI via npm trusted publishing
  (OIDC, with provenance).

## 0.1.0 — 2026-07-11

First public release. Compared to the unpublished 0.0.0 distribution snapshot,
this release fixes several silent numerical divergences from R `sna` 2.8 and
adds an executable parity harness.

### ⚠️ Results changed (correctness fixes, now matching R sna 2.8)

- **`degree`**: the default `cmode: "freeman"` previously computed *outdegree
  only*; it now sums indegree + outdegree like R. `"total"` remains as an
  alias of `"freeman"`. Undirected data now forces indegree accumulation
  (column sums) exactly like R, and self-loops with `diag: true` count once
  in every cmode (matching R's C kernel).
- **`degree`**: the default `ignoreEval` changed from `true` to `false`
  (valued), matching R `ignore.eval=FALSE`. Pass `ignoreEval: true` for the
  old binary behavior.
- **`centralization`**: degree-based centralization was corrupted by the
  `degree` bug (e.g. out-star returned 0.75; R returns 0.5). Fixed via the
  `degree` fix.
- **`gden`**: now sums tie *values* by default (`ignoreEval: false`, R
  default), subtracts missing (`NaN`) cells from the denominator like R, uses
  R's ordered-pair denominator in both modes, and reproduces R's `NaN`
  behavior for n=0 and diagonal-free n=1 graphs. Previously it counted binary
  ties only and ignored missingness.
- **`nties`**: now returns the number of *possible* ties (R semantics);
  previously it counted realized ties.
- **`geodist`**: `ignoreEval: false` now computes weighted shortest paths
  (Dijkstra, like R `geodist_val_R`) and rejects negative edge values;
  previously the option was silently ignored and hop counts were returned.
- **Graph-mode normalization**: matrices passed with `mode: "graph"` are now
  used **as given**, like R — previously asymmetric input was silently
  weak-symmetrized, changing densities, censuses, and centralities relative
  to R. Explicit opt-in via the new `symmetrize` graph option.
- **`closeness`/`betweenness`/`stresscent`/`loadcent`/`graphcent` undirected
  cmodes**: now symmetrize exactly the way R does (first edge of each dyad in
  column-major order wins for valued ties), and do so regardless of `gmode`,
  matching R.
- **`evcent`**: when the power method does not converge (bipartite-type
  structures), SNA.js now falls back to the dense eigen solver and returns
  the correct principal eigenvector instead of R's non-converged iterate.
  This is a *deliberate divergence* from R, which returns garbage with a
  warning. The library no longer writes to `console.warn`.

### Added

- **R golden parity harness**: `scripts/generate-r-snapshots.R` +
  `fixtures/r-sna-2.8/parity.json` + `tests/parity/parity.test.ts` — 207
  cases across 30 function families and 16 corpus graphs, generated by
  executing R `sna` 2.8 (R 4.4.2), replayed in CI on every push.
- Regression tests for every fixed bug and a malformed-input suite.
- `dist/browser.min.js` — minified single-file ESM build for CDN usage
  (`unpkg`/`jsdelivr` fields point at it).
- CI (GitHub Actions): typecheck, tests, build, package-size budget on
  Node 20/22/24.
- Package metadata: `repository`, `author`, `homepage`, `bugs`; committed
  lockfile; `engines: node >= 20`.

### Changed

- `three` moved from `dependencies` to an **optional peer dependency** —
  installing `sna.js` no longer pulls Three.js. Install `three` yourself if
  you use `sna.js/visualization/three`.
- `sna.js/browser` now resolves to the same files as the root entry instead
  of shipping a duplicated 1 MB bundle. Unpacked package size dropped from
  7.5 MB to ~1.6 MB (source maps are no longer published; full sources live
  in the repository).
- `onAttach()` banner derives its version from the build instead of a
  hard-coded string.
- SVG label escaping now also escapes apostrophes.

### Internal

- Repository restored from the distribution snapshot's source maps (45
  TypeScript sources, verified byte-identical across all 8 maps, plus the
  type-only `core/types.ts` reconstructed from the published declarations).
  Export surface (209 symbols) and seeded-RNG streams verified identical to
  the 0.0.0 snapshot before the correctness fixes above were applied.
