import { geodist } from "./geodist";
import { denseGraphToMatrix, makeDenseGraph } from "../core/graph";
import type { GeodistResult, GraphInput, GraphOptions } from "../core/types";

export type ClosenessMode = "directed" | "undirected" | "suminvdir" | "suminvundir" | "gil-schmidt";

export interface ClosenessOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly cmode?: ClosenessMode;
  readonly tmaxdev?: boolean;
  readonly geodistPrecomp?: GeodistResult;
  readonly rescale?: boolean;
}

export function closeness(input: GraphInput, options: ClosenessOptions & { tmaxdev: true }): number;
export function closeness(input: GraphInput, options?: ClosenessOptions & { tmaxdev?: false }): number[];
export function closeness(input: GraphInput, options: ClosenessOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const mode = normalizeClosenessMode(options.cmode ?? "directed", graph.directed);

  if (options.tmaxdev) return theoreticalMaxDeviation(n, mode, graph.directed);

  const useUndirectedGeodesics = mode === "undirected" || mode === "suminvundir";
  const geodistInput = useUndirectedGeodesics ? denseGraphToMatrix(graph, true) : graph;
  const geodistOptions =
    useUndirectedGeodesics
      ? { ...options, mode: "graph" as const, directed: false, countPaths: false as const, predecessors: false as const }
      : options.mode
        ? { ...options, mode: options.mode, directed: graph.directed, countPaths: false as const, predecessors: false as const }
        : { ...options, directed: graph.directed, countPaths: false as const, predecessors: false as const };
  const distances = options.geodistPrecomp
    ? checkedPrecomputedDistances(options.geodistPrecomp, n)
    : geodist(geodistInput, geodistOptions).distances;

  let values = distances.map((row, source) => closenessForRow(row, source, mode, n));
  if (options.rescale) {
    const total = values.reduce((sum, value) => sum + value, 0);
    values = values.map((value) => value / total);
  }

  return selectNodes(values, options.nodes);
}

function normalizeClosenessMode(mode: ClosenessMode, directed: boolean): ClosenessMode {
  if (directed) return mode;
  if (mode === "suminvdir" || mode === "suminvundir") return "suminvundir";
  if (mode === "gil-schmidt") return mode;
  return "undirected";
}

function theoreticalMaxDeviation(n: number, mode: ClosenessMode, directed: boolean): number {
  switch (mode) {
    case "directed":
      return (n - 1) * (1 - 1 / n);
    case "undirected":
      return ((n - 2) * (n - 1)) / (2 * n - 3);
    case "suminvdir":
      return (n - 1) * (n - 1);
    case "suminvundir":
      return n - 1 - n / 2;
    case "gil-schmidt":
      return directed ? n - 1 : (n - 2) / 2;
  }
}

function checkedPrecomputedDistances(precomputed: GeodistResult, order: number): number[][] {
  if (precomputed.distances.length !== order) throw new RangeError("geodistPrecomp order does not match input graph order");
  for (const row of precomputed.distances) {
    if (row.length !== order) throw new RangeError("geodistPrecomp distances must be a square matrix matching input graph order");
  }
  return precomputed.distances;
}

function closenessForRow(row: readonly number[], source: number, mode: ClosenessMode, order: number): number {
  let distanceSum = 0;
  let inverseDistanceSum = 0;
  let reachable = 0;

  for (let target = 0; target < order; target += 1) {
    if (target === source) continue;
    const distance = row[target] ?? Number.POSITIVE_INFINITY;
    distanceSum += distance;
    inverseDistanceSum += 1 / distance;
    if (distance < Number.POSITIVE_INFINITY) reachable += 1;
  }

  switch (mode) {
    case "directed":
    case "undirected":
      return (order - 1) / distanceSum;
    case "suminvdir":
    case "suminvundir":
      return inverseDistanceSum / (order - 1);
    case "gil-schmidt":
      return reachable === 0 ? 0 : inverseDistanceSum / reachable;
  }
}

function selectNodes(values: readonly number[], nodes: readonly number[] | undefined): number[] {
  if (!nodes) return [...values];
  return nodes.map((node) => {
    if (!Number.isInteger(node) || node < 0 || node >= values.length) throw new RangeError("node is outside graph order");
    return values[node]!;
  });
}
