// Ported from R sna 2.8: R/gli.R (`triad.census`, `triad.classify`) and src/triads.c.
import { makeDenseGraph } from "../core/graph";
import type { DenseGraph, GraphInput, GraphOptions } from "../core/types";

export const DIRECTED_TRIAD_CLASSES = [
  "003",
  "012",
  "102",
  "021D",
  "021U",
  "021C",
  "111D",
  "111U",
  "030T",
  "030C",
  "201",
  "120D",
  "120U",
  "120C",
  "210",
  "300",
] as const;

export type DirectedTriadClass = (typeof DIRECTED_TRIAD_CLASSES)[number];
export type UndirectedTriadClass = 0 | 1 | 2 | 3;
export type TriadClass = DirectedTriadClass | UndirectedTriadClass;
export type TriadVertices = readonly [number, number, number];

export type DirectedTriadCensusResult = {
  readonly [K in DirectedTriadClass]: number;
};

export interface UndirectedTriadCensusResult {
  readonly 0: number;
  readonly 1: number;
  readonly 2: number;
  readonly 3: number;
}

export type TriadCensusResult = DirectedTriadCensusResult | UndirectedTriadCensusResult;
export type TriadOptions = GraphOptions;

type MutableDirectedTriadCensusResult = {
  [K in DirectedTriadClass]: number;
};

interface MutableUndirectedTriadCensusResult {
  0: number;
  1: number;
  2: number;
  3: number;
}

export function triadClassify(
  input: GraphInput,
  triad: TriadVertices,
  options: TriadOptions & { readonly mode: "graph" },
): UndirectedTriadClass | null;
export function triadClassify(
  input: GraphInput,
  triad?: TriadVertices,
  options?: TriadOptions & { readonly mode?: "digraph" },
): DirectedTriadClass | null;
export function triadClassify(input: GraphInput, triad?: TriadVertices, options?: TriadOptions): TriadClass | null;
export function triadClassify(input: GraphInput, triad: TriadVertices = [0, 1, 2], options: TriadOptions = {}): TriadClass | null {
  const graph = makeDenseGraph(input, { ...options, diag: false });
  const [i, j, k] = triad;
  assertTriadVertices(graph, i, j, k);

  const classIndex = triadClassifyIndex(graph, i, j, k);
  if (classIndex === null) return null;
  return graph.directed ? DIRECTED_TRIAD_CLASSES[classIndex]! : (classIndex as UndirectedTriadClass);
}

export function triadCensus(input: GraphInput, options: TriadOptions & { readonly mode: "graph" }): UndirectedTriadCensusResult;
export function triadCensus(input: GraphInput, options?: TriadOptions & { readonly mode?: "digraph" }): DirectedTriadCensusResult;
export function triadCensus(input: GraphInput, options?: TriadOptions): TriadCensusResult;
export function triadCensus(input: GraphInput, options: TriadOptions = {}): TriadCensusResult {
  const graph = makeDenseGraph(input, { ...options, diag: false });

  if (graph.directed) {
    const out = emptyDirectedTriadCensus();
    forEachTriad(graph, (i, j, k) => {
      const classIndex = triadClassifyIndex(graph, i, j, k);
      if (classIndex !== null) out[DIRECTED_TRIAD_CLASSES[classIndex]!] += 1;
    });
    return out;
  }

  const out = emptyUndirectedTriadCensus();
  forEachTriad(graph, (i, j, k) => {
    const classIndex = triadClassifyIndex(graph, i, j, k);
    if (classIndex !== null) out[classIndex as UndirectedTriadClass] += 1;
  });
  return out;
}

function forEachTriad(graph: DenseGraph, visit: (i: number, j: number, k: number) => void): void {
  for (let i = 0; i < graph.order; i += 1) {
    for (let j = i + 1; j < graph.order; j += 1) {
      for (let k = j + 1; k < graph.order; k += 1) visit(i, j, k);
    }
  }
}

function emptyDirectedTriadCensus(): MutableDirectedTriadCensusResult {
  const out = {} as Record<DirectedTriadClass, number>;
  for (const className of DIRECTED_TRIAD_CLASSES) out[className] = 0;
  return out;
}

function emptyUndirectedTriadCensus(): MutableUndirectedTriadCensusResult {
  return { 0: 0, 1: 0, 2: 0, 3: 0 };
}

function triadClassifyIndex(graph: DenseGraph, i: number, j: number, k: number): number | null {
  if (!graph.directed) {
    if (undirectedMissing(graph, i, j) || undirectedMissing(graph, j, k) || undirectedMissing(graph, i, k)) return null;
    return undirectedTie(graph, i, j) + undirectedTie(graph, j, k) + undirectedTie(graph, i, k);
  }

  if (
    isMissing(graph, i, j) ||
    isMissing(graph, j, i) ||
    isMissing(graph, j, k) ||
    isMissing(graph, k, j) ||
    isMissing(graph, i, k) ||
    isMissing(graph, k, i)
  ) {
    return null;
  }

  const sij = adjacencyValue(graph, i, j);
  const sji = adjacencyValue(graph, j, i);
  const sjk = adjacencyValue(graph, j, k);
  const skj = adjacencyValue(graph, k, j);
  const sik = adjacencyValue(graph, i, k);
  const ski = adjacencyValue(graph, k, i);

  const mutual = sij * sji + sjk * skj + sik * ski;
  const nullDyads = (sij + sji === 0 ? 1 : 0) + (sjk + skj === 0 ? 1 : 0) + (sik + ski === 0 ? 1 : 0);
  const asymmetric = 3 - mutual - nullDyads;

  if (nullDyads === 3) return 0;
  if (asymmetric === 1 && nullDyads === 2) return 1;
  if (mutual === 1 && nullDyads === 2) return 2;
  if (asymmetric === 2 && nullDyads === 1) {
    if (sij + sik === 2) return 3;
    if (sji + sjk === 2) return 3;
    if (ski + skj === 2) return 3;
    if (sji + ski === 2) return 4;
    if (sij + skj === 2) return 4;
    if (sik + sjk === 2) return 4;
    return 5;
  }
  if (mutual === 1 && nullDyads === 1) {
    const iIncoming = sji + ski;
    if (iIncoming === 0 || iIncoming === 2) return 6;
    const jIncoming = sij + skj;
    if (jIncoming === 0 || jIncoming === 2) return 6;
    return 7;
  }
  if (asymmetric === 3) {
    const iIncoming = sji + ski;
    if (iIncoming === 0 || iIncoming === 2) return 8;
    const jIncoming = sij + skj;
    if (jIncoming === 0 || jIncoming === 2) return 8;
    return 9;
  }
  if (mutual === 2 && nullDyads === 1) return 10;
  if (mutual === 1 && asymmetric === 2) {
    if (sji + ski === 0) return 11;
    if (sij + skj === 0) return 11;
    if (sik + sjk === 0) return 11;
    if (sij + sik === 0) return 12;
    if (sji + sjk === 0) return 12;
    if (ski + skj === 0) return 12;
    return 13;
  }
  if (mutual === 2 && asymmetric === 1) return 14;
  return 15;
}

function assertTriadVertices(graph: DenseGraph, i: number, j: number, k: number): void {
  for (const vertex of [i, j, k]) {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= graph.order) {
      throw new RangeError("triad vertices must be distinct zero-based indices within graph order");
    }
  }
  if (i === j || i === k || j === k) {
    throw new RangeError("triad vertices must be distinct zero-based indices within graph order");
  }
}

function undirectedTie(graph: DenseGraph, a: number, b: number): 0 | 1 {
  return adjacencyValue(graph, a, b) || adjacencyValue(graph, b, a) ? 1 : 0;
}

function undirectedMissing(graph: DenseGraph, a: number, b: number): boolean {
  return isMissing(graph, a, b) || isMissing(graph, b, a);
}

function isMissing(graph: DenseGraph, tail: number, head: number): boolean {
  return graph.missing?.[tail * graph.order + head] === 1;
}

function adjacencyValue(graph: DenseGraph, tail: number, head: number): 0 | 1 {
  return graph.adjacency[tail * graph.order + head] === 1 ? 1 : 0;
}
