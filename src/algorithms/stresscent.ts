import { makeDenseGraph } from "../core/graph";
import type { GeodistResult, GraphInput, GraphOptions } from "../core/types";
import { pathCentralityScores } from "./pathCentrality";

export type StressCentralityMode = "directed" | "undirected";

export interface StressCentralityOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly cmode?: StressCentralityMode;
  readonly tmaxdev?: boolean;
  readonly geodistPrecomp?: GeodistResult;
  readonly rescale?: boolean;
}

export function stresscent(input: GraphInput, options: StressCentralityOptions & { tmaxdev: true }): number;
export function stresscent(input: GraphInput, options?: StressCentralityOptions & { tmaxdev?: false }): number[];
export function stresscent(input: GraphInput, options: StressCentralityOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, options);
  const mode = graph.directed ? (options.cmode ?? "directed") : "undirected";

  if (options.tmaxdev) {
    const n = graph.order;
    return mode === "undirected" ? ((n - 1) * (n - 1) * (n - 2)) / 2 : (n - 1) * (n - 1) * (n - 2);
  }

  return pathCentralityScores(input, {
    ...options,
    measure: "stress",
    undirectedGeodesics: mode === "undirected",
    divideByTwo: mode === "undirected",
    weightedErrorLabel: "stresscent",
  });
}
