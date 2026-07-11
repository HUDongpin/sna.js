// Extension beyond R sna 2.8 (see README "Extensions beyond R sna"):
// deterministic weighted label-propagation community detection. R sna has no
// community-detection routine; this exists for callers that need
// igraph-comparable communities from the same graph normalization as the rest
// of this package. Ported unchanged from the sna.js 0.0.x template so
// downstream numerical results are preserved.
import { makeDenseGraph } from "../core/graph";
import type { DenseGraph, GraphInput, GraphOptions } from "../core/types";

export interface LabelPropagationOptions extends GraphOptions {
  /** Maximum sweeps over all vertices before giving up. Defaults to 50. */
  readonly maxIterations?: number;
}

export interface CommunityResult {
  readonly method: "label-propagation";
  /** Community label per vertex, remapped to first-seen order starting at 0. */
  readonly labels: number[];
  /** Vertex count per community, indexed by label. */
  readonly sizes: number[];
  /** Number of communities. */
  readonly count: number;
}

function tieValue(graph: DenseGraph, i: number, j: number, weighted: boolean): number {
  const index = i * graph.order + j;
  return weighted ? (graph.weights[index] ?? 0) : (graph.adjacency[index] ?? 0);
}

function remapLabels(labels: number[]): CommunityResult {
  const remap = new Map<number, number>();
  const normalized = labels.map((label) => {
    if (!remap.has(label)) remap.set(label, remap.size);
    return remap.get(label) ?? 0;
  });
  const sizes = Array.from({ length: remap.size }, () => 0);
  for (const label of normalized) sizes[label] = (sizes[label] ?? 0) + 1;
  return { method: "label-propagation", labels: normalized, sizes, count: sizes.length };
}

/**
 * Deterministic label propagation: vertices are swept in index order, each
 * adopting the label with the greatest total (symmetrized) tie weight among
 * its neighbors; exact ties break toward the smaller label. Edge values are
 * used as weights by default; pass `ignoreEval: true` for binary propagation.
 * The sequential deterministic sweep makes results reproducible, unlike the
 * randomized classic algorithm.
 */
export function labelPropagation(input: GraphInput, options: LabelPropagationOptions = {}): CommunityResult {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const labels = Array.from({ length: n }, (_, index) => index);
  const maxIterations = options.maxIterations ?? 50;
  const weighted = options.ignoreEval !== true;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false;
    for (let node = 0; node < n; node += 1) {
      const weights = new Map<number, number>();
      for (let other = 0; other < n; other += 1) {
        if (node === other) continue;
        const weight = Math.max(tieValue(graph, node, other, weighted), tieValue(graph, other, node, weighted));
        if (weight <= 0) continue;
        const label = labels[other] ?? other;
        weights.set(label, (weights.get(label) ?? 0) + weight);
      }
      if (weights.size === 0) continue;
      const currentLabel = labels[node] ?? node;
      const best = Array.from(weights.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? currentLabel;
      if (best !== currentLabel) {
        labels[node] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return remapLabels(labels);
}
