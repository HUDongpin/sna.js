import { denseGraphToMatrix, makeDenseGraph } from "../core/graph";
import type { DenseGraph, GeodistResult, GraphInput, GraphOptions } from "../core/types";

export type PathCentralityMeasure =
  | "standard"
  | "endpoints"
  | "proximalsrc"
  | "proximaltar"
  | "proximalsum"
  | "lengthscaled"
  | "linearscaled"
  | "stress"
  | "load";

export interface PathCentralityOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly geodistPrecomp?: GeodistResult;
  readonly rescale?: boolean;
}

export interface PathCentralityComputeOptions extends PathCentralityOptions {
  readonly measure: PathCentralityMeasure;
  readonly undirectedGeodesics?: boolean;
  readonly transposeDirected?: boolean;
  readonly divideByTwo?: boolean;
  readonly weightedErrorLabel?: string;
}

interface SourcePaths {
  readonly distances: number[];
  readonly sigma: number[];
  readonly predecessors: number[][];
  readonly stack: number[];
  readonly reachableCount: number;
}

interface AdjacentEdge {
  readonly target: number;
  readonly weight: number;
}

const EPSILON = 1e-12;

export function pathCentralityScores(input: GraphInput, options: PathCentralityComputeOptions): number[] {
  const baseGraph = makeDenseGraph(input, options);
  let graph =
    options.undirectedGeodesics && baseGraph.directed
      ? makeDenseGraph(denseGraphToMatrix(baseGraph, true), { ...options, mode: "graph", directed: false })
      : baseGraph;
  if (options.transposeDirected && graph.directed) graph = transposeDenseGraph(graph);

  const adjacency = buildAdjacencyLists(graph, options.ignoreEval ?? true, options.weightedErrorLabel ?? "path centrality");
  const precomputed = normalizePrecomputed(options.geodistPrecomp, graph.order);
  const scores = Array.from({ length: graph.order }, () => 0);

  for (let source = 0; source < graph.order; source += 1) {
    const paths = precomputed ? sourcePathsFromPrecomputed(precomputed, source) : singleSourcePaths(graph.order, adjacency, source, options.ignoreEval ?? true);
    accumulatePathCentrality(scores, paths, source, options.measure);
  }

  let values = options.divideByTwo ? scores.map((score) => score / 2) : scores;
  if (options.rescale) {
    const total = values.reduce((sum, value) => sum + value, 0);
    values = values.map((value) => value / total);
  }

  return selectNodes(values, options.nodes);
}

export function selectNodes(values: readonly number[], nodes: readonly number[] | undefined): number[] {
  if (!nodes) return [...values];
  return nodes.map((node) => {
    if (!Number.isInteger(node) || node < 0 || node >= values.length) throw new RangeError("node is outside graph order");
    return values[node]!;
  });
}

function buildAdjacencyLists(graph: DenseGraph, ignoreEval: boolean, label: string): AdjacentEdge[][] {
  const out: AdjacentEdge[][] = Array.from({ length: graph.order }, () => []);

  for (let tail = 0; tail < graph.order; tail += 1) {
    for (let head = 0; head < graph.order; head += 1) {
      if (!graph.adjacency[tail * graph.order + head]) continue;
      const weight = ignoreEval ? 1 : graph.weights[tail * graph.order + head]!;
      if (weight < 0) throw new RangeError(`negative edge values are not supported for weighted ${label}`);
      if (weight === 0) continue;
      out[tail]!.push({ target: head, weight });
    }
  }

  return out;
}

function singleSourcePaths(n: number, adjacency: readonly AdjacentEdge[][], source: number, ignoreEval: boolean): SourcePaths {
  return ignoreEval ? unweightedSingleSourcePaths(n, adjacency, source) : weightedSingleSourcePaths(n, adjacency, source);
}

function unweightedSingleSourcePaths(n: number, adjacency: readonly AdjacentEdge[][], source: number): SourcePaths {
  const distances = Array.from({ length: n }, () => Number.POSITIVE_INFINITY);
  const sigma = Array.from({ length: n }, () => 0);
  const predecessors = Array.from({ length: n }, () => [] as number[]);
  const stack: number[] = [];
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  distances[source] = 0;
  sigma[source] = 1;
  queue[tail] = source;
  tail += 1;

  while (head < tail) {
    const vertex = queue[head]!;
    head += 1;
    stack.push(vertex);
    const nextDistance = distances[vertex]! + 1;

    for (const edge of adjacency[vertex]!) {
      const target = edge.target;
      if (distances[target] === Number.POSITIVE_INFINITY) {
        distances[target] = nextDistance;
        queue[tail] = target;
        tail += 1;
      }
      if (distances[target] === nextDistance) {
        sigma[target] = sigma[target]! + sigma[vertex]!;
        predecessors[target]!.push(vertex);
      }
    }
  }

  return { distances, sigma, predecessors, stack, reachableCount: stack.length };
}

function weightedSingleSourcePaths(n: number, adjacency: readonly AdjacentEdge[][], source: number): SourcePaths {
  const distances = Array.from({ length: n }, () => Number.POSITIVE_INFINITY);
  const sigma = Array.from({ length: n }, () => 0);
  const predecessors = Array.from({ length: n }, () => [] as number[]);
  const visited = new Uint8Array(n);
  const stack: number[] = [];

  distances[source] = 0;
  sigma[source] = 1;

  while (true) {
    let vertex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < n; candidate += 1) {
      if (!visited[candidate] && distances[candidate]! < bestDistance) {
        vertex = candidate;
        bestDistance = distances[candidate]!;
      }
    }
    if (vertex === -1) break;

    visited[vertex] = 1;
    stack.push(vertex);

    for (const edge of adjacency[vertex]!) {
      const target = edge.target;
      const candidateDistance = distances[vertex]! + edge.weight;
      if (candidateDistance + EPSILON < distances[target]!) {
        distances[target] = candidateDistance;
        sigma[target] = sigma[vertex]!;
        predecessors[target] = [vertex];
      } else if (Math.abs(candidateDistance - distances[target]!) <= EPSILON) {
        sigma[target] = sigma[target]! + sigma[vertex]!;
        predecessors[target]!.push(vertex);
      }
    }
  }

  return { distances, sigma, predecessors, stack, reachableCount: stack.length };
}

function normalizePrecomputed(precomputed: GeodistResult | undefined, order: number): GeodistResult | undefined {
  if (!precomputed?.predecessors) return undefined;
  if (precomputed.distances.length !== order || precomputed.counts.length !== order || precomputed.predecessors.length !== order) {
    throw new RangeError("geodistPrecomp order does not match input graph order");
  }
  return precomputed;
}

function sourcePathsFromPrecomputed(precomputed: GeodistResult, source: number): SourcePaths {
  const distances = [...precomputed.distances[source]!];
  const sigma = [...precomputed.counts[source]!];
  const predecessors = precomputed.predecessors![source]!.map((entry) => [...entry]);
  const stack = distances
    .map((distance, vertex) => ({ distance, vertex }))
    .filter(({ distance }) => distance < Number.POSITIVE_INFINITY)
    .sort((a, b) => a.distance - b.distance || a.vertex - b.vertex)
    .map(({ vertex }) => vertex);

  return { distances, sigma, predecessors, stack, reachableCount: stack.length };
}

function accumulatePathCentrality(scores: number[], paths: SourcePaths, source: number, measure: PathCentralityMeasure): void {
  const delta: number[] = Array.from({ length: scores.length }, () => (measure === "load" ? 1 : 0));
  if (measure === "endpoints") scores[source] = scores[source]! + paths.reachableCount - 1;

  for (let cursor = paths.stack.length - 1; cursor >= 0; cursor -= 1) {
    const vertex = paths.stack[cursor]!;
    switch (measure) {
      case "proximalsrc":
        for (const predecessor of paths.predecessors[vertex]!) {
          if (predecessor !== source) scores[predecessor] = scores[predecessor]! + paths.sigma[predecessor]! / paths.sigma[vertex]!;
        }
        break;
      case "proximaltar":
        for (const predecessor of paths.predecessors[vertex]!) {
          delta[predecessor] = delta[predecessor]! + (paths.sigma[predecessor]! / paths.sigma[vertex]!) * (1 + delta[vertex]!);
          if (predecessor === source) scores[vertex] = scores[vertex]! + delta[vertex]!;
        }
        break;
      case "proximalsum":
        for (const predecessor of paths.predecessors[vertex]!) {
          delta[predecessor] = delta[predecessor]! + (paths.sigma[predecessor]! / paths.sigma[vertex]!) * (1 + delta[vertex]!);
          if (predecessor !== source) scores[predecessor] = scores[predecessor]! + paths.sigma[predecessor]! / paths.sigma[vertex]!;
          else scores[vertex] = scores[vertex]! + delta[vertex]!;
        }
        break;
      case "lengthscaled":
        for (const predecessor of paths.predecessors[vertex]!) {
          delta[predecessor] = delta[predecessor]! + (paths.sigma[predecessor]! / paths.sigma[vertex]!) * (1 / paths.distances[vertex]! + delta[vertex]!);
        }
        if (source !== vertex) scores[vertex] = scores[vertex]! + delta[vertex]!;
        break;
      case "linearscaled":
        for (const predecessor of paths.predecessors[vertex]!) {
          delta[predecessor] = delta[predecessor]! + (paths.sigma[predecessor]! / paths.sigma[vertex]!) * (1 / paths.distances[vertex]! + delta[vertex]!);
        }
        if (source !== vertex) scores[vertex] = scores[vertex]! + paths.distances[vertex]! * delta[vertex]!;
        break;
      case "endpoints":
        accumulateStandardDelta(delta, paths, vertex);
        if (source !== vertex) scores[vertex] = scores[vertex]! + delta[vertex]! + 1;
        break;
      case "stress":
        for (const predecessor of paths.predecessors[vertex]!) delta[predecessor] = delta[predecessor]! + 1 + delta[vertex]!;
        if (source !== vertex) scores[vertex] = scores[vertex]! + paths.sigma[vertex]! * delta[vertex]!;
        break;
      case "load": {
        const predecessorCount = paths.predecessors[vertex]!.length;
        if (predecessorCount > 0) {
          for (const predecessor of paths.predecessors[vertex]!) delta[predecessor] = delta[predecessor]! + delta[vertex]! / predecessorCount;
        }
        scores[vertex] = scores[vertex]! + delta[vertex]!;
        break;
      }
      case "standard":
        accumulateStandardDelta(delta, paths, vertex);
        if (source !== vertex) scores[vertex] = scores[vertex]! + delta[vertex]!;
        break;
    }
  }
}

function accumulateStandardDelta(delta: number[], paths: SourcePaths, vertex: number): void {
  for (const predecessor of paths.predecessors[vertex]!) {
    delta[predecessor] = delta[predecessor]! + (paths.sigma[predecessor]! / paths.sigma[vertex]!) * (1 + delta[vertex]!);
  }
}

function transposeDenseGraph(graph: DenseGraph): DenseGraph {
  const n = graph.order;
  const weights = new Float64Array(n * n);
  const adjacency = new Uint8Array(n * n);
  const missing = graph.missing ? new Uint8Array(n * n) : undefined;
  for (let tail = 0; tail < n; tail += 1) {
    for (let head = 0; head < n; head += 1) {
      weights[head * n + tail] = graph.weights[tail * n + head]!;
      adjacency[head * n + tail] = graph.adjacency[tail * n + head]!;
      if (missing) missing[head * n + tail] = graph.missing![tail * n + head]!;
    }
  }
  return missing
    ? { kind: "dense", order: n, directed: graph.directed, loops: graph.loops, weights, adjacency, missing }
    : { kind: "dense", order: n, directed: graph.directed, loops: graph.loops, weights, adjacency };
}
