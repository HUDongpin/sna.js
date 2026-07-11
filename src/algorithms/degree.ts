// Ported from R sna 2.8: R/nli.R `degree` and src/nli.c `degree_R`.
import { makeDenseGraph } from "../core/graph";
import type { GraphInput, GraphOptions } from "../core/types";
import { selectNodes } from "./pathCentrality";

export type DegreeMode = "indegree" | "outdegree" | "total" | "freeman";

export interface DegreeOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly cmode?: DegreeMode;
  readonly tmaxdev?: boolean;
  readonly rescale?: boolean;
}

export function degree(input: GraphInput, options: DegreeOptions & { tmaxdev: true }): number;
export function degree(input: GraphInput, options?: DegreeOptions & { tmaxdev?: false }): number[];
export function degree(input: GraphInput, options: DegreeOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  // R treats "total" as a deprecated alias of "freeman" (R itself has no "total" cmode).
  const requested = options.cmode ?? "freeman";
  if (!["indegree", "outdegree", "freeman", "total"].includes(requested)) throw new RangeError("unknown cmode in degree");
  // R forces cmode to "indegree" for undirected data (nli.R `degree`).
  const mode: DegreeMode = !graph.directed ? "indegree" : requested === "total" ? "freeman" : requested;
  const ignoreEval = options.ignoreEval ?? false;

  if (options.tmaxdev) return theoreticalMaxDeviation(n, mode, graph.directed, graph.loops);

  const valueAt = (i: number, j: number): number => (ignoreEval ? graph.adjacency[i * n + j] ?? 0 : graph.weights[i * n + j] ?? 0);
  const out = Array.from({ length: n }, () => 0);

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) {
        // Self-loops contribute once for every cmode (nli.c `degree_R`).
        if (graph.loops) out[i]! += valueAt(i, i);
        continue;
      }
      const value = valueAt(i, j);
      if (mode === "outdegree" || mode === "freeman") out[i]! += value;
      if (mode === "indegree" || mode === "freeman") out[j]! += value;
    }
  }

  return finish(out, options);
}

function finish(values: number[], options: DegreeOptions): number[] {
  if (options.rescale) {
    const total = values.reduce((sum, value) => sum + value, 0);
    values = values.map((value) => value / total);
  }
  return selectNodes(values, options.nodes);
}

function theoreticalMaxDeviation(n: number, mode: DegreeMode, directed: boolean, loops: boolean): number {
  const diag = loops ? 1 : 0;
  // Undirected data always reaches this with mode already forced to "indegree".
  if (!directed) return (n - 1) * (n - 2 + diag);
  switch (mode) {
    case "indegree":
    case "outdegree":
      return (n - 1) * (n - 1 + diag);
    case "total":
    case "freeman":
      return (n - 1) * (2 * (n - 1) - 2 + diag);
  }
}
