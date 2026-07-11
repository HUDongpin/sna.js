import { denseGraphToMatrix, makeDenseGraph } from "../core/graph";
import { invertMatrix } from "../core/linearAlgebra";
import { createNumberMatrix } from "../core/matrix";
import type { GraphInput, GraphOptions } from "../core/types";
import { symmetrize, type SymmetrizeRule } from "./dataprep";
import { selectNodes } from "./pathCentrality";

export interface InfocentOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly cmode?: SymmetrizeRule;
  readonly tmaxdev?: boolean;
  readonly rescale?: boolean;
  readonly tol?: number;
}

export function infocent(input: GraphInput, options: InfocentOptions & { tmaxdev: true }): number;
export function infocent(input: GraphInput, options?: InfocentOptions & { tmaxdev?: false }): number[];
export function infocent(input: GraphInput, options: InfocentOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, { ...options, mode: "digraph", directed: true, symmetrize: false, diag: true });
  const n = graph.order;

  if (options.tmaxdev) {
    if (n <= 1) return 0;
    const dyad = createNumberMatrix(n, n);
    dyad[0]![1] = 1;
    dyad[1]![0] = 1;
    const values = infocent(dyad, options.rescale === undefined ? {} : { rescale: options.rescale }) as number[];
    const maximum = Math.max(...values);
    return values.reduce((sum, value) => sum + maximum - value, 0);
  }

  let matrix = denseGraphToMatrix(graph, true);
  if (isAsymmetric(matrix)) matrix = symmetrize(matrix, { rule: options.cmode ?? "weak" }) as number[][];
  if (!(options.diag ?? false)) for (let i = 0; i < n; i += 1) matrix[i]![i] = Number.NaN;

  const active = Array.from({ length: n }, (_unused, vertex) => vertex).filter((vertex) => !isIsolate(matrix, vertex, options.diag ?? false));
  let values = Array.from({ length: n }, () => 0);
  if (active.length > 0) {
    const submatrix = active.map((row) => active.map((col) => matrix[row]![col]!));
    const activeValues = informationCentrality(submatrix, options.tol ?? 1e-20);
    active.forEach((vertex, index) => {
      values[vertex] = activeValues[index]!;
    });
  }

  if (options.rescale) {
    const total = values.reduce((sum, value) => sum + value, 0);
    values = values.map((value) => value / total);
  }

  return selectNodes(values, options.nodes);
}

function informationCentrality(matrix: number[][], tol: number): number[] {
  const n = matrix.length;
  const a = createNumberMatrix(n, n);
  for (let row = 0; row < n; row += 1) {
    let rowSum = 0;
    for (let col = 0; col < n; col += 1) {
      const value = matrix[row]![col]!;
      if (!Number.isNaN(value)) rowSum += value;
      a[row]![col] = value === 0 ? 1 : 1 - value;
    }
    a[row]![row] = 1 + rowSum;
  }

  const inverse = invertMatrix(a, tol);
  const trace = inverse.reduce((sum, row, index) => sum + row[index]!, 0);
  return inverse.map((row, index) => {
    const rowSum = row.reduce((sum, value) => sum + value, 0);
    return 1 / (row[index]! + (trace - 2 * rowSum) / n);
  });
}

function isAsymmetric(matrix: readonly (readonly number[])[]): boolean {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = row + 1; col < matrix.length; col += 1) {
      const a = matrix[row]![col]!;
      const b = matrix[col]![row]!;
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      if (a !== b) return true;
    }
  }
  return false;
}

function isIsolate(matrix: readonly (readonly number[])[], vertex: number, includeDiagonal: boolean): boolean {
  for (let other = 0; other < matrix.length; other += 1) {
    if (!includeDiagonal && other === vertex) continue;
    const out = matrix[vertex]![other]!;
    const incoming = matrix[other]![vertex]!;
    if ((!Number.isNaN(out) && out !== 0) || (!Number.isNaN(incoming) && incoming !== 0)) return false;
  }
  return true;
}
