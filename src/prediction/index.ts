import { makeSparseGraph } from "../modern/graph";
import type { AnalysisMeta, ModernGraphInput, NodeId, PairScoreResult, SparseGraph } from "../modern/types";
import { checkAborted, type CancellationOptions } from "../core/cancellation";

export type PredictionPair = readonly [NodeId, NodeId];

interface PredictionContext {
  readonly graph: SparseGraph;
  readonly indexById: ReadonlyMap<NodeId, number>;
  readonly neighbors: ReadonlyArray<ReadonlySet<number>>;
  readonly degrees: readonly number[];
}

function analysisMeta(graph: SparseGraph, algorithm: string): AnalysisMeta {
  return {
    algorithm,
    directed: false,
    weighted: false,
    valueSemantics: "binary",
    exact: true,
    warnings: [],
  };
}

function prepare(input: ModernGraphInput, algorithm: string): PredictionContext {
  const graph = makeSparseGraph(input);
  if (graph.directed) throw new RangeError(`${algorithm}: link prediction requires an undirected graph`);
  for (const weight of graph.edgeWeights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`${algorithm}: edge weights must be finite and non-negative`);
    }
  }
  for (let edge = 0; edge < graph.size; edge += 1) {
    if (graph.edgeSources[edge] === graph.edgeTargets[edge]) {
      throw new RangeError(`${algorithm}: link prediction requires a simple graph without self-loops`);
    }
  }

  const indexById = new Map<NodeId, number>();
  graph.nodeIds.forEach((id, index) => indexById.set(id, index));
  const neighbors = Array.from({ length: graph.order }, (_unused, node) => {
    const result = new Set<number>();
    const start = graph.csr.offsets[node] ?? 0;
    const end = graph.csr.offsets[node + 1] ?? start;
    for (let cursor = start; cursor < end; cursor += 1) {
      const neighbor = graph.csr.indices[cursor];
      if (neighbor !== undefined && neighbor !== node) result.add(neighbor);
    }
    return result;
  });
  return { graph, indexById, neighbors, degrees: neighbors.map((items) => items.size) };
}

function validatePairs(pairs: readonly PredictionPair[] | undefined, context: PredictionContext, algorithm: string): ReadonlyArray<readonly [NodeId, NodeId, number, number]> {
  if (!Array.isArray(pairs)) throw new TypeError(`${algorithm}: pairs are required`);
  return pairs.map((pair, position) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError(`${algorithm}: pair ${position} must contain exactly two node ids`);
    const [source, target] = pair;
    const sourceIndex = context.indexById.get(source);
    const targetIndex = context.indexById.get(target);
    if (sourceIndex === undefined) throw new RangeError(`${algorithm}: source node ${String(source)} is not in the graph`);
    if (targetIndex === undefined) throw new RangeError(`${algorithm}: target node ${String(target)} is not in the graph`);
    return [source, target, sourceIndex, targetIndex] as const;
  });
}

function commonNeighborIndices(context: PredictionContext, source: number, target: number): number[] {
  const sourceNeighbors = context.neighbors[source]!;
  const targetNeighbors = context.neighbors[target]!;
  const [smaller, larger] = sourceNeighbors.size <= targetNeighbors.size ? [sourceNeighbors, targetNeighbors] : [targetNeighbors, sourceNeighbors];
  const common: number[] = [];
  for (const neighbor of smaller) if (larger.has(neighbor)) common.push(neighbor);
  return common.sort((a, b) => a - b);
}

function applyPrediction(
  input: ModernGraphInput,
  pairs: readonly PredictionPair[] | undefined,
  algorithm: string,
  scorer: (context: PredictionContext, source: number, target: number) => number,
  options: CancellationOptions = {},
): PairScoreResult {
  checkAborted(options.signal);
  const context = prepare(input, algorithm);
  const resolved = validatePairs(pairs, context, algorithm);
  const results: PairScoreResult["pairs"][number][] = [];
  for (let position = 0; position < resolved.length; position += 1) {
    checkAborted(options.signal);
    const [source, target, sourceIndex, targetIndex] = resolved[position]!;
    const score = scorer(context, sourceIndex, targetIndex);
    if (!Number.isFinite(score) || score < 0) throw new RangeError(`${algorithm}: score for pair (${String(source)}, ${String(target)}) is not finite and non-negative`);
    results.push({ source, target, score });
    options.onProgress?.(position + 1, resolved.length);
    checkAborted(options.signal);
  }
  return { pairs: results, meta: analysisMeta(context.graph, algorithm) };
}

/** Number of shared neighbors for each required pair. */
export function commonNeighbors(input: ModernGraphInput, pairs: readonly PredictionPair[], options: CancellationOptions = {}): PairScoreResult {
  return applyPrediction(input, pairs, "commonNeighbors", (context, source, target) => commonNeighborIndices(context, source, target).length, options);
}

/** Shared-neighbor count divided by the size of the neighbor union. */
export function jaccardCoefficient(input: ModernGraphInput, pairs: readonly PredictionPair[], options: CancellationOptions = {}): PairScoreResult {
  return applyPrediction(input, pairs, "jaccardCoefficient", (context, source, target) => {
    const common = commonNeighborIndices(context, source, target).length;
    const union = (context.degrees[source] ?? 0) + (context.degrees[target] ?? 0) - common;
    return union === 0 ? 0 : common / union;
  }, options);
}

/** Adamic-Adar score: sum of inverse log-degree over common neighbors. */
export function adamicAdar(input: ModernGraphInput, pairs: readonly PredictionPair[], options: CancellationOptions = {}): PairScoreResult {
  return applyPrediction(input, pairs, "adamicAdar", (context, source, target) => {
    let score = 0;
    for (const neighbor of commonNeighborIndices(context, source, target)) {
      const degree = context.degrees[neighbor] ?? 0;
      if (degree <= 1) throw new RangeError("adamicAdar: a common neighbor must have degree greater than one");
      score += 1 / Math.log(degree);
    }
    return score;
  }, options);
}

/** Resource-allocation score: sum of inverse degree over common neighbors. */
export function resourceAllocation(input: ModernGraphInput, pairs: readonly PredictionPair[], options: CancellationOptions = {}): PairScoreResult {
  return applyPrediction(input, pairs, "resourceAllocation", (context, source, target) => {
    let score = 0;
    for (const neighbor of commonNeighborIndices(context, source, target)) {
      const degree = context.degrees[neighbor] ?? 0;
      if (degree <= 0) throw new RangeError("resourceAllocation: a common neighbor must have positive degree");
      score += 1 / degree;
    }
    return score;
  }, options);
}

/** Product of the endpoint degrees. */
export function preferentialAttachment(input: ModernGraphInput, pairs: readonly PredictionPair[], options: CancellationOptions = {}): PairScoreResult {
  return applyPrediction(input, pairs, "preferentialAttachment", (context, source, target) => (context.degrees[source] ?? 0) * (context.degrees[target] ?? 0), options);
}
