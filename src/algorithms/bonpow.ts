import { makeDenseGraph } from "../core/graph";
import { solveLinearSystem } from "../core/linearAlgebra";
import { createNumberMatrix } from "../core/matrix";
import type { GraphInput, GraphOptions } from "../core/types";
import { selectNodes } from "./pathCentrality";

export interface BonpowOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly tmaxdev?: boolean;
  readonly exponent?: number;
  readonly rescale?: boolean;
  readonly tol?: number;
}

export function bonpow(input: GraphInput, options: BonpowOptions & { tmaxdev: true }): number;
export function bonpow(input: GraphInput, options?: BonpowOptions & { tmaxdev?: false }): number[];
export function bonpow(input: GraphInput, options: BonpowOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, { ...options, mode: "digraph", directed: true, symmetrize: false });
  const n = graph.order;

  if (options.tmaxdev) return options.mode === "graph" || options.directed === false ? (n - 2) * Math.sqrt(n / 2) : Math.sqrt(n) * (n - 1);
  if (n === 0) return [];

  const exponent = options.exponent ?? 1;
  const matrix = createNumberMatrix(n, n);
  const rhs = Array.from({ length: n }, () => 0);

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const weight = graph.weights[row * n + col] ?? 0;
      matrix[row]![col] = (row === col ? 1 : 0) - exponent * weight;
      rhs[row] = rhs[row]! + weight;
    }
  }

  let values = solveLinearSystem(matrix, rhs, options.tol ?? 1e-7);
  const sumSquares = values.reduce((sum, value) => sum + value * value, 0);
  const scale = Math.sqrt(n / sumSquares);
  values = values.map((value) => value * scale);

  if (options.rescale) {
    const total = values.reduce((sum, value) => sum + value, 0);
    values = values.map((value) => value / total);
  }

  return selectNodes(values, options.nodes);
}
