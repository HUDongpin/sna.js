import { makeSparseGraph } from "../modern/graph";
import type {
  AnalysisMeta,
  MixingMatrixResult,
  ModernGraphInput,
  NodeScoreResult,
  NullableNodeScoreResult,
  ScalarResult,
  SparseGraph,
} from "../modern/types";

export type DegreeMode = "in" | "out" | "total";

export type ScalarStatisticResult = ScalarResult<number | null>;

export interface WeightedStatisticOptions {
  /** Use edge weights. The default is the NetworkX-compatible unweighted definition. */
  readonly weighted?: boolean;
}

export interface AverageClusteringOptions extends WeightedStatisticOptions {
  /** Include zero-valued local coefficients in the average. Defaults to true. */
  readonly countZeros?: boolean;
}

export interface DegreeAssortativityOptions extends WeightedStatisticOptions {
  /** Degree at the source endpoint. Directed graphs default to out-degree. */
  readonly source?: DegreeMode;
  /** Degree at the target endpoint. Directed graphs default to in-degree. */
  readonly target?: DegreeMode;
  /** NetworkX-style compatibility alias for source. */
  readonly x?: DegreeMode;
  /** NetworkX-style compatibility alias for target. */
  readonly y?: DegreeMode;
}

export interface MixingMatrixOptions {
  /** Normalize cells to probabilities. Defaults to true. */
  readonly normalized?: boolean;
}

interface NeighborView {
  readonly out: number[][];
  readonly incoming: number[][];
  readonly all: number[][];
  readonly outSets: ReadonlyArray<ReadonlySet<number>>;
  readonly inSets: ReadonlyArray<ReadonlySet<number>>;
  readonly outWeights: ReadonlyArray<ReadonlyMap<number, number>>;
}

interface EndpointSamples {
  readonly source: number[];
  readonly target: number[];
}

const EPSILON = 1e-15;

function analysisMeta(
  graph: SparseGraph,
  algorithm: string,
  weighted: boolean,
  valueSemantics: AnalysisMeta["valueSemantics"],
  warnings: readonly string[] = [],
): AnalysisMeta {
  return {
    algorithm,
    directed: graph.directed,
    weighted,
    valueSemantics,
    exact: true,
    warnings: [...warnings],
  };
}

function prepareGraph(input: ModernGraphInput, algorithm: string): SparseGraph {
  const graph = makeSparseGraph(input);
  const n = graph.nodeIds.length;
  if (graph.csr.offsets.length !== n + 1 || graph.csc.offsets.length !== n + 1) {
    throw new RangeError(`${algorithm}: malformed sparse graph offsets`);
  }
  if (graph.csr.indices.length !== graph.csr.weights.length || graph.csc.indices.length !== graph.csc.weights.length) {
    throw new RangeError(`${algorithm}: malformed sparse graph index/weight arrays`);
  }
  for (const weight of graph.csr.weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`${algorithm}: edge weights must be finite and non-negative`);
    }
  }
  return graph;
}

function buildNeighborView(graph: SparseGraph): NeighborView {
  const n = graph.nodeIds.length;
  const out = Array.from({ length: n }, () => [] as number[]);
  const incoming = Array.from({ length: n }, () => [] as number[]);
  const outWeights = Array.from({ length: n }, () => new Map<number, number>());

  for (let node = 0; node < n; node += 1) {
    const start = graph.csr.offsets[node] ?? 0;
    const end = graph.csr.offsets[node + 1] ?? start;
    for (let cursor = start; cursor < end; cursor += 1) {
      const neighbor = graph.csr.indices[cursor];
      const weight = graph.csr.weights[cursor];
      if (neighbor === undefined || weight === undefined || neighbor === node) continue;
      out[node]!.push(neighbor);
      outWeights[node]!.set(neighbor, weight);
    }

    const inStart = graph.csc.offsets[node] ?? 0;
    const inEnd = graph.csc.offsets[node + 1] ?? inStart;
    for (let cursor = inStart; cursor < inEnd; cursor += 1) {
      const neighbor = graph.csc.indices[cursor];
      if (neighbor === undefined || neighbor === node) continue;
      incoming[node]!.push(neighbor);
    }
  }

  const outSets = out.map((neighbors) => new Set(neighbors));
  const inSets = incoming.map((neighbors) => new Set(neighbors));
  const all = out.map((neighbors, node) => Array.from(new Set([...neighbors, ...incoming[node]!])).sort((a, b) => a - b));
  return { out, incoming, all, outSets, inSets, outWeights };
}

function requireUndirected(graph: SparseGraph, algorithm: string): void {
  if (graph.directed) throw new RangeError(`${algorithm}: directed graphs are not supported`);
}

function resolveDegreeModes(graph: SparseGraph, options: DegreeAssortativityOptions): readonly [DegreeMode, DegreeMode] {
  const source = options.source ?? options.x ?? (graph.directed ? "out" : "total");
  const target = options.target ?? options.y ?? (graph.directed ? "in" : "total");
  const modes: readonly DegreeMode[] = ["in", "out", "total"];
  if (!modes.includes(source) || !modes.includes(target)) throw new RangeError("degree mode must be in, out, or total");
  return graph.directed ? [source, target] : ["total", "total"];
}

function degreeValues(graph: SparseGraph, mode: DegreeMode, weighted: boolean): number[] {
  const n = graph.nodeIds.length;
  const out = Array.from({ length: n }, () => 0);
  const incoming = Array.from({ length: n }, () => 0);

  for (let node = 0; node < n; node += 1) {
    const start = graph.csr.offsets[node] ?? 0;
    const end = graph.csr.offsets[node + 1] ?? start;
    for (let cursor = start; cursor < end; cursor += 1) {
      const neighbor = graph.csr.indices[cursor];
      if (neighbor === undefined) continue;
      const contribution = weighted ? (graph.csr.weights[cursor] ?? 0) : 1;
      out[node] = (out[node] ?? 0) + (!graph.directed && neighbor === node ? 2 * contribution : contribution);
    }
    const inStart = graph.csc.offsets[node] ?? 0;
    const inEnd = graph.csc.offsets[node + 1] ?? inStart;
    for (let cursor = inStart; cursor < inEnd; cursor += 1) {
      const neighbor = graph.csc.indices[cursor];
      if (neighbor === undefined) continue;
      incoming[node] = (incoming[node] ?? 0) + (weighted ? (graph.csc.weights[cursor] ?? 0) : 1);
    }
  }

  if (!graph.directed) return out;
  if (mode === "out") return out;
  if (mode === "in") return incoming;
  return out.map((value, node) => value + (incoming[node] ?? 0));
}

function endpointSamples(graph: SparseGraph, sourceValues: readonly number[], targetValues: readonly number[]): EndpointSamples {
  const source: number[] = [];
  const target: number[] = [];
  for (let tail = 0; tail < graph.nodeIds.length; tail += 1) {
    const start = graph.csr.offsets[tail] ?? 0;
    const end = graph.csr.offsets[tail + 1] ?? start;
    for (let cursor = start; cursor < end; cursor += 1) {
      const head = graph.csr.indices[cursor];
      if (head === undefined) continue;
      source.push(sourceValues[tail] ?? 0);
      target.push(targetValues[head] ?? 0);
    }
  }
  return { source, target };
}

function pearson(source: readonly number[], target: readonly number[]): number | null {
  if (source.length === 0 || source.length !== target.length) return null;
  let sourceScale = 0;
  let targetScale = 0;
  for (let index = 0; index < source.length; index += 1) {
    sourceScale = Math.max(sourceScale, Math.abs(source[index] ?? 0));
    targetScale = Math.max(targetScale, Math.abs(target[index] ?? 0));
  }
  if (sourceScale === 0 || targetScale === 0) return null;

  const sourceMean = source.reduce((sum, value) => sum + value / sourceScale, 0) / source.length;
  const targetMean = target.reduce((sum, value) => sum + value / targetScale, 0) / target.length;
  let covariance = 0;
  let sourceVariance = 0;
  let targetVariance = 0;
  for (let index = 0; index < source.length; index += 1) {
    const sourceDelta = (source[index] ?? 0) / sourceScale - sourceMean;
    const targetDelta = (target[index] ?? 0) / targetScale - targetMean;
    covariance += sourceDelta * targetDelta;
    sourceVariance += sourceDelta * sourceDelta;
    targetVariance += targetDelta * targetDelta;
  }
  if (sourceVariance === 0 || targetVariance === 0) return null;
  const denominator = Math.sqrt(sourceVariance) * Math.sqrt(targetVariance);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return covariance / denominator;
}

function normalizedMatrix(values: readonly (readonly number[])[]): number[][] {
  const total = values.reduce((outer, row) => outer + row.reduce((inner, value) => inner + value, 0), 0);
  return values.map((row) => row.map((value) => (total === 0 ? 0 : value / total)));
}

function categoricalCoefficient(matrix: readonly (readonly number[])[]): number | null {
  const normalized = normalizedMatrix(matrix);
  if (normalized.length === 0) return null;
  const rows = normalized.map((row) => row.reduce((sum, value) => sum + value, 0));
  const cols = normalized.map((_row, column) => normalized.reduce((sum, row) => sum + (row[column] ?? 0), 0));
  let trace = 0;
  let expected = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    trace += normalized[index]?.[index] ?? 0;
    expected += (rows[index] ?? 0) * (cols[index] ?? 0);
  }
  const denominator = 1 - expected;
  if (Math.abs(denominator) <= EPSILON) return null;
  return (trace - expected) / denominator;
}

function triangleCounts(view: NeighborView): number[] {
  const values = Array.from({ length: view.out.length }, () => 0);
  for (let first = 0; first < view.out.length; first += 1) {
    for (const second of view.out[first]!) {
      if (second <= first) continue;
      for (const third of view.out[second]!) {
        if (third <= second || !view.outSets[first]!.has(third)) continue;
        values[first] = (values[first] ?? 0) + 1;
        values[second] = (values[second] ?? 0) + 1;
        values[third] = (values[third] ?? 0) + 1;
      }
    }
  }
  return values;
}

function edgeWeight(view: NeighborView, tail: number, head: number): number {
  return view.outWeights[tail]?.get(head) ?? 0;
}

function maximumWeight(graph: SparseGraph): number {
  let maximum = 0;
  for (const weight of graph.csr.weights) maximum = Math.max(maximum, weight);
  return maximum > 0 ? maximum : 1;
}

function undirectedClustering(graph: SparseGraph, view: NeighborView, weighted: boolean): number[] {
  const trianglesByNode = weighted ? undefined : triangleCounts(view);
  const maximum = weighted ? maximumWeight(graph) : 1;
  return view.out.map((neighbors, node) => {
    const degree = neighbors.length;
    if (degree < 2) return 0;
    if (!weighted) return (2 * (trianglesByNode?.[node] ?? 0)) / (degree * (degree - 1));

    let strength = 0;
    for (let leftIndex = 0; leftIndex < neighbors.length; leftIndex += 1) {
      const left = neighbors[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < neighbors.length; rightIndex += 1) {
        const right = neighbors[rightIndex]!;
        if (!view.outSets[left]!.has(right)) continue;
        const leftWeight = edgeWeight(view, node, left) / maximum;
        const rightWeight = edgeWeight(view, node, right) / maximum;
        const closingWeight = edgeWeight(view, left, right) / maximum;
        strength += Math.cbrt(leftWeight * rightWeight * closingWeight);
      }
    }
    return (2 * strength) / (degree * (degree - 1));
  });
}

function intersectionContribution(
  left: ReadonlySet<number>,
  right: ReadonlySet<number>,
  contribution: (node: number) => number,
): number {
  let total = 0;
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  for (const node of smaller) if (larger.has(node)) total += contribution(node);
  return total;
}

function directedClustering(graph: SparseGraph, view: NeighborView, weighted: boolean): number[] {
  const maximum = weighted ? maximumWeight(graph) : 1;
  const normalizedWeight = (tail: number, head: number): number => (weighted ? edgeWeight(view, tail, head) / maximum : 1);

  return view.out.map((_neighbors, node) => {
    const predecessors = view.inSets[node]!;
    const successors = view.outSets[node]!;
    const totalDegree = predecessors.size + successors.size;
    let reciprocalDegree = 0;
    for (const neighbor of predecessors) if (successors.has(neighbor)) reciprocalDegree += 1;
    const denominator = 2 * (totalDegree * (totalDegree - 1) - 2 * reciprocalDegree);
    if (denominator <= 0) return 0;

    let directedTriangles = 0;
    for (const neighbor of predecessors) {
      const base = normalizedWeight(neighbor, node);
      directedTriangles += intersectionContribution(predecessors, view.inSets[neighbor]!, (third) => Math.cbrt(base * normalizedWeight(third, node) * normalizedWeight(third, neighbor)));
      directedTriangles += intersectionContribution(predecessors, view.outSets[neighbor]!, (third) => Math.cbrt(base * normalizedWeight(third, node) * normalizedWeight(neighbor, third)));
      directedTriangles += intersectionContribution(successors, view.inSets[neighbor]!, (third) => Math.cbrt(base * normalizedWeight(node, third) * normalizedWeight(third, neighbor)));
      directedTriangles += intersectionContribution(successors, view.outSets[neighbor]!, (third) => Math.cbrt(base * normalizedWeight(node, third) * normalizedWeight(neighbor, third)));
    }
    for (const neighbor of successors) {
      const base = normalizedWeight(node, neighbor);
      directedTriangles += intersectionContribution(predecessors, view.inSets[neighbor]!, (third) => Math.cbrt(base * normalizedWeight(third, node) * normalizedWeight(third, neighbor)));
      directedTriangles += intersectionContribution(predecessors, view.outSets[neighbor]!, (third) => Math.cbrt(base * normalizedWeight(third, node) * normalizedWeight(neighbor, third)));
      directedTriangles += intersectionContribution(successors, view.inSets[neighbor]!, (third) => Math.cbrt(base * normalizedWeight(node, third) * normalizedWeight(third, neighbor)));
      directedTriangles += intersectionContribution(successors, view.outSets[neighbor]!, (third) => Math.cbrt(base * normalizedWeight(node, third) * normalizedWeight(neighbor, third)));
    }
    return directedTriangles / denominator;
  });
}

function nodeAttributes(graph: SparseGraph): readonly Readonly<Record<string, unknown>>[] {
  if (graph.nodeAttributes.length !== graph.nodeIds.length) throw new RangeError("node attributes are malformed");
  return graph.nodeAttributes;
}

function categoricalValues(graph: SparseGraph, attribute: string): Array<string | number> {
  if (attribute.length === 0) throw new RangeError("attribute name must not be empty");
  return nodeAttributes(graph).map((attributes, node) => {
    const value = attributes[attribute];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new TypeError(`attribute ${attribute} for node ${String(graph.nodeIds[node])} must be a string or number`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new RangeError(`attribute ${attribute} for node ${String(graph.nodeIds[node])} must be finite`);
    }
    return value;
  });
}

function numericValues(graph: SparseGraph, attribute: string): number[] {
  if (attribute.length === 0) throw new RangeError("attribute name must not be empty");
  return nodeAttributes(graph).map((attributes, node) => {
    const value = attributes[attribute];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`attribute ${attribute} for node ${String(graph.nodeIds[node])} must be a finite number`);
    }
    return value;
  });
}

function stableLabels(values: readonly (string | number)[]): Array<string | number> {
  const labels: Array<string | number> = [];
  const seen = new Set<string | number>();
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    labels.push(value);
  }
  return labels;
}

function mixingMatrixFromValues(
  graph: SparseGraph,
  sourceValues: readonly (string | number)[],
  targetValues: readonly (string | number)[],
  labels: readonly (string | number)[],
): number[][] {
  const index = new Map(labels.map((label, position) => [label, position] as const));
  const matrix = Array.from({ length: labels.length }, () => Array.from({ length: labels.length }, () => 0));
  for (let tail = 0; tail < graph.nodeIds.length; tail += 1) {
    const start = graph.csr.offsets[tail] ?? 0;
    const end = graph.csr.offsets[tail + 1] ?? start;
    for (let cursor = start; cursor < end; cursor += 1) {
      const head = graph.csr.indices[cursor];
      if (head === undefined) continue;
      const row = index.get(sourceValues[tail]!);
      const column = index.get(targetValues[head]!);
      if (row === undefined || column === undefined) continue;
      matrix[row]![column] = (matrix[row]?.[column] ?? 0) + 1;
    }
  }
  return matrix;
}

interface MutualWeights {
  readonly sumNormalized: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly maxNormalized: ReadonlyArray<ReadonlyMap<number, number>>;
}

function normalizedMutualWeights(graph: SparseGraph, view: NeighborView, weighted: boolean): MutualWeights {
  const raw = view.all.map((_neighbors, node) => {
    const values = new Map<number, number>();
    for (const neighbor of view.all[node]!) {
      const forward = view.outWeights[node]?.has(neighbor) ? (weighted ? edgeWeight(view, node, neighbor) : 1) : 0;
      const reverse = view.outWeights[neighbor]?.has(node) ? (weighted ? edgeWeight(view, neighbor, node) : 1) : 0;
      values.set(neighbor, forward + reverse);
    }
    return values;
  });

  const sumNormalized = raw.map((weights) => {
    const scale = Array.from(weights.values()).reduce((sum, value) => sum + value, 0);
    return new Map(Array.from(weights, ([node, value]) => [node, scale === 0 ? 0 : value / scale] as const));
  });
  const maxNormalized = raw.map((weights) => {
    const scale = Math.max(0, ...weights.values());
    return new Map(Array.from(weights, ([node, value]) => [node, scale === 0 ? 0 : value / scale] as const));
  });
  return { sumNormalized, maxNormalized };
}

/** Number of undirected triangles incident to each node. Self-loops are ignored. */
export function triangles(input: ModernGraphInput): NodeScoreResult {
  const graph = prepareGraph(input, "triangles");
  requireUndirected(graph, "triangles");
  const view = buildNeighborView(graph);
  return {
    nodes: [...graph.nodeIds],
    values: triangleCounts(view),
    meta: analysisMeta(graph, "triangles", false, "binary"),
  };
}

/** NetworkX-compatible local clustering coefficients. */
export function clusteringCoefficient(input: ModernGraphInput, options: WeightedStatisticOptions = {}): NodeScoreResult {
  const graph = prepareGraph(input, "clusteringCoefficient");
  const weighted = options.weighted ?? false;
  const view = buildNeighborView(graph);
  const values = graph.directed ? directedClustering(graph, view, weighted) : undirectedClustering(graph, view, weighted);
  return {
    nodes: [...graph.nodeIds],
    values,
    meta: analysisMeta(graph, "clusteringCoefficient", weighted, weighted ? "strength" : "binary"),
  };
}

/** Mean of local clustering coefficients, including zeros by default. */
export function averageClustering(input: ModernGraphInput, options: AverageClusteringOptions = {}): ScalarStatisticResult {
  const result = clusteringCoefficient(input, options);
  const countZeros = options.countZeros ?? true;
  const included = countZeros ? result.values : result.values.filter((value) => Math.abs(value) > 0);
  const warnings = included.length === 0 ? ["average is undefined because no coefficients were selected"] : [];
  return {
    value: included.length === 0 ? null : included.reduce((sum, value) => sum + value, 0) / included.length,
    meta: { ...result.meta, algorithm: "averageClustering", warnings },
  };
}

/** Pearson degree assortativity over edge endpoint degree pairs. */
export function degreeAssortativity(input: ModernGraphInput, options: DegreeAssortativityOptions = {}): ScalarStatisticResult {
  const graph = prepareGraph(input, "degreeAssortativity");
  const weighted = options.weighted ?? false;
  const [sourceMode, targetMode] = resolveDegreeModes(graph, options);
  const samples = endpointSamples(graph, degreeValues(graph, sourceMode, weighted), degreeValues(graph, targetMode, weighted));
  const value = pearson(samples.source, samples.target);
  return {
    value,
    meta: analysisMeta(
      graph,
      "degreeAssortativity",
      weighted,
      weighted ? "strength" : "binary",
      value === null ? ["assortativity is undefined for an empty edge set or zero-variance endpoint degrees"] : [],
    ),
  };
}

/** Newman categorical assortativity for a node attribute. */
export function categoricalAssortativity(input: ModernGraphInput, attribute: string): ScalarStatisticResult {
  const graph = prepareGraph(input, "categoricalAssortativity");
  const values = categoricalValues(graph, attribute);
  const labels = stableLabels(values);
  const coefficient = categoricalCoefficient(mixingMatrixFromValues(graph, values, values, labels));
  return {
    value: coefficient,
    meta: analysisMeta(
      graph,
      "categoricalAssortativity",
      false,
      "binary",
      coefficient === null ? ["assortativity is undefined for an empty edge set or a single observed category"] : [],
    ),
  };
}

/** Pearson assortativity for a finite numeric node attribute. */
export function numericAssortativity(input: ModernGraphInput, attribute: string): ScalarStatisticResult {
  const graph = prepareGraph(input, "numericAssortativity");
  const values = numericValues(graph, attribute);
  const samples = endpointSamples(graph, values, values);
  const coefficient = pearson(samples.source, samples.target);
  return {
    value: coefficient,
    meta: analysisMeta(
      graph,
      "numericAssortativity",
      false,
      "binary",
      coefficient === null ? ["assortativity is undefined for an empty edge set or zero-variance endpoint attributes"] : [],
    ),
  };
}

/** Stable degree mixing matrix, normalized to probabilities by default. */
export function degreeMixingMatrix(input: ModernGraphInput, options: DegreeAssortativityOptions & MixingMatrixOptions = {}): MixingMatrixResult {
  const graph = prepareGraph(input, "degreeMixingMatrix");
  const weighted = options.weighted ?? false;
  const [sourceMode, targetMode] = resolveDegreeModes(graph, options);
  const source = degreeValues(graph, sourceMode, weighted);
  const target = degreeValues(graph, targetMode, weighted);
  const labels = Array.from(new Set([...source, ...target])).sort((a, b) => a - b);
  const raw = mixingMatrixFromValues(graph, source, target, labels);
  return {
    labels,
    values: options.normalized === false ? raw : normalizedMatrix(raw),
    meta: analysisMeta(graph, "degreeMixingMatrix", weighted, weighted ? "strength" : "binary"),
  };
}

/** Stable categorical attribute mixing matrix, normalized to probabilities by default. */
export function attributeMixingMatrix(input: ModernGraphInput, attribute: string, options: MixingMatrixOptions = {}): MixingMatrixResult {
  const graph = prepareGraph(input, "attributeMixingMatrix");
  const values = categoricalValues(graph, attribute);
  const labels = stableLabels(values);
  const raw = mixingMatrixFromValues(graph, values, values, labels);
  return {
    labels,
    values: options.normalized === false ? raw : normalizedMatrix(raw),
    meta: analysisMeta(graph, "attributeMixingMatrix", false, "binary"),
  };
}

/** Burt constraint. Directed graphs use the union of predecessors and successors. */
export function constraint(input: ModernGraphInput, options: WeightedStatisticOptions = {}): NullableNodeScoreResult {
  const graph = prepareGraph(input, "constraint");
  const weighted = options.weighted ?? false;
  const view = buildNeighborView(graph);
  const mutual = normalizedMutualWeights(graph, view, weighted);
  let undefinedCount = 0;
  const values = view.all.map((neighbors, node) => {
    if (neighbors.length === 0) {
      undefinedCount += 1;
      return null;
    }
    let total = 0;
    for (const neighbor of neighbors) {
      const direct = mutual.sumNormalized[node]?.get(neighbor) ?? 0;
      let indirect = 0;
      for (const intermediary of neighbors) {
        indirect += (mutual.sumNormalized[node]?.get(intermediary) ?? 0) * (mutual.sumNormalized[intermediary]?.get(neighbor) ?? 0);
      }
      total += (direct + indirect) ** 2;
    }
    return total;
  });
  return {
    nodes: [...graph.nodeIds],
    values,
    meta: analysisMeta(graph, "constraint", weighted, weighted ? "strength" : "binary", undefinedCount > 0 ? [`constraint is undefined for ${undefinedCount} isolated node(s); values are null`] : []),
  };
}

/** Burt effective size. Directed graphs use the union of predecessors and successors. */
export function effectiveSize(input: ModernGraphInput, options: WeightedStatisticOptions = {}): NullableNodeScoreResult {
  const graph = prepareGraph(input, "effectiveSize");
  const weighted = options.weighted ?? false;
  const view = buildNeighborView(graph);
  const mutual = normalizedMutualWeights(graph, view, weighted);
  let undefinedCount = 0;
  const values = view.all.map((neighbors, node) => {
    if (neighbors.length === 0) {
      undefinedCount += 1;
      return null;
    }
    let total = 0;
    for (const neighbor of neighbors) {
      let redundancy = 0;
      for (const intermediary of neighbors) {
        redundancy += (mutual.sumNormalized[node]?.get(intermediary) ?? 0) * (mutual.maxNormalized[neighbor]?.get(intermediary) ?? 0);
      }
      total += 1 - redundancy;
    }
    return total;
  });
  return {
    nodes: [...graph.nodeIds],
    values,
    meta: analysisMeta(graph, "effectiveSize", weighted, weighted ? "strength" : "binary", undefinedCount > 0 ? [`effective size is undefined for ${undefinedCount} isolated node(s); values are null`] : []),
  };
}
