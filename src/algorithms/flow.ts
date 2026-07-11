// Ported from R sna 2.8: Edmonds-Karp support routine for the R/nli.R `flowbet` and R/connectivity.R `maxflow` ports.
import { createNumberMatrix } from "../core/matrix";
import type { DenseGraph } from "../core/types";

export function edmondsKarpMaxFlow(graph: DenseGraph, source: number, sink: number, ignoreEval: boolean, removedVertex = -1): number {
  const n = graph.order;
  if (source === sink) return Number.POSITIVE_INFINITY;
  if (source === removedVertex || sink === removedVertex) return 0;

  const capacity = Array.from({ length: n }, (_unused, tail) =>
    Array.from({ length: n }, (__unused, head) => {
      if (tail === removedVertex || head === removedVertex || graph.missing?.[tail * n + head]) return 0;
      const weight = graph.weights[tail * n + head] ?? 0;
      if (weight === 0) return 0;
      return ignoreEval ? 1 : Math.max(0, weight);
    }),
  );
  const flow = createNumberMatrix(n, n);
  let total = 0;

  while (true) {
    const parent = Array.from({ length: n }, () => -1);
    const parentSign = Array.from({ length: n }, () => 0);
    const pathCapacity = Array.from({ length: n }, () => 0);
    const queue = [source];
    parent[source] = source;
    pathCapacity[source] = Number.POSITIVE_INFINITY;

    for (let cursor = 0; cursor < queue.length && parent[sink] === -1; cursor += 1) {
      const vertex = queue[cursor]!;
      for (let next = 0; next < n; next += 1) {
        if (next === removedVertex || parent[next] !== -1) continue;
        const residualForward = capacity[vertex]![next]! - flow[vertex]![next]!;
        if (residualForward > 0) {
          parent[next] = vertex;
          parentSign[next] = 1;
          pathCapacity[next] = Math.min(pathCapacity[vertex]!, residualForward);
          queue.push(next);
          continue;
        }
        const residualBackward = flow[next]![vertex]!;
        if (residualBackward > 0) {
          parent[next] = vertex;
          parentSign[next] = -1;
          pathCapacity[next] = Math.min(pathCapacity[vertex]!, residualBackward);
          queue.push(next);
        }
      }
    }

    if (parent[sink] === -1) break;
    const augment = pathCapacity[sink]!;
    for (let vertex = sink; vertex !== source; ) {
      const prev = parent[vertex]!;
      if (parentSign[vertex] === 1) flow[prev]![vertex] = (flow[prev]![vertex] ?? 0) + augment;
      else flow[vertex]![prev] = (flow[vertex]![prev] ?? 0) - augment;
      vertex = prev;
    }
    total += augment;
  }

  return total;
}
