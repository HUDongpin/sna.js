import { makeDenseGraph } from "../core/graph";
import type { DenseGraph, GraphInput, GraphOptions } from "../core/types";

export type IsolateOptions = GraphOptions;

export function isolates(input: GraphInput, options: IsolateOptions = {}): number[] {
  const graph = makeDenseGraph(input, options);
  const out: number[] = [];

  for (let vertex = 0; vertex < graph.order; vertex += 1) {
    if (isVertexIsolate(graph, vertex)) out.push(vertex);
  }

  return out;
}

export function isIsolate(input: GraphInput, ego: number, options?: IsolateOptions): boolean;
export function isIsolate(input: GraphInput, ego: readonly number[], options?: IsolateOptions): boolean[];
export function isIsolate(input: GraphInput, ego: number | readonly number[], options: IsolateOptions = {}): boolean | boolean[] {
  const graph = makeDenseGraph(input, options);

  if (typeof ego === "number") return isVertexIsolate(graph, ego);
  return ego.map((vertex) => isVertexIsolate(graph, vertex));
}

function isVertexIsolate(graph: DenseGraph, vertex: number): boolean {
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= graph.order) {
    throw new RangeError("ego is outside graph order");
  }

  const n = graph.order;
  for (let other = 0; other < n; other += 1) {
    if (!graph.loops && other === vertex) continue;
    if (graph.adjacency[vertex * n + other] || graph.adjacency[other * n + vertex]) return false;
  }

  return true;
}
