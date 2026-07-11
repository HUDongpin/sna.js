// Ported from R sna 2.8: R/gli.R `gden` and R/dataprep.R `nties`.
import { makeDenseGraph } from "../core/graph";
import type { GraphInput, GraphOptions } from "../core/types";

/**
 * Number of possible ties, as in R `nties`: `n*(n-1)` for digraphs and
 * `(n*n-n)/2` for graphs, plus `n` when the diagonal is included.
 */
export function nties(input: GraphInput, options: GraphOptions = {}): number {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const directed = graph.directed;
  const count = directed ? n * n : (n * n - n) / 2 + n;
  return graph.loops ? count : count - n;
}

export function gden(input: GraphInput, options: GraphOptions = {}): number {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const ignoreEval = options.ignoreEval ?? false;
  const diag = graph.loops;

  if (n === 0) return Number.NaN;

  // Sum tie values (or tie indicators) over the cells R considers, tracking
  // missing cells so they can be removed from the denominator (gli.R `gden`).
  let count = 0;
  let nmis = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (!diag && i === j) continue;
      const index = i * n + j;
      if (graph.missing?.[index]) {
        nmis += 1;
        continue;
      }
      count += ignoreEval ? graph.adjacency[index] ?? 0 : graph.weights[index] ?? 0;
    }
  }

  if (n === 1) return diag ? count / (1 - nmis) : Number.NaN;

  // R uses the ordered-pair denominator for both digraphs and graphs: for
  // symmetric data the numerator counts each tie twice, so the ratio matches.
  const nt = n * (n - 1) - nmis + (diag ? n : 0);
  return count / nt;
}
