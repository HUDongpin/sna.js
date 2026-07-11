// Ported from R sna 2.8: R/nli.R `graphcent`.
import { makeDenseGraph } from "../core/graph";
import type { DenseGraph, GeodistResult, GraphInput, GraphOptions } from "../core/types";
import { symmetrizeForUndirectedGeodesics } from "./pathCentrality";

export type GraphCentralityMode = "directed" | "undirected";

export interface GraphCentralityOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly cmode?: GraphCentralityMode;
  readonly tmaxdev?: boolean;
  readonly geodistPrecomp?: GeodistResult;
  readonly rescale?: boolean;
}

interface AdjacentEdge {
  readonly target: number;
  readonly weight: number;
}

export function graphcent(input: GraphInput, options: GraphCentralityOptions & { tmaxdev: true }): number;
export function graphcent(input: GraphInput, options?: GraphCentralityOptions & { tmaxdev?: false }): number[];
export function graphcent(input: GraphInput, options: GraphCentralityOptions = {}): number | number[] {
  const baseGraph = makeDenseGraph(input, options);
  const mode = normalizeMode(options.cmode ?? "directed", baseGraph.directed);
  const n = baseGraph.order;

  if (options.tmaxdev) return mode === "undirected" ? (n - 1) / 2 : (n - 1) * (1 - 1 / n);

  const graph = mode === "undirected" ? symmetrizeForUndirectedGeodesics(baseGraph) : baseGraph;
  const distances = options.geodistPrecomp ? checkedPrecomputedDistances(options.geodistPrecomp, graph.order) : allPairsDistances(graph, options.ignoreEval ?? true);
  let values = distances.map((row) => {
    const eccentricity = row.reduce((maximum, distance) => Math.max(maximum, distance), 0);
    return 1 / eccentricity;
  });

  if (options.rescale) {
    const total = values.reduce((sum, value) => sum + value, 0);
    values = values.map((value) => value / total);
  }

  return selectNodes(values, options.nodes);
}

function normalizeMode(mode: GraphCentralityMode, directed: boolean): GraphCentralityMode {
  return directed ? mode : "undirected";
}

function checkedPrecomputedDistances(precomputed: GeodistResult, order: number): number[][] {
  if (precomputed.distances.length !== order) throw new RangeError("geodistPrecomp order does not match input graph order");
  for (const row of precomputed.distances) {
    if (row.length !== order) throw new RangeError("geodistPrecomp distances must be a square matrix matching input graph order");
  }
  return precomputed.distances;
}

function allPairsDistances(graph: DenseGraph, ignoreEval: boolean): number[][] {
  const adjacency = buildAdjacencyLists(graph, ignoreEval);
  return Array.from({ length: graph.order }, (_, source) =>
    ignoreEval ? unweightedDistances(graph.order, adjacency, source) : weightedDistances(graph.order, adjacency, source),
  );
}

function buildAdjacencyLists(graph: DenseGraph, ignoreEval: boolean): AdjacentEdge[][] {
  const out: AdjacentEdge[][] = Array.from({ length: graph.order }, () => []);
  for (let tail = 0; tail < graph.order; tail += 1) {
    for (let head = 0; head < graph.order; head += 1) {
      if (!graph.adjacency[tail * graph.order + head]) continue;
      const weight = ignoreEval ? 1 : graph.weights[tail * graph.order + head]!;
      if (weight < 0) throw new RangeError("negative edge values are not supported for weighted graphcent");
      if (weight === 0) continue;
      out[tail]!.push({ target: head, weight });
    }
  }
  return out;
}

function unweightedDistances(n: number, adjacency: readonly AdjacentEdge[][], source: number): number[] {
  const distances = Array.from({ length: n }, () => Number.POSITIVE_INFINITY);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  distances[source] = 0;
  queue[tail] = source;
  tail += 1;

  while (head < tail) {
    const vertex = queue[head]!;
    head += 1;
    const nextDistance = distances[vertex]! + 1;
    for (const edge of adjacency[vertex]!) {
      if (distances[edge.target] !== Number.POSITIVE_INFINITY) continue;
      distances[edge.target] = nextDistance;
      queue[tail] = edge.target;
      tail += 1;
    }
  }

  return distances;
}

function weightedDistances(n: number, adjacency: readonly AdjacentEdge[][], source: number): number[] {
  const distances = Array.from({ length: n }, () => Number.POSITIVE_INFINITY);
  const visited = new Uint8Array(n);
  distances[source] = 0;

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
    for (const edge of adjacency[vertex]!) {
      const candidateDistance = distances[vertex]! + edge.weight;
      if (candidateDistance < distances[edge.target]!) distances[edge.target] = candidateDistance;
    }
  }

  return distances;
}

function selectNodes(values: readonly number[], nodes: readonly number[] | undefined): number[] {
  if (!nodes) return [...values];
  return nodes.map((node) => {
    if (!Number.isInteger(node) || node < 0 || node >= values.length) throw new RangeError("node is outside graph order");
    return values[node]!;
  });
}
