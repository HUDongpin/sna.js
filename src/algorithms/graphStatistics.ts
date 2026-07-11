import { makeDenseGraph } from "../core/graph";
import type { DenseGraph, GraphInput, GraphOptions } from "../core/types";

export interface DyadCensusOptions extends GraphOptions {}

export interface DyadCensusResult {
  readonly mutual: number;
  readonly asymmetric: number;
  readonly nullDyads: number;
  readonly missingDyads: number;
}

export type ReciprocityMeasure = "dyadic" | "dyadic.nonnull" | "edgewise" | "edgewise.lrr" | "correlation";

export interface ReciprocityOptions extends GraphOptions {
  readonly measure?: ReciprocityMeasure;
}

export type TransitivityMeasure = "weak" | "strong" | "weakcensus" | "strongcensus" | "rank" | "correlation";

export interface TransitivityOptions extends GraphOptions {
  readonly measure?: TransitivityMeasure;
  readonly useAdjacency?: boolean;
}

export interface EfficiencyOptions extends GraphOptions {}

export type HierarchyMeasure = "reciprocity" | "krackhardt";

export interface HierarchyOptions extends GraphOptions {
  readonly measure?: HierarchyMeasure;
}

export interface LubnessOptions extends GraphOptions {}

export function dyadCensus(input: GraphInput, options: DyadCensusOptions = {}): DyadCensusResult {
  const graph = makeDenseGraph(input, { ...options, diag: false });
  const n = graph.order;
  let mutual = 0;
  let asymmetric = 0;
  let missingDyads = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (isMissing(graph, i, j) || isMissing(graph, j, i)) {
        missingDyads += 1;
        continue;
      }
      const forward = graph.adjacency[i * n + j] === 1;
      const reverse = graph.adjacency[j * n + i] === 1;
      if (forward && reverse) mutual += 1;
      else if (forward || reverse) asymmetric += 1;
    }
  }

  return { mutual, asymmetric, nullDyads: (n * (n - 1)) / 2 - mutual - asymmetric - missingDyads, missingDyads };
}

export function mutuality(input: GraphInput, options: DyadCensusOptions = {}): number {
  return dyadCensus(input, options).mutual;
}

export function grecip(input: GraphInput, options: ReciprocityOptions = {}): number {
  const measure = options.measure ?? "dyadic";
  if (measure === "correlation") return correlationReciprocity(input, options);

  const census = dyadCensus(input, options);
  switch (measure) {
    case "dyadic":
      return (census.mutual + census.nullDyads) / (census.mutual + census.asymmetric + census.nullDyads);
    case "dyadic.nonnull":
      return census.mutual / (census.mutual + census.asymmetric);
    case "edgewise":
      return (2 * census.mutual) / (2 * census.mutual + census.asymmetric);
    case "edgewise.lrr":
      return Math.log((census.mutual * (census.mutual + census.asymmetric + census.nullDyads)) / (census.mutual + census.asymmetric / 2) ** 2);
  }
}

export function connectedness(input: GraphInput, options: GraphOptions = {}): number {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  if (n <= 1) return 1;

  const sizes = weakComponentSizes(graph);
  const connectedDyads = sizes.reduce((sum, size) => sum + (size * (size - 1)) / 2, 0);
  return connectedDyads / ((n * (n - 1)) / 2);
}

export function efficiency(input: GraphInput, options: EfficiencyOptions = {}): number {
  const graph = makeDenseGraph(input, options);
  const componentSizes = weakComponentSizes(graph);
  const requiredEdges = componentSizes.reduce((sum, size) => sum + size - 1, 0);
  const maxViolations = componentSizes.reduce((sum, size) => sum + size * (size - (graph.loops ? 0 : 1)) - (size - 1), 0);
  const edgeCount = sumKnownEdgeWeights(graph, graph.loops);
  return 1 - (edgeCount - requiredEdges) / maxViolations;
}

export function hierarchy(input: GraphInput, options: HierarchyOptions = {}): number {
  const measure = options.measure ?? "reciprocity";
  if (measure === "reciprocity") return 1 - grecip(input, { ...options, measure: "dyadic" });

  const reachGraph = reachabilityGraph(makeDenseGraph(input, options));
  return 1 - grecip(reachGraph, { measure: "dyadic.nonnull" });
}

export function lubness(input: GraphInput, options: LubnessOptions = {}): number {
  const graph = makeDenseGraph(input, options);
  const reach = reachabilityGraph(graph);
  const components = weakComponentMembers(graph);
  let violations = 0;
  let maxViolations = 0;

  for (const component of components) {
    if (component.length <= 2) continue;
    maxViolations += ((component.length - 1) * (component.length - 2)) / 2;
    for (let leftIndex = 0; leftIndex < component.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < component.length; rightIndex += 1) {
        const left = component[leftIndex]!;
        const right = component[rightIndex]!;
        const upperBounds = component.filter((candidate) => reach[candidate]![left] && reach[candidate]![right]);
        let hasLeastUpperBound = false;
        for (const candidate of upperBounds) {
          let reachesEveryUpperBound = true;
          for (const upperBound of upperBounds) {
            if (!reach[candidate]![upperBound]) {
              reachesEveryUpperBound = false;
              break;
            }
          }
          if (reachesEveryUpperBound) {
            hasLeastUpperBound = true;
            break;
          }
        }
        if (!hasLeastUpperBound) violations += 1;
      }
    }
  }

  return 1 - violations / maxViolations;
}

export function gtrans(input: GraphInput, options: TransitivityOptions = {}): number {
  const measure = options.measure ?? "weak";
  const graph = makeDenseGraph(input, options);

  switch (measure) {
    case "strong":
      return nanToOne(strongTransitivity(graph, false));
    case "strongcensus":
      return strongTransitivity(graph, true);
    case "weak":
      return nanToOne(weakTransitivity(graph, false));
    case "weakcensus":
      return weakTransitivity(graph, true);
    case "rank":
      return nanToOne(rankTransitivity(graph));
    case "correlation":
      return nanToOne(correlationTransitivity(graph));
  }
}

function weakComponentSizes(graph: DenseGraph): number[] {
  return weakComponentMembers(graph).map((component) => component.length);
}

function weakComponentMembers(graph: DenseGraph): number[][] {
  const n = graph.order;
  const labels = new Int32Array(n);
  labels.fill(-1);
  const components: number[][] = [];
  let component = 0;

  for (let start = 0; start < n; start += 1) {
    if (labels[start] !== -1) continue;
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    const members: number[] = [];
    labels[start] = component;
    queue[tail] = start;
    tail += 1;

    while (head < tail) {
      const vertex = queue[head]!;
      head += 1;
      members.push(vertex);
      for (let other = 0; other < n; other += 1) {
        if (labels[other] !== -1) continue;
        if (!adjacencyValue(graph, vertex, other) && !adjacencyValue(graph, other, vertex)) continue;
        labels[other] = component;
        queue[tail] = other;
        tail += 1;
      }
    }

    components.push(members);
    component += 1;
  }

  return components;
}

function sumKnownEdgeWeights(graph: DenseGraph, includeLoops: boolean): number {
  let sum = 0;
  for (let i = 0; i < graph.order; i += 1) {
    for (let j = 0; j < graph.order; j += 1) {
      if (!includeLoops && i === j) continue;
      if (isMissing(graph, i, j)) continue;
      sum += graph.weights[i * graph.order + j] ?? 0;
    }
  }
  return sum;
}

function reachabilityGraph(graph: DenseGraph): number[][] {
  const n = graph.order;
  const out = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));

  for (let source = 0; source < n; source += 1) {
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    out[source]![source] = 1;
    queue[tail] = source;
    tail += 1;

    while (head < tail) {
      const vertex = queue[head]!;
      head += 1;
      for (let target = 0; target < n; target += 1) {
        if (out[source]![target] || !adjacencyValue(graph, vertex, target)) continue;
        out[source]![target] = 1;
        queue[tail] = target;
        tail += 1;
      }
    }
  }

  return out;
}

function correlationReciprocity(input: GraphInput, options: ReciprocityOptions): number {
  const graph = makeDenseGraph(input, { ...options, diag: false });
  const n = graph.order;
  if (n < 2) return Number.NaN;

  if (n === 2) {
    if (isMissing(graph, 0, 1) || isMissing(graph, 1, 0)) return Number.NaN;
    const forward = graph.weights[1]!;
    const reverse = graph.weights[2]!;
    if (forward === 0 && reverse === 0) return 1;
    if (forward === 0 || reverse === 0) return 0;
    return forward === reverse ? 1 : 0;
  }

  const nonmissingEdgeValues: number[] = [];
  let explicitEdgeCount = 0;
  let missingEdgeCount = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      if (isMissing(graph, i, j)) {
        explicitEdgeCount += 1;
        missingEdgeCount += 1;
      } else if (graph.weights[i * n + j] !== 0) {
        explicitEdgeCount += 1;
        nonmissingEdgeValues.push(graph.weights[i * n + j]!);
      }
    }
  }

  const dyadCount = (n * (n - 1)) / 2;
  const edgeCount = dyadCount * 2;
  const mean = nonmissingEdgeValues.reduce((sum, value) => sum + value, 0) / (edgeCount - missingEdgeCount);
  let varianceNumerator = 0;
  for (const value of nonmissingEdgeValues) varianceNumerator += (value - mean) ** 2;
  varianceNumerator += (edgeCount - explicitEdgeCount) * mean ** 2;
  const variance = varianceNumerator / (edgeCount - missingEdgeCount - 1);
  if (variance === 0) return 1;

  let dyadProductSum = 0;
  let observedDyads = 0;
  let missingDyads = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const forwardExplicit = isMissing(graph, i, j) || graph.weights[i * n + j] !== 0;
      const reverseExplicit = isMissing(graph, j, i) || graph.weights[j * n + i] !== 0;
      if (forwardExplicit && reverseExplicit) {
        if (isMissing(graph, i, j) || isMissing(graph, j, i)) missingDyads += 1;
        else {
          dyadProductSum += (graph.weights[i * n + j]! - mean) * (graph.weights[j * n + i]! - mean);
          observedDyads += 1;
        }
      } else if (forwardExplicit || reverseExplicit) {
        const tail = forwardExplicit ? i : j;
        const head = forwardExplicit ? j : i;
        if (isMissing(graph, tail, head)) missingDyads += 1;
        else {
          dyadProductSum -= mean * (graph.weights[tail * n + head]! - mean);
          observedDyads += 1;
        }
      }
    }
  }

  return (2 * (dyadProductSum + mean ** 2 * (dyadCount - observedDyads - missingDyads))) / ((2 * dyadCount - 2 * missingDyads - 1) * variance);
}

function strongTransitivity(graph: DenseGraph, census: boolean): number {
  const n = graph.order;
  let satisfied = 0;
  let atRisk = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      for (let k = 0; k < n; k += 1) {
        if (j === k || i === k) continue;
        if (isMissing(graph, i, j) || isMissing(graph, j, k) || isMissing(graph, i, k)) continue;
        const first = adjacencyValue(graph, i, j);
        const second = adjacencyValue(graph, j, k);
        const shortcut = adjacencyValue(graph, i, k);
        satisfied += first * second * shortcut + (1 - first * second) * (1 - shortcut);
        atRisk += 1;
      }
    }
  }

  return census ? satisfied : satisfied / atRisk;
}

function weakTransitivity(graph: DenseGraph, census: boolean): number {
  const n = graph.order;
  let satisfied = 0;
  let atRisk = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j || isMissing(graph, i, j) || !adjacencyValue(graph, i, j)) continue;
      for (let k = 0; k < n; k += 1) {
        if (j === k || i === k || isMissing(graph, j, k) || !adjacencyValue(graph, j, k)) continue;
        if (isMissing(graph, i, k)) continue;
        satisfied += adjacencyValue(graph, i, k);
        atRisk += 1;
      }
    }
  }

  return census ? satisfied : satisfied / atRisk;
}

function rankTransitivity(graph: DenseGraph): number {
  const n = graph.order;
  let satisfied = 0;
  let atRisk = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j || isMissing(graph, i, j) || !adjacencyValue(graph, i, j)) continue;
      for (let k = 0; k < n; k += 1) {
        if (j === k || i === k || isMissing(graph, j, k) || !adjacencyValue(graph, j, k) || isMissing(graph, i, k)) continue;
        const shortcut = adjacencyValue(graph, i, k) ? graph.weights[i * n + k]! : 0;
        if (shortcut >= Math.min(graph.weights[i * n + j]!, graph.weights[j * n + k]!)) satisfied += 1;
        atRisk += 1;
      }
    }
  }

  return satisfied / atRisk;
}

function correlationTransitivity(graph: DenseGraph): number {
  const matrix = nullableWeightsMatrix(graph);
  const squared = squareNullableMatrix(matrix);
  const x: number[] = [];
  const y: number[] = [];

  for (let i = 0; i < graph.order; i += 1) {
    for (let j = 0; j < graph.order; j += 1) {
      if (!graph.loops && i === j) continue;
      const value = matrix[i]![j];
      const squaredValue = squared[i]![j];
      if (value === undefined || squaredValue === undefined) continue;
      x.push(value);
      y.push(squaredValue);
    }
  }

  return pearsonCorrelation(x, y);
}

function nullableWeightsMatrix(graph: DenseGraph): Array<Array<number | undefined>> {
  const n = graph.order;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_unused, j) => (isMissing(graph, i, j) ? undefined : (graph.weights[i * n + j] ?? 0))),
  );
}

function squareNullableMatrix(matrix: ReadonlyArray<ReadonlyArray<number | undefined>>): Array<Array<number | undefined>> {
  const n = matrix.length;
  const out: Array<Array<number | undefined>> = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < n; k += 1) {
      let sum = 0;
      let missing = false;
      for (let j = 0; j < n; j += 1) {
        const left = matrix[i]![j];
        const right = matrix[j]![k];
        if (left === undefined || right === undefined) {
          missing = true;
          break;
        }
        sum += left * right;
      }
      out[i]![k] = missing ? undefined : sum;
    }
  }
  return out;
}

function pearsonCorrelation(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length) throw new RangeError("correlation vectors must have the same length");
  if (x.length === 0) return Number.NaN;

  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  let ssX = 0;
  let ssY = 0;
  let ssXY = 0;

  for (let i = 0; i < x.length; i += 1) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    ssX += dx * dx;
    ssY += dy * dy;
    ssXY += dx * dy;
  }

  if (ssX === 0 || ssY === 0) return x.every((value, index) => value === y[index]) ? 1 : 0;
  return ssXY / Math.sqrt(ssX * ssY);
}

function nanToOne(value: number): number {
  return Number.isNaN(value) ? 1 : value;
}

function isMissing(graph: DenseGraph, tail: number, head: number): boolean {
  return graph.missing?.[tail * graph.order + head] === 1;
}

function adjacencyValue(graph: DenseGraph, tail: number, head: number): 0 | 1 {
  return graph.adjacency[tail * graph.order + head] === 1 ? 1 : 0;
}
