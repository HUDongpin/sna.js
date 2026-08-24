# SNA.js roadmap

The roadmap is ordered by data-model dependencies. It is not a promise that every item lands in the next release.

## 0.5.0: current scope

- Preserve the complete legacy root API and R `sna` parity baseline.
- Add the CSR/CSC property-graph boundary and separate modern subpaths.
- Add PageRank, HITS, harmonic centrality, clustering/mixing/assortativity, Burt structural holes, explicit-pair link prediction, and the bounded community suite.
- Add typed Worker tasks, reproducible synthetic survey analysis, Chromium/package-consumer gates, and trusted-publishing release controls.
- Keep restricted Leiden and two-level Infomap visibly experimental; do not represent them as full reference implementations.

## 0.6 candidates: sparse graph breadth and full community references

- Sparse connectivity facade: connected, weakly connected, and strongly connected components with modern result metadata.
- Sampled node/edge betweenness with explicit `sampleSize`, seed, and exact/approximate metadata.
- Bipartite validation and explicitly weighted one-mode projections.
- Graphology read-only adapter that preserves node identity without replacing the legacy dense kernel.
- Browser-safe CSV/TSV edge-list round trips and carefully scoped GraphML/GEXF string parsers/writers.
- Full Leiden refinement admissibility and reference-quality guarantees.
- Hierarchical Infomap and a broader map-equation option surface.

## Later research releases

- Signed-network statistics, balance, and signed community detection.
- Temporal event/spell data, slicing/aggregation, and time-respecting paths.
- Overlapping label propagation, link communities, Walktrap, and spinglass where licensing and numerical validation are clear.
- Motif significance beyond existing dyad/triad/path/cycle/clique censuses, with explicit size guards.
- Advanced shortest paths (Bellman–Ford, Johnson, A*) only after negative-distance semantics are designed.
- Stochastic block-model fitting with convergence and model-diagnostic contracts.

## Separate packages or add-ons

ERGM, TERGM, relational-event models, and multilayer/multiplex networks need data models and scientific diagnostics that do not fit a simple-graph compatibility release. They should be evaluated as separately versioned add-ons rather than incomplete functions in the core package.

## Explicitly not planned as 0.5.x patch work

- A website, dashboard, hosted analysis service, or online graph editor.
- Silent parallel-edge aggregation or mixed-graph coercion.
- GPU/WASM acceleration before CPU sparse correctness and reproducible benchmarks are stable.
- Performance promises above the measured benchmark tiers.
