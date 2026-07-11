// Ported from R sna 2.8: R/connectivity.R `geodist` (geodist_R / geodist_val_R).
import { makeDenseGraph } from "../core/graph";
import { checkAborted, type CancellationOptions } from "../core/cancellation";
import { createNumberMatrix } from "../core/matrix";
import type { GeodistResult, GraphInput, GraphOptions } from "../core/types";
import { buildAdjacencyLists, singleSourcePaths } from "./pathCentrality";

export interface GeodistOptions extends GraphOptions, CancellationOptions {
  readonly infReplace?: number;
  readonly countPaths?: boolean;
  readonly predecessors?: boolean;
}

export function geodist(input: GraphInput, options: GeodistOptions = {}): GeodistResult {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  // R's geodist defaults to ignore.eval=TRUE (unweighted BFS); with
  // ignore.eval=FALSE it runs a Dijkstra-style search (geodist_val_R) and
  // rejects negative edge values.
  const ignoreEval = options.ignoreEval ?? true;
  const adjacency = buildAdjacencyLists(graph, ignoreEval, "geodist");

  const distances = createNumberMatrix(n, n, Number.POSITIVE_INFINITY);
  const counts = createNumberMatrix(n, n, 0);
  const predecessorData = options.predecessors ? Array.from({ length: n }, () => [] as number[][]) : undefined;

  for (let source = 0; source < n; source += 1) {
    checkAborted(options.signal);
    const paths = singleSourcePaths(n, adjacency, source, ignoreEval);
    distances[source] = paths.distances;
    counts[source] = paths.sigma;
    if (predecessorData) predecessorData[source] = paths.predecessors;
    options.onProgress?.(source + 1, n);
  }

  if (typeof options.infReplace === "number") {
    for (const row of distances) {
      for (let j = 0; j < row.length; j += 1) {
        if (row[j] === Number.POSITIVE_INFINITY) row[j] = options.infReplace;
      }
    }
  }

  return predecessorData ? { distances, counts, predecessors: predecessorData } : { distances, counts };
}
