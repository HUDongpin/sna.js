// Ported from R sna 2.8: R/nli.R `loadcent`.
import { makeDenseGraph } from "../core/graph";
import type { GeodistResult, GraphInput, GraphOptions } from "../core/types";
import { pathCentralityScores } from "./pathCentrality";

export type LoadCentralityMode = "directed" | "undirected";

export interface LoadCentralityOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly cmode?: LoadCentralityMode;
  readonly tmaxdev?: boolean;
  readonly geodistPrecomp?: GeodistResult;
  readonly rescale?: boolean;
}

export function loadcent(input: GraphInput, options: LoadCentralityOptions & { tmaxdev: true }): number;
export function loadcent(input: GraphInput, options?: LoadCentralityOptions & { tmaxdev?: false }): number[];
export function loadcent(input: GraphInput, options: LoadCentralityOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, options);
  const mode = graph.directed ? (options.cmode ?? "directed") : "undirected";

  if (options.tmaxdev) {
    const n = graph.order;
    return mode === "undirected" ? ((n - 1) * (n - 1) * (n - 2)) / 2 : (n - 1) * (n - 1) * (n - 2);
  }

  return pathCentralityScores(input, {
    ...options,
    measure: "load",
    undirectedGeodesics: mode === "undirected",
    transposeDirected: mode === "directed",
    weightedErrorLabel: "loadcent",
  });
}
