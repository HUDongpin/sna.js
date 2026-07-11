import { evcent } from "./evcent";
import { geodist } from "./geodist";
import { reachability } from "./connectivity";
import { denseGraphToMatrix, makeDenseGraph } from "../core/graph";
import type { DenseGraph, GraphInput, GraphOptions } from "../core/types";
import { makeStochastic } from "./dataprep";
import type { RandomOptions } from "../core/random";

export type PrestigeMode =
  | "indegree"
  | "indegree.rownorm"
  | "indegree.rowcolnorm"
  | "eigenvector"
  | "eigenvector.rownorm"
  | "eigenvector.colnorm"
  | "eigenvector.rowcolnorm"
  | "domain"
  | "domain.proximity";

export interface PrestigeOptions extends GraphOptions, RandomOptions {
  readonly nodes?: readonly number[];
  readonly cmode?: PrestigeMode;
  readonly tmaxdev?: boolean;
  readonly rescale?: boolean;
  readonly tol?: number;
}

export function prestige(input: GraphInput, options: PrestigeOptions & { tmaxdev: true }): number;
export function prestige(input: GraphInput, options?: PrestigeOptions & { tmaxdev?: false }): number[];
export function prestige(input: GraphInput, options: PrestigeOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, options);
  const mode = options.cmode ?? "indegree";

  if (options.tmaxdev) return theoreticalMaxDeviation(graph.order, mode, options);

  let values: number[];
  switch (mode) {
    case "indegree":
      values = indegree(graph);
      break;
    case "indegree.rownorm":
      values = indegreeFromMatrix(makePrestigeStochastic(graph, "row", options));
      break;
    case "indegree.rowcolnorm":
      values = indegreeFromMatrix(makePrestigeStochastic(graph, "rowcol", options));
      break;
    case "eigenvector":
      values = eigenvectorPrestige(denseGraphToMatrix(graph, true), graph.loops);
      break;
    case "eigenvector.rownorm":
      values = eigenvectorPrestige(makePrestigeStochastic(graph, "row", options), true);
      break;
    case "eigenvector.colnorm":
      values = eigenvectorPrestige(makePrestigeStochastic(graph, "col", options), true);
      break;
    case "eigenvector.rowcolnorm":
      values = eigenvectorPrestige(makePrestigeStochastic(graph, "rowcol", options), true);
      break;
    case "domain":
      values = domainPrestige(graph);
      break;
    case "domain.proximity":
      values = domainProximityPrestige(graph);
      break;
    default:
      throw new RangeError(`Unknown prestige cmode: ${mode satisfies never}`);
  }

  if (options.rescale) {
    const total = values.reduce((sum, value) => sum + value, 0);
    values = values.map((value) => value / total);
  }

  return selectNodes(values, options.nodes);
}

function theoreticalMaxDeviation(n: number, mode: PrestigeMode, options: PrestigeOptions): number {
  switch (mode) {
    case "indegree":
    case "indegree.rownorm":
    case "indegree.rowcolnorm":
      return isGraphMode(options) ? (n - 1) * (n - 2 + (options.diag ? 1 : 0)) : (n - 1) * (n - 1 + (options.diag ? 1 : 0));
    case "eigenvector":
    case "eigenvector.rownorm":
    case "eigenvector.colnorm":
    case "eigenvector.rowcolnorm":
      return isGraphMode(options) ? (Math.SQRT2 / 2) * (n - 2) : n - 1;
    case "domain":
    case "domain.proximity":
      return (n - 1) * (n - 1);
  }
}

function isGraphMode(options: PrestigeOptions): boolean {
  return options.mode === "graph" || options.directed === false;
}

function indegree(graph: DenseGraph): number[] {
  return indegreeFromMatrix(denseGraphToMatrix(graph, true));
}

function indegreeFromMatrix(matrix: readonly (readonly number[])[]): number[] {
  const n = matrix.length;
  const out = Array.from({ length: n }, () => 0);
  for (let tail = 0; tail < n; tail += 1) {
    for (let head = 0; head < n; head += 1) {
      out[head] = out[head]! + (matrix[tail]![head] ?? 0);
    }
  }
  return out;
}

function makePrestigeStochastic(graph: DenseGraph, mode: "row" | "col" | "rowcol", options: PrestigeOptions): number[][] {
  const stochasticOptions: { mode: "row" | "col" | "rowcol"; seed?: number | string; rng?: () => number } = { mode };
  if (options.seed !== undefined) stochasticOptions.seed = options.seed;
  if (options.rng !== undefined) stochasticOptions.rng = options.rng;
  return makeStochastic(denseGraphToMatrix(graph, true), stochasticOptions) as number[][];
}

function eigenvectorPrestige(matrix: readonly (readonly number[])[], diag: boolean): number[] {
  return evcent(transpose(matrix), { diag, ignoreEval: false });
}

function domainPrestige(graph: DenseGraph): number[] {
  const reach = reachability(graph);
  return reach[0] ? reach[0].map((_, target) => reach.reduce((sum, row) => sum + (row[target] ?? 0), 0) - 1) : [];
}

function domainProximityPrestige(graph: DenseGraph): number[] {
  const distances = geodist(graph, { countPaths: true }).distances;
  const n = graph.order;
  const out = Array.from({ length: n }, () => 0);

  for (let target = 0; target < n; target += 1) {
    let reachable = 0;
    let distanceSum = 0;
    for (let source = 0; source < n; source += 1) {
      const distance = distances[source]![target]!;
      if (distance === Number.POSITIVE_INFINITY) continue;
      reachable += 1;
      distanceSum += distance;
    }
    const domain = reachable - 1;
    const score = (domain * domain) / (distanceSum * (n - 1));
    out[target] = Number.isNaN(score) ? 0 : score;
  }

  return out;
}

function transpose(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_unused, column) => matrix[column]![row] ?? 0));
}

function selectNodes(values: readonly number[], nodes: readonly number[] | undefined): number[] {
  if (!nodes) return [...values];
  return nodes.map((node) => {
    if (!Number.isInteger(node) || node < 0 || node >= values.length) throw new RangeError("node is outside graph order");
    return values[node]!;
  });
}
