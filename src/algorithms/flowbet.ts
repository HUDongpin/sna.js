// Ported from R sna 2.8: R/nli.R `flowbet`.
import { makeDenseGraph } from "../core/graph";
import { createNumberMatrix } from "../core/matrix";
import type { GraphInput, GraphOptions } from "../core/types";
import { edmondsKarpMaxFlow } from "./flow";
import { selectNodes } from "./pathCentrality";

export type FlowBetweennessMode = "rawflow" | "normflow" | "fracflow";

export interface FlowBetweennessOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly tmaxdev?: boolean;
  readonly cmode?: FlowBetweennessMode;
  readonly rescale?: boolean;
}

export function flowbet(input: GraphInput, options: FlowBetweennessOptions & { tmaxdev: true }): number;
export function flowbet(input: GraphInput, options?: FlowBetweennessOptions & { tmaxdev?: false }): number[];
export function flowbet(input: GraphInput, options: FlowBetweennessOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const mode = options.cmode ?? "rawflow";

  if (!["rawflow", "normflow", "fracflow"].includes(mode)) throw new RangeError("unknown cmode in flowbet");
  if (options.tmaxdev) {
    if (mode === "normflow") return n - 1;
    return ((n - 1) * (n - 1) * (n - 2)) / (graph.directed ? 1 : 2);
  }

  const maxFlow = createNumberMatrix(n, n, Number.POSITIVE_INFINITY);
  for (let source = 0; source < n; source += 1) {
    for (let sink = 0; sink < n; sink += 1) {
      if (source === sink) continue;
      if (!graph.directed && source > sink) {
        maxFlow[source]![sink] = maxFlow[sink]![source]!;
        continue;
      }
      maxFlow[source]![sink] = edmondsKarpMaxFlow(graph, source, sink, options.ignoreEval ?? false);
      if (!graph.directed) maxFlow[sink]![source] = maxFlow[source]![sink]!;
    }
  }

  const normalizers =
    mode === "normflow"
      ? Array.from({ length: n }, (_unused, vertex) => {
          let total = 0;
          for (let source = 0; source < n; source += 1) {
            for (let sink = 0; sink < n; sink += 1) {
              if (source !== sink && source !== vertex && sink !== vertex) total += maxFlow[source]![sink]!;
            }
          }
          return total;
        })
      : undefined;

  let values = Array.from({ length: n }, () => 0);
  for (let vertex = 0; vertex < n; vertex += 1) {
    for (let source = 0; source < n; source += 1) {
      for (let sink = 0; sink < n; sink += 1) {
        if (source === sink || source === vertex || sink === vertex || (!graph.directed && source >= sink)) continue;
        const maximum = maxFlow[source]![sink]!;
        if (maximum <= 0) continue;
        const reduced = edmondsKarpMaxFlow(graph, source, sink, options.ignoreEval ?? false, vertex);
        const difference = maximum - reduced;
        values[vertex] = values[vertex]! + (mode === "fracflow" ? difference / maximum : difference);
      }
    }
    if (mode === "normflow") values[vertex] = (values[vertex]! / normalizers![vertex]!) * (graph.directed ? 1 : 2);
  }

  if (options.rescale) {
    const total = values.reduce((sum, value) => sum + value, 0);
    values = values.map((value) => value / total);
  }

  return selectNodes(values, options.nodes);
}
