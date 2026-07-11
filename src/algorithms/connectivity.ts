import { makeDenseGraph } from "../core/graph";
import { createNumberMatrix } from "../core/matrix";
import type { DenseGraph, EdgeListInput, GeodistResult, GraphInput, GraphOptions } from "../core/types";

export type Connectedness = "strong" | "weak" | "unilateral" | "recursive";
export type NeighborhoodType = "in" | "out" | "total";

export interface ReachabilityOptions extends GraphOptions {
  readonly geodistPrecomp?: GeodistResult;
  readonly returnAsEdgeList?: boolean;
}

export interface NeighborhoodOptions extends GraphOptions {
  readonly neighborhoodType?: NeighborhoodType;
  readonly thresh?: number;
  readonly returnAll?: boolean;
  readonly partial?: boolean;
}

export interface ComponentDistOptions extends GraphOptions {
  readonly connected?: Connectedness;
}

export interface ComponentDistributionResult {
  readonly membership: number[];
  readonly csize: number[];
  readonly cdist: number[];
}

export interface ComponentLargestOptions extends ComponentDistOptions {
  readonly result?: "membership" | "graph";
  readonly returnAsEdgeList?: boolean;
}

type AdjacencyPredicate = (tail: number, head: number) => boolean;

export function reachability(input: GraphInput, options: ReachabilityOptions & { returnAsEdgeList: true }): EdgeListInput;
export function reachability(input: GraphInput, options?: ReachabilityOptions & { returnAsEdgeList?: false }): number[][];
export function reachability(input: GraphInput, options: ReachabilityOptions = {}): number[][] | EdgeListInput {
  const graph = makeDenseGraph(input, options);
  const matrix = options.geodistPrecomp ? reachabilityFromGeodist(options.geodistPrecomp, graph.order) : reachabilityFromGraph(graph);
  return options.returnAsEdgeList ? matrixToEdgeList(matrix) : matrix;
}

export function neighborhood(input: GraphInput, order: number, options: NeighborhoodOptions & { returnAll: true }): number[][][];
export function neighborhood(input: GraphInput, order: number, options?: NeighborhoodOptions & { returnAll?: false }): number[][];
export function neighborhood(input: GraphInput, order: number, options: NeighborhoodOptions = {}): number[][] | number[][][] {
  if (!Number.isInteger(order) || order < 0) throw new RangeError("order must be a non-negative integer");

  const graph = makeDenseGraph(input, { ...options, threshold: Number.NEGATIVE_INFINITY });
  const n = graph.order;
  const baseTie = neighborhoodTiePredicate(graph, options);
  const distances = allPairsUnweightedDistances(n, baseTie);
  const partial = options.partial ?? true;

  const matrixForOrder = (currentOrder: number): number[][] => {
    const out = createNumberMatrix(n, n);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (!graph.loops && i === j) continue;
        const distance = distances[i]![j]!;
        out[i]![j] = partial ? (distance === currentOrder ? 1 : 0) : distance <= currentOrder ? 1 : 0;
      }
    }
    return out;
  };

  if (options.returnAll) {
    const out: number[][][] = [];
    for (let currentOrder = 1; currentOrder <= order; currentOrder += 1) {
      out.push(matrixForOrder(currentOrder));
    }
    return out;
  }

  return matrixForOrder(order);
}

export function componentDist(input: GraphInput, options: ComponentDistOptions = {}): ComponentDistributionResult {
  const graph = makeDenseGraph(input, options);
  const connected = options.connected ?? "strong";
  const membership = componentMembership(graph, connected);
  return distributionFromMembership(membership);
}

export function componentLargest(input: GraphInput, options?: ComponentLargestOptions & { result?: "membership" }): boolean[];
export function componentLargest(input: GraphInput, options: ComponentLargestOptions & { result: "graph"; returnAsEdgeList: true }): EdgeListInput;
export function componentLargest(input: GraphInput, options: ComponentLargestOptions & { result: "graph"; returnAsEdgeList?: false }): number[][];
export function componentLargest(input: GraphInput, options: ComponentLargestOptions = {}): boolean[] | number[][] | EdgeListInput {
  const graph = makeDenseGraph(input, options);
  const distribution = componentDist(graph, options);
  const largestSize = distribution.csize.length === 0 ? 0 : Math.max(...distribution.csize);
  const keep = distribution.membership.map((label) => distribution.csize[label] === largestSize);

  if ((options.result ?? "membership") === "membership") return keep;

  const keptVertices = keep.flatMap((value, vertex) => (value ? [vertex] : []));
  return options.returnAsEdgeList ? inducedEdgeList(graph, keptVertices) : inducedMatrix(graph, keptVertices);
}

export function componentSizeByVertex(input: GraphInput, options: ComponentDistOptions = {}): number[] {
  const distribution = componentDist(input, options);
  return distribution.membership.map((label) => distribution.csize[label] ?? 0);
}

function reachabilityFromGeodist(geodistResult: GeodistResult, order: number): number[][] {
  if (geodistResult.counts.length !== order) throw new RangeError("geodistPrecomp order does not match input graph order");
  const out = createNumberMatrix(order, order);
  for (let i = 0; i < order; i += 1) {
    const row = geodistResult.counts[i];
    if (!row || row.length !== order) throw new RangeError("geodistPrecomp counts must be a square matrix matching input graph order");
    for (let j = 0; j < order; j += 1) {
      out[i]![j] = (row[j] ?? 0) > 0 ? 1 : 0;
    }
  }
  return out;
}

function reachabilityFromGraph(graph: DenseGraph): number[][] {
  const n = graph.order;
  const out = createNumberMatrix(n, n);
  const adjacency = adjacencyLists(n, (tail, head) => graph.adjacency[tail * n + head] === 1);

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
      for (const next of adjacency[vertex]!) {
        if (out[source]![next]) continue;
        out[source]![next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  }

  return out;
}

function neighborhoodTiePredicate(graph: DenseGraph, options: NeighborhoodOptions): AdjacencyPredicate {
  const n = graph.order;
  const threshold = options.thresh ?? options.threshold ?? 0;
  const type = !graph.directed ? "total" : (options.neighborhoodType ?? "in");
  const hasTie = (tail: number, head: number): boolean => graph.weights[tail * n + head]! > threshold;

  if (type === "out") return hasTie;
  if (type === "in") return (tail, head) => hasTie(head, tail);
  return (tail, head) => hasTie(tail, head) || hasTie(head, tail);
}

function allPairsUnweightedDistances(n: number, hasTie: AdjacencyPredicate): number[][] {
  const distances = createNumberMatrix(n, n, Number.POSITIVE_INFINITY);
  const adjacency = adjacencyLists(n, hasTie);

  for (let source = 0; source < n; source += 1) {
    const row = distances[source]!;
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    row[source] = 0;
    queue[tail] = source;
    tail += 1;

    while (head < tail) {
      const vertex = queue[head]!;
      head += 1;
      const nextDistance = row[vertex]! + 1;
      for (const next of adjacency[vertex]!) {
        if (row[next] !== Number.POSITIVE_INFINITY) continue;
        row[next] = nextDistance;
        queue[tail] = next;
        tail += 1;
      }
    }
  }

  return distances;
}

function componentMembership(graph: DenseGraph, connected: Connectedness): number[] {
  switch (connected) {
    case "weak":
      return componentLabels(graph.order, (tail, head) => graph.adjacency[tail * graph.order + head] === 1 || graph.adjacency[head * graph.order + tail] === 1);
    case "recursive":
      return componentLabels(graph.order, (tail, head) => graph.adjacency[tail * graph.order + head] === 1 && graph.adjacency[head * graph.order + tail] === 1);
    case "unilateral":
      return unilateralComponentLabels(reachabilityFromGraph(graph));
    case "strong":
    default:
      return strongComponentLabels(reachabilityFromGraph(graph));
  }
}

function componentLabels(n: number, adjacent: AdjacencyPredicate): number[] {
  const labels = Array.from({ length: n }, () => -1);
  let current = 0;

  for (let start = 0; start < n; start += 1) {
    if (labels[start] !== -1) continue;
    const queue = [start];
    labels[start] = current;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor]!;
      for (let other = 0; other < n; other += 1) {
        if (labels[other] !== -1 || !adjacent(vertex, other)) continue;
        labels[other] = current;
        queue.push(other);
      }
    }

    current += 1;
  }

  return labels;
}

function strongComponentLabels(reach: number[][]): number[] {
  const n = reach.length;
  const labels = Array.from({ length: n }, () => -1);
  let current = 0;

  for (let start = 0; start < n; start += 1) {
    if (labels[start] !== -1) continue;
    for (let vertex = start; vertex < n; vertex += 1) {
      if (labels[vertex] === -1 && reach[start]![vertex] && reach[vertex]![start]) labels[vertex] = current;
    }
    current += 1;
  }

  return labels;
}

function unilateralComponentLabels(reach: number[][]): number[] {
  const n = reach.length;
  const labels = Array.from({ length: n }, () => -1);
  let current = 0;

  for (let start = 0; start < n; start += 1) {
    if (labels[start] !== -1) continue;
    const queue = [start];
    const queued = new Uint8Array(n);
    queued[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor]!;
      labels[vertex] = current;
      for (let other = start + 1; other < n; other += 1) {
        if (queued[other] || !reach[vertex]![other]) continue;
        queued[other] = 1;
        queue.push(other);
      }
    }

    current += 1;
  }

  return labels;
}

function distributionFromMembership(membership: number[]): ComponentDistributionResult {
  const componentCount = membership.length === 0 ? 0 : Math.max(...membership) + 1;
  const csize = Array.from({ length: componentCount }, () => 0);
  for (const label of membership) {
    csize[label] = (csize[label] ?? 0) + 1;
  }

  const cdist = Array.from({ length: membership.length }, () => 0);
  for (const size of csize) {
    if (size > 0) cdist[size - 1] = (cdist[size - 1] ?? 0) + 1;
  }

  return { membership, csize, cdist };
}

function adjacencyLists(n: number, hasTie: AdjacencyPredicate): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let tail = 0; tail < n; tail += 1) {
    for (let head = 0; head < n; head += 1) {
      if (hasTie(tail, head)) out[tail]!.push(head);
    }
  }
  return out;
}

function matrixToEdgeList(matrix: number[][]): EdgeListInput {
  const edges: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = 0; j < matrix.length; j += 1) {
      if (matrix[i]![j]) edges.push([i, j, matrix[i]![j]!]);
    }
  }
  return { order: matrix.length, directed: true, edges };
}

function inducedMatrix(graph: DenseGraph, vertices: readonly number[]): number[][] {
  const out = createNumberMatrix(vertices.length, vertices.length);
  for (let i = 0; i < vertices.length; i += 1) {
    const source = vertices[i]!;
    for (let j = 0; j < vertices.length; j += 1) {
      const target = vertices[j]!;
      out[i]![j] = graph.weights[source * graph.order + target] ?? 0;
    }
  }
  return out;
}

function inducedEdgeList(graph: DenseGraph, vertices: readonly number[]): EdgeListInput {
  const position = new Map<number, number>();
  vertices.forEach((vertex, index) => position.set(vertex, index));
  const edges: Array<readonly [number, number, number]> = [];

  for (const source of vertices) {
    for (const target of vertices) {
      if (!graph.adjacency[source * graph.order + target]) continue;
      edges.push([position.get(source)!, position.get(target)!, graph.weights[source * graph.order + target] ?? 1]);
    }
  }

  return { order: vertices.length, directed: graph.directed, edges };
}
