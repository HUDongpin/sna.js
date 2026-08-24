# Modern sparse API

SNA.js 0.5.0 keeps the R `sna`-compatible root entry unchanged and adds five opt-in modern families plus an aggregate entry:

```ts
import { createGraph, makeSparseGraph } from "@peterhudongpin/sna.js/graph";
import { pageRank } from "@peterhudongpin/sna.js/centrality";
import { clusteringCoefficient } from "@peterhudongpin/sna.js/statistics";
import { louvain } from "@peterhudongpin/sna.js/community";
import { jaccardCoefficient } from "@peterhudongpin/sna.js/prediction";

// Or import every modern family from:
// import { createGraph, pageRank, louvain } from "@peterhudongpin/sna.js/modern";
```

None of these functions is re-exported from the legacy package root. This keeps the old runtime export surface and root bundle stable.

## Graph boundary

The public property-graph form is:

```ts
type NodeId = string | number;
type GraphAttribute = string | number | boolean | null;

interface GraphData<Id extends NodeId = NodeId> {
  directed: boolean;
  nodes: ReadonlyArray<{
    id: Id;
    attributes?: Readonly<Record<string, GraphAttribute>>;
  }>;
  edges: ReadonlyArray<{
    source: Id;
    target: Id;
    weight?: number; // default 1
    attributes?: Readonly<Record<string, GraphAttribute>>;
  }>;
  attributes?: Readonly<Record<string, GraphAttribute>>;
}
```

`createGraph(data)` and `makeSparseGraph(input)` build a stable-node-order `SparseGraph`. It stores outgoing CSR and incoming CSC arrays, logical edge arrays, IDs, and attributes in `O(n + m)` space. It never creates an `n × n` matrix for `GraphData` or a legacy edge-list input.

`SparseGraph<Id>` preserves the input ID union in TypeScript. Its compact typed arrays are exposed through read-only declaration views; mutating their underlying JavaScript storage via casts or reflective APIs is unsupported, and any externally supplied sparse graph is fully revalidated before reuse. This keeps the representation structured-clone-safe without replacing typed arrays with proxy objects.

Validation is strict:

- Node IDs are finite numbers or strings and must be unique. Numeric `1` and string `"1"` remain different IDs.
- Every edge endpoint must be declared in `nodes`.
- Weights and numeric attributes must be finite.
- Attributes must be JSON scalar values; nested objects, arrays, `undefined`, `NaN`, and infinities are rejected.
- Parallel logical edges are rejected by default. Pass `duplicateEdges: "sum" | "max" | "first" | "last"` to resolve them explicitly.
- Self-loops are preserved by default. Pass `loops: false` to drop them at the graph boundary.
- External `SparseGraph` objects are revalidated against their logical edges, CSR, and CSC before reuse.

Modern APIs also accept legacy matrices, numeric edge-list objects, and legacy `DenseGraph` values. Their node IDs become `0..n-1`. `toLegacyEdgeList()` performs the reverse numeric conversion; it necessarily loses original IDs and attributes, so use the returned sparse graph's `nodeIds[index]` mapping when identity matters.

SNA.js 0.5.0 represents one simple directed or simple undirected graph. It does not infer mixed, multigraph, signed, temporal, multilayer, or multiplex semantics from ordinary attributes.

## Weight semantics

Modern algorithms do not reuse the legacy `ignoreEval` option. Each result reports its interpretation in `meta.valueSemantics`:

| Semantics | Meaning | Examples |
|---|---|---|
| `binary` | Only adjacency is used. | Unweighted clustering, link prediction, unweighted Girvan–Newman. |
| `strength` | A larger value means a stronger relationship. | PageRank, HITS, weighted clustering, modularity, Louvain, Leiden, Infomap. |
| `distance` | A larger value means a longer path. | Girvan–Newman with `useWeights: true`. |

PageRank, HITS, community strength algorithms, and weighted statistics reject negative or non-finite strengths. Weighted harmonic centrality treats an edge strength `s > 0` as path length `1 / s`; zero-strength arcs are not traversed. Weighted Girvan–Newman requires strictly positive distances.

## Result contracts

All modern results are JSON-safe and structured-clone-safe. IDs and values use parallel arrays so numeric and string IDs cannot collide as object keys.

```ts
interface AnalysisMeta {
  algorithm: string;
  directed: boolean;
  weighted: boolean;
  valueSemantics: "binary" | "strength" | "distance";
  exact: boolean;
  warnings: readonly string[];
  approximate?: boolean;
  converged?: boolean;
  iterations?: number;
  partial?: boolean;
  seed?: string | number;
}

interface NodeScoreResult {
  nodes: readonly NodeId[];
  values: readonly (number | null)[];
  meta: AnalysisMeta;
}

interface PartitionResult {
  nodes: readonly NodeId[];
  membership: readonly number[];
  communities: ReadonlyArray<ReadonlyArray<NodeId>>;
  quality: {
    modularity?: number;
    cpm?: number;
    codeLength?: number;
    coverage?: number;
    performance?: number;
  };
  meta: AnalysisMeta;
}
```

Undefined mathematical statistics use `null`, not `NaN`, with a warning in metadata. Community IDs are canonicalized by the smallest input node index in each community. Given the same graph, options, and seed, randomized partition JSON is stable.

## Centrality

### `pageRank(input, options?)`

- Damping defaults to `0.85`.
- `personalization` and `dangling` accept a node-order vector, `ReadonlyMap<NodeId, number>`, or `[NodeId, weight][]`.
- `weighted` defaults to `true` (strength); `false` uses binary arcs.
- Iteration defaults are exposed through `tolerance` and `maxIterations`.
- Non-convergence throws `ConvergenceError`. With `allowPartial: true`, it returns the last iterate with `meta.partial=true` and a warning.

### `hits(input, options?)`

HITS uses CSR and CSC directly, returns parallel `hubs` and `authorities`, and has the same strength, convergence, partial-result, progress, and cancellation rules as PageRank.

### `harmonicCentrality(input, options?)`

`direction: "out" | "in"` selects directed reachability. `weighted: true` uses inverse-strength Dijkstra; `false` uses BFS hop distance. `normalized: true` divides by `n - 1`.

## Statistics

The `statistics` entry exports:

- `triangles`, `clusteringCoefficient`, and `averageClustering`;
- `degreeAssortativity`, `categoricalAssortativity`, and `numericAssortativity`;
- `degreeMixingMatrix` and `attributeMixingMatrix`;
- Burt `constraint` and `effectiveSize`.

Undirected weighted clustering uses the normalized Onnela geometric-mean definition; directed clustering uses a Fagiolo-style definition. Degree assortativity defaults to `total/total` for undirected graphs and `out/in` for directed graphs. Use `source` and `target` to request `in`, `out`, or `total`; `x` and `y` remain compatibility aliases.

Mixing matrices default to normalized probabilities. Degree labels are numeric and ascending; categorical labels follow first node appearance. Structural-hole functions use the predecessor/successor union on directed graphs. Isolates produce `null` plus a metadata warning.

## Community detection

The `community` entry exports partition validation and quality functions alongside the algorithms below.

| Function | Boundary |
|---|---|
| `greedyModularity` | Undirected; exact evaluation of each candidate merge, but the merge search is a heuristic. |
| `louvain` | Directed/undirected, non-negative strength, `resolution`, `threshold`, `maxLevels`, `maxPasses`, and `seed`/`rng`. |
| `leiden` | Undirected, non-negative strength, `modularity` or `cpm`, `resolution`, `beta`, outer `iterations`, and seed. This is the disclosed restricted implementation below. |
| `infomap` | Directed/undirected, non-negative flow strength, recorded teleportation for directed graphs, actual seeded `trials`, and two-level code length. |
| `girvanNewman` | Undirected; requires `maxCommunities` or `levels`; intended for small graphs. |
| `labelPropagation` | Seeded modern property-graph adapter; directed graphs use a weak weighted view. |
| `kCliqueCommunities` | Undirected overlapping cover; explicit `k`; `maxCliques` bounds exponential enumeration. |

`leiden()` implements local moving, connectivity-preserving refinement, and refined aggregation. It guarantees connected returned communities, but it omits the full gamma-density admissibility condition and therefore does not claim the reference algorithm's subset-optimality theorem. Its metadata says `leiden-restricted`.

`infomap()` is a seeded two-level greedy map-equation optimizer, not hierarchical Infomap. It does not support Markov time, multilayer networks, or unrecorded teleportation. Its metadata says `infomap-two-level-greedy`, records the total optimization passes, and warns which trial won.

Those names and warnings are deliberate scientific boundaries, not cosmetic caveats. See the [capability matrix](./CAPABILITY_MATRIX.md).

## Link prediction

`commonNeighbors`, `jaccardCoefficient`, `adamicAdar`, `resourceAllocation`, and `preferentialAttachment` accept only an undirected simple graph and a required list of candidate pairs:

```ts
const scores = jaccardCoefficient(graph, [
  ["Ada", "Sam"],
  ["Ada", "Bo"],
]);
// { pairs: [{ source, target, score }, ...], meta }
```

The pair order is preserved. SNA.js does not silently enumerate every non-edge, which prevents an accidental `O(n²)` output. The 0.5.0 scores are binary/topological even if the input carries edge weights.
All five functions accept an optional third `{ signal, onProgress }` argument. The Worker batch runner forwards those hooks and reports one completed unit per candidate pair; client-side abort still terminates the Worker immediately.

## Worker protocol

The existing `worker` entry retains its runtime exports and generic `run<T>()` overload. `SnaTaskMap` adds inferred modern calls:

```ts
import { createSnaWorker } from "@peterhudongpin/sna.js/worker";

const client = createSnaWorker(
  () => new Worker(workerUrl, { type: "module" }),
);

const rank = await client.run("pageRank", { input: graph }, { damping: 0.85 });
const partition = await client.run("louvain", { input: graph }, { seed: 17 });
const predicted = await client.run("linkPrediction", {
  input: graph,
  pairs: [["Ada", "Sam"]],
  method: "jaccardCoefficient",
});
```

Modern Worker tasks are `pageRank`, `hits`, `louvain`, `leiden`, `infomap`, bounded `girvanNewman`, and batched `linkPrediction`. Cancellation terminates the busy Worker and a subsequent call creates a fresh Worker. Progress callbacks stay on the client side and are not structured-cloned.

## Complexity and size guards

| Operation | Storage | Typical time characteristic |
|---|---:|---|
| `makeSparseGraph(GraphData)` | `O(n + m)` | `O(n + m)` plus duplicate validation. |
| PageRank / HITS | `O(n + m)` | `O(iterations × (n + m))`. |
| Harmonic centrality | `O(n + m)` working graph | One BFS/Dijkstra per source. |
| Triangles / clustering | Sparse adjacency sets/maps | Degree- and triangle-dependent. |
| Louvain / restricted Leiden / two-level Infomap | `O(n + m)` graph storage | Heuristic, data- and convergence-dependent. |
| Girvan–Newman | Sparse graph plus betweenness state | Recomputes edge betweenness after removals; small graphs only. |
| k-clique percolation | Clique-dependent | Exponential worst case; guarded by `maxCliques`. |
| Link prediction | Sparse neighborhoods plus explicit pairs | Proportional to the supplied pair list and neighborhood intersections. |

The modern sparse boundary has no arbitrary order cap. The legacy dense boundary still guards orders above 5,000 because that representation allocates `O(n²)` memory.

## Algorithm references and validation oracles

Implementations are native TypeScript with zero production dependencies. Formula and boundary checks use pinned NetworkX 3.6.1 and python-igraph 1.0.0 development fixtures; those libraries are not bundled or used at runtime.

| Family | Primary reference |
|---|---|
| PageRank | Brin & Page (1998), [doi:10.1016/S0169-7552(98)00110-X](https://doi.org/10.1016/S0169-7552(98)00110-X). |
| HITS | Kleinberg (1999), [doi:10.1145/324133.324140](https://doi.org/10.1145/324133.324140). |
| Assortativity | Newman (2003), [doi:10.1103/PhysRevE.67.026126](https://doi.org/10.1103/PhysRevE.67.026126). |
| Weighted/directed clustering | Onnela et al. (2005), [doi:10.1103/PhysRevE.71.065103](https://doi.org/10.1103/PhysRevE.71.065103); Fagiolo (2007), [doi:10.1103/PhysRevE.76.026107](https://doi.org/10.1103/PhysRevE.76.026107). |
| Structural holes | Burt (1992), *Structural Holes: The Social Structure of Competition*. |
| Louvain | Blondel et al. (2008), [doi:10.1088/1742-5468/2008/10/P10008](https://doi.org/10.1088/1742-5468/2008/10/P10008). |
| Leiden | Traag, Waltman & van Eck (2019), [doi:10.1038/s41598-019-41695-z](https://doi.org/10.1038/s41598-019-41695-z). |
| Infomap | Rosvall & Bergstrom (2008), [doi:10.1073/pnas.0706851105](https://doi.org/10.1073/pnas.0706851105). |
| Girvan–Newman | Girvan & Newman (2002), [doi:10.1073/pnas.122653799](https://doi.org/10.1073/pnas.122653799). |
| k-clique percolation | Palla et al. (2005), [doi:10.1038/nature03607](https://doi.org/10.1038/nature03607). |
| Adamic–Adar | Adamic & Adar (2003), [doi:10.1016/S0378-8733(03)00009-1](https://doi.org/10.1016/S0378-8733(03)00009-1). |

The precise cross-library provenance, version lock, corpus hash, convention exceptions, and regeneration commands are recorded in `fixtures/modern/README.md` and `fixtures/modern/oracles.json`. Randomized community membership is invariant-tested rather than falsely claimed as exact cross-library parity.

## Reproducible package example

`npm run example:resilience` regenerates a deterministic public analysis from `examples/data/programming-resilience.synthetic.csv`. It writes one JSON analysis and two static SVGs to `examples/generated/`. The committed dataset is fully synthetic; the generator never reads or fits the private acceptance workbook.
