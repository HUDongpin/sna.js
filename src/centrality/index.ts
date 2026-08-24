import { checkAborted, type CancellationOptions } from "../core/cancellation";
import { makeSparseGraph } from "../modern/graph";
import type {
  AnalysisMeta,
  HitsResult,
  IterativeAnalysisOptions,
  MakeSparseGraphOptions,
  ModernGraphInput,
  NodeId,
  NodeScoreResult,
  NodeWeightInput,
  SparseAdjacency,
  SparseGraph,
} from "../modern/types";

const DEFAULT_TOLERANCE = 1e-10;
const DEFAULT_MAX_ITERATIONS = 100;

export interface PageRankOptions extends IterativeAnalysisOptions {
  /** Teleport complement; must be in [0, 1). Defaults to 0.85. */
  readonly damping?: number;
  /** Probability vector, map, or `[node, weight]` pairs. Normalized internally. */
  readonly personalization?: NodeWeightInput;
  /** Redistribution for dangling mass. Defaults to the personalization vector. */
  readonly dangling?: NodeWeightInput;
  /** Use edge values as strengths. Defaults to true; false uses binary arcs. */
  readonly weighted?: boolean;
}

export interface HitsOptions extends IterativeAnalysisOptions {
  /** Use edge values as strengths. Defaults to true; false uses binary arcs. */
  readonly weighted?: boolean;
}

export interface HarmonicCentralityOptions extends MakeSparseGraphOptions, CancellationOptions {
  /** Follow outgoing or incoming paths on directed graphs. Defaults to `out`. */
  readonly direction?: "out" | "in";
  /** Use inverse strength as path distance. Defaults to true. */
  readonly weighted?: boolean;
  /** Divide each score by n - 1. Defaults to false. */
  readonly normalized?: boolean;
}

export class ConvergenceError extends Error {
  readonly algorithm: string;
  readonly iterations: number;

  constructor(algorithm: string, iterations: number) {
    super(`${algorithm} did not converge within ${iterations} iterations`);
    this.name = "ConvergenceError";
    this.algorithm = algorithm;
    this.iterations = iterations;
  }
}

function assertStrengths(graph: SparseGraph): void {
  for (let edge = 0; edge < graph.size; edge += 1) {
    const strength = graph.edgeWeights[edge]!;
    if (!Number.isFinite(strength) || strength < 0) {
      throw new RangeError("modern centrality requires finite, non-negative edge strengths");
    }
  }
}

function resolveIterationOptions(options: IterativeAnalysisOptions): { tolerance: number; maxIterations: number } {
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError("tolerance must be a positive finite number");
  if (!Number.isInteger(maxIterations) || maxIterations < 0) throw new RangeError("maxIterations must be a non-negative integer");
  return { tolerance, maxIterations };
}

function normalizeProbability(values: number[], label: string): number[] {
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} weights must be finite and non-negative`);
    total += value;
  }
  if (!(total > 0) || !Number.isFinite(total)) throw new RangeError(`${label} weights must have a positive finite sum`);
  return values.map((value) => value / total);
}

function isNodeWeightMap(input: NodeWeightInput): input is ReadonlyMap<NodeId, number> {
  return typeof input === "object" && input !== null && "get" in input && "entries" in input;
}

function nodeWeights(input: NodeWeightInput | undefined, graph: SparseGraph, label: string): number[] {
  if (graph.order === 0) return [];
  if (input === undefined) return Array.from({ length: graph.order }, () => 1 / graph.order);

  if (isNodeWeightMap(input)) {
    const indexById = new Map<NodeId, number>();
    for (let node = 0; node < graph.order; node += 1) indexById.set(graph.nodeIds[node]!, node);
    const values = Array.from({ length: graph.order }, () => 0);
    for (const [nodeId, weight] of input) {
      const index = indexById.get(nodeId);
      if (index === undefined) throw new RangeError(`${label} references unknown node ${String(nodeId)}`);
      values[index] = weight;
    }
    return normalizeProbability(values, label);
  }

  const arrayInput = input as ReadonlyArray<number> | ReadonlyArray<readonly [NodeId, number]>;
  if (arrayInput.every((entry) => typeof entry === "number")) {
    const vector = arrayInput as ReadonlyArray<number>;
    if (vector.length !== graph.order) throw new RangeError(`${label} vector length must equal graph order`);
    return normalizeProbability([...vector], label);
  }

  const values = Array.from({ length: graph.order }, () => 0);
  const seen = new Set<NodeId>();
  const indexById = new Map<NodeId, number>();
  for (let node = 0; node < graph.order; node += 1) indexById.set(graph.nodeIds[node]!, node);
  for (const item of arrayInput as ReadonlyArray<readonly [NodeId, number]>) {
    if (!Array.isArray(item) || item.length !== 2) throw new TypeError(`${label} entries must be [node, weight] pairs`);
    const [nodeId, weight] = item;
    if (seen.has(nodeId)) throw new RangeError(`${label} contains duplicate node ${String(nodeId)}`);
    const index = indexById.get(nodeId);
    if (index === undefined) throw new RangeError(`${label} references unknown node ${String(nodeId)}`);
    seen.add(nodeId);
    values[index] = weight;
  }
  return normalizeProbability(values, label);
}

function iterativeMeta(
  algorithm: string,
  graph: SparseGraph,
  weighted: boolean,
  iterations: number,
  converged: boolean,
): AnalysisMeta {
  const partial = !converged;
  return {
    algorithm,
    directed: graph.directed,
    weighted,
    valueSemantics: weighted ? "strength" : "binary",
    exact: false,
    approximate: true,
    warnings: partial ? [`${algorithm} reached maxIterations; values are the last iterate`] : [],
    converged,
    iterations,
    partial,
  };
}

function finishIterative<T>(
  algorithm: string,
  graph: SparseGraph,
  weighted: boolean,
  iterations: number,
  converged: boolean,
  allowPartial: boolean | undefined,
  makeResult: (meta: AnalysisMeta) => T,
): T {
  if (!converged && allowPartial !== true) throw new ConvergenceError(algorithm, iterations);
  return makeResult(iterativeMeta(algorithm, graph, weighted, iterations, converged));
}

/** Weighted PageRank with explicit personalization and dangling distributions. */
export function pageRank(input: ModernGraphInput, options: PageRankOptions = {}): NodeScoreResult {
  const graph = makeSparseGraph(input, options);
  assertStrengths(graph);
  checkAborted(options.signal);
  const damping = options.damping ?? 0.85;
  if (!Number.isFinite(damping) || damping < 0 || damping >= 1) {
    throw new RangeError("damping must be a finite number in [0, 1)");
  }
  const weighted = options.weighted ?? true;
  const { tolerance, maxIterations } = resolveIterationOptions(options);
  const personalization = nodeWeights(options.personalization, graph, "personalization");
  const dangling = options.dangling === undefined ? [...personalization] : nodeWeights(options.dangling, graph, "dangling");
  if (graph.order === 0) {
    return {
      nodes: [],
      values: [],
      meta: iterativeMeta("pagerank", graph, weighted, 0, true),
    };
  }

  const outStrength = new Float64Array(graph.order);
  for (let source = 0; source < graph.order; source += 1) {
    for (let entry = graph.csr.offsets[source]!; entry < graph.csr.offsets[source + 1]!; entry += 1) {
      const strength = weighted ? graph.csr.weights[entry]! : 1;
      outStrength[source] = outStrength[source]! + strength;
    }
  }

  let current = [...personalization];
  let iterations = 0;
  let converged = false;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    checkAborted(options.signal);
    const next = personalization.map((value) => (1 - damping) * value);
    let danglingMass = 0;
    for (let source = 0; source < graph.order; source += 1) {
      const total = outStrength[source]!;
      if (total === 0) {
        danglingMass += current[source]!;
        continue;
      }
      const contribution = (damping * current[source]!) / total;
      for (let entry = graph.csr.offsets[source]!; entry < graph.csr.offsets[source + 1]!; entry += 1) {
        const strength = weighted ? graph.csr.weights[entry]! : 1;
        if (strength === 0) continue;
        const target = graph.csr.indices[entry]!;
        next[target] = next[target]! + contribution * strength;
      }
    }
    if (danglingMass !== 0) {
      const mass = damping * danglingMass;
      for (let node = 0; node < graph.order; node += 1) next[node] = next[node]! + mass * dangling[node]!;
    }

    let total = 0;
    for (let node = 0; node < graph.order; node += 1) total += next[node]!;
    if (!(total > 0) || !Number.isFinite(total)) throw new RangeError("PageRank produced a non-finite probability mass");
    if (Math.abs(total - 1) > Number.EPSILON) {
      for (let node = 0; node < graph.order; node += 1) next[node] = next[node]! / total;
    }
    let delta = 0;
    for (let node = 0; node < graph.order; node += 1) delta += Math.abs(next[node]! - current[node]!);
    current = next;
    iterations = iteration;
    options.onProgress?.(iteration, maxIterations);
    checkAborted(options.signal);
    if (delta <= tolerance) {
      converged = true;
      break;
    }
  }

  return finishIterative("pagerank", graph, weighted, iterations, converged, options.allowPartial, (meta) => ({
    nodes: [...graph.nodeIds],
    values: current,
    meta,
  }));
}

function l2Normalize(values: number[]): number {
  let sumSquares = 0;
  for (const value of values) sumSquares += value * value;
  const norm = Math.sqrt(sumSquares);
  if (norm > 0) {
    for (let index = 0; index < values.length; index += 1) values[index] = values[index]! / norm;
  }
  return norm;
}

/** Weighted HITS hub and authority scores over CSR/CSC without dense matrices. */
export function hits(input: ModernGraphInput, options: HitsOptions = {}): HitsResult {
  const graph = makeSparseGraph(input, options);
  assertStrengths(graph);
  checkAborted(options.signal);
  const weighted = options.weighted ?? true;
  const { tolerance, maxIterations } = resolveIterationOptions(options);
  if (graph.order === 0) {
    return { nodes: [], hubs: [], authorities: [], meta: iterativeMeta("hits", graph, weighted, 0, true) };
  }

  const initial = 1 / Math.sqrt(graph.order);
  let hubs = Array.from({ length: graph.order }, () => initial);
  let authorities = Array.from({ length: graph.order }, () => initial);
  let iterations = 0;
  let converged = false;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    checkAborted(options.signal);
    const nextAuthorities = Array.from({ length: graph.order }, () => 0);
    for (let target = 0; target < graph.order; target += 1) {
      let score = 0;
      for (let entry = graph.csc.offsets[target]!; entry < graph.csc.offsets[target + 1]!; entry += 1) {
        const strength = weighted ? graph.csc.weights[entry]! : 1;
        if (strength !== 0) score += hubs[graph.csc.indices[entry]!]! * strength;
      }
      nextAuthorities[target] = score;
    }
    const authorityNorm = l2Normalize(nextAuthorities);

    const nextHubs = Array.from({ length: graph.order }, () => 0);
    for (let source = 0; source < graph.order; source += 1) {
      let score = 0;
      for (let entry = graph.csr.offsets[source]!; entry < graph.csr.offsets[source + 1]!; entry += 1) {
        const strength = weighted ? graph.csr.weights[entry]! : 1;
        if (strength !== 0) score += nextAuthorities[graph.csr.indices[entry]!]! * strength;
      }
      nextHubs[source] = score;
    }
    const hubNorm = l2Normalize(nextHubs);

    let delta = 0;
    for (let node = 0; node < graph.order; node += 1) {
      delta += Math.abs(nextHubs[node]! - hubs[node]!) + Math.abs(nextAuthorities[node]! - authorities[node]!);
    }
    hubs = nextHubs;
    authorities = nextAuthorities;
    iterations = iteration;
    options.onProgress?.(iteration, maxIterations);
    checkAborted(options.signal);
    if ((hubNorm === 0 && authorityNorm === 0) || delta <= tolerance) {
      converged = true;
      break;
    }
  }

  return finishIterative("hits", graph, weighted, iterations, converged, options.allowPartial, (meta) => ({
    nodes: [...graph.nodeIds],
    hubs,
    authorities,
    meta,
  }));
}

interface HeapEntry {
  node: number;
  distance: number;
}

class DistanceHeap {
  private readonly entries: HeapEntry[] = [];

  push(node: number, distance: number): void {
    let index = this.entries.length;
    this.entries.push({ node, distance });
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent]!.distance <= distance) break;
      this.entries[index] = this.entries[parent]!;
      index = parent;
    }
    this.entries[index] = { node, distance };
  }

  pop(): HeapEntry | undefined {
    const top = this.entries[0];
    const tail = this.entries.pop();
    if (top === undefined || tail === undefined) return undefined;
    if (this.entries.length === 0) return top;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.entries.length) break;
      const right = left + 1;
      const child = right < this.entries.length && this.entries[right]!.distance < this.entries[left]!.distance ? right : left;
      if (this.entries[child]!.distance >= tail.distance) break;
      this.entries[index] = this.entries[child]!;
      index = child;
    }
    this.entries[index] = tail;
    return top;
  }
}

function unweightedDistances(adjacency: SparseAdjacency, source: number, order: number): Float64Array {
  const distances = new Float64Array(order);
  distances.fill(Number.POSITIVE_INFINITY);
  const queue = new Uint32Array(order);
  let head = 0;
  let tail = 0;
  distances[source] = 0;
  queue[tail] = source;
  tail += 1;
  while (head < tail) {
    const node = queue[head]!;
    head += 1;
    const distance = distances[node]! + 1;
    for (let entry = adjacency.offsets[node]!; entry < adjacency.offsets[node + 1]!; entry += 1) {
      const target = adjacency.indices[entry]!;
      if (distances[target] !== Number.POSITIVE_INFINITY) continue;
      distances[target] = distance;
      queue[tail] = target;
      tail += 1;
    }
  }
  return distances;
}

function weightedDistances(
  adjacency: SparseAdjacency,
  source: number,
  order: number,
  signal: AbortSignal | undefined,
): Float64Array {
  const distances = new Float64Array(order);
  distances.fill(Number.POSITIVE_INFINITY);
  distances[source] = 0;
  const heap = new DistanceHeap();
  heap.push(source, 0);
  let popped = 0;

  while (true) {
    const item = heap.pop();
    if (item === undefined) break;
    if (item.distance !== distances[item.node]) continue;
    popped += 1;
    if ((popped & 0xfff) === 0) checkAborted(signal);
    for (let entry = adjacency.offsets[item.node]!; entry < adjacency.offsets[item.node + 1]!; entry += 1) {
      const strength = adjacency.weights[entry]!;
      if (strength === 0) continue;
      const target = adjacency.indices[entry]!;
      const candidate = item.distance + 1 / strength;
      if (candidate < distances[target]!) {
        distances[target] = candidate;
        heap.push(target, candidate);
      }
    }
  }
  return distances;
}

/** Harmonic centrality using hops or inverse-strength shortest paths. */
export function harmonicCentrality(input: ModernGraphInput, options: HarmonicCentralityOptions = {}): NodeScoreResult {
  const graph = makeSparseGraph(input, options);
  assertStrengths(graph);
  checkAborted(options.signal);
  const weighted = options.weighted ?? true;
  const direction = options.direction ?? "out";
  const adjacency = direction === "out" ? graph.csr : graph.csc;
  const values = Array.from({ length: graph.order }, () => 0);

  for (let source = 0; source < graph.order; source += 1) {
    checkAborted(options.signal);
    const distances = weighted
      ? weightedDistances(adjacency, source, graph.order, options.signal)
      : unweightedDistances(adjacency, source, graph.order);
    let score = 0;
    for (let target = 0; target < graph.order; target += 1) {
      if (target === source) continue;
      const distance = distances[target]!;
      if (Number.isFinite(distance) && distance > 0) score += 1 / distance;
    }
    values[source] = options.normalized && graph.order > 1 ? score / (graph.order - 1) : score;
    options.onProgress?.(source + 1, graph.order);
    checkAborted(options.signal);
  }

  return {
    nodes: [...graph.nodeIds],
    values,
    meta: {
      algorithm: "harmonic-centrality",
      directed: graph.directed,
      weighted,
      valueSemantics: weighted ? "strength" : "binary",
      exact: true,
      warnings: [],
      converged: true,
      iterations: graph.order,
      partial: false,
    },
  };
}

export type { AnalysisMeta, HitsResult, NodeScoreResult, NodeWeightInput } from "../modern/types";
