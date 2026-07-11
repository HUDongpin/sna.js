// Ported from R sna 2.8: R/nli.R `gilschmidt`.
import { makeDenseGraph } from "../core/graph";
import type { GraphInput, GraphOptions } from "../core/types";
import { geodist } from "./geodist";
import { selectNodes } from "./pathCentrality";

export interface GilSchmidtOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly tmaxdev?: boolean;
  readonly normalize?: boolean;
}

export function gilschmidt(input: GraphInput, options: GilSchmidtOptions & { tmaxdev: true }): number;
export function gilschmidt(input: GraphInput, options?: GilSchmidtOptions & { tmaxdev?: false }): number[];
export function gilschmidt(input: GraphInput, options: GilSchmidtOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;

  if (options.tmaxdev) return graph.directed ? n - 1 : (n - 2) / 2;

  const distances = geodist(graph, { ...options, countPaths: false, predecessors: false }).distances;
  const normalize = options.normalize ?? true;
  const values = distances.map((row, source) => {
    let inverseDistanceSum = 0;
    let reachable = 0;
    for (let target = 0; target < n; target += 1) {
      if (target === source) continue;
      const distance = row[target] ?? Number.POSITIVE_INFINITY;
      if (distance < Number.POSITIVE_INFINITY) {
        inverseDistanceSum += 1 / distance;
        reachable += 1;
      }
    }
    if (reachable === 0) return 0;
    return normalize ? inverseDistanceSum / reachable : inverseDistanceSum;
  });

  return selectNodes(values, options.nodes);
}
