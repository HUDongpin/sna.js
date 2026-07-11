// Ported from R sna 2.8: R/nli.R `betweenness` and src/nli.c `betweenness_R`.
import { makeDenseGraph } from "../core/graph";
import type { EdgeTuple, GeodistResult, GraphInput, GraphOptions } from "../core/types";
import { pathCentralityScores, type PathCentralityMeasure } from "./pathCentrality";

export type BetweennessMode =
  | "directed"
  | "undirected"
  | "endpoints"
  | "proximalsrc"
  | "proximaltar"
  | "proximalsum"
  | "lengthscaled"
  | "linearscaled";

export interface BetweennessOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly cmode?: BetweennessMode;
  readonly tmaxdev?: boolean;
  readonly geodistPrecomp?: GeodistResult;
  readonly rescale?: boolean;
}

export function betweenness(input: GraphInput, options: BetweennessOptions & { tmaxdev: true }): number;
export function betweenness(input: GraphInput, options?: BetweennessOptions & { tmaxdev?: false }): number[];
export function betweenness(input: GraphInput, options: BetweennessOptions = {}): number | number[] {
  const baseGraph = makeDenseGraph(input, options);
  const mode = options.cmode ?? "directed";
  const divideByTwo = mode === "undirected" || !baseGraph.directed;

  if (options.tmaxdev) return theoreticalMaxDeviation(baseGraph.order, mode, baseGraph.directed, options);

  return pathCentralityScores(input, {
    ...options,
    measure: modeToMeasure(mode),
    undirectedGeodesics: mode === "undirected",
    divideByTwo,
    weightedErrorLabel: "betweenness",
  });
}

function modeToMeasure(mode: BetweennessMode): PathCentralityMeasure {
  return mode === "directed" || mode === "undirected" ? "standard" : mode;
}

function theoreticalMaxDeviation(n: number, mode: BetweennessMode, directed: boolean, options: BetweennessOptions): number {
  if (n <= 1) return 0;
  if (mode === "directed" && directed) return (n - 1) * (n - 1) * (n - 2);
  if ((mode === "directed" && !directed) || mode === "undirected") return ((n - 1) * (n - 1) * (n - 2)) / 2;

  const edges: EdgeTuple[] = [];
  for (let vertex = 1; vertex < n; vertex += 1) {
    edges.push([0, vertex]);
    if (!directed) edges.push([vertex, 0]);
  }
  const { geodistPrecomp: _geodistPrecomp, ...recursiveOptions } = options;
  const scores = betweenness(
    { order: n, directed, edges },
    {
      ...recursiveOptions,
      cmode: mode,
      tmaxdev: false,
      mode: directed ? "digraph" : "graph",
      directed,
      rescale: false,
    },
  );
  const maximum = scores.length === 0 ? 0 : Math.max(...scores);
  return scores.reduce((sum, score) => sum + maximum - score, 0);
}
