// Ported from R sna 2.8: R/nli.R `evcent` and src/nli.c `evcent_R`.
import { makeDenseGraph } from "../core/graph";
import { jacobiEigenSymmetric, solveLinearSystem } from "../core/linearAlgebra";
import { createNumberMatrix } from "../core/matrix";
import type { GraphInput, GraphOptions } from "../core/types";

export interface EvcentOptions extends GraphOptions {
  readonly nodes?: readonly number[];
  readonly tmaxdev?: boolean;
  readonly rescale?: boolean;
  readonly tol?: number;
  readonly maxiter?: number;
  readonly useEigen?: boolean;
}

export function evcent(input: GraphInput, options: EvcentOptions & { tmaxdev: true }): number;
export function evcent(input: GraphInput, options?: EvcentOptions & { tmaxdev?: false }): number[];
export function evcent(input: GraphInput, options: EvcentOptions = {}): number | number[] {
  const graph = makeDenseGraph(input, { ...options, mode: "digraph", directed: true, symmetrize: false });
  const n = graph.order;

  if (options.tmaxdev) {
    return options.mode === "graph" || options.directed === false ? (Math.SQRT2 / 2) * (n - 2) : n - 1;
  }

  if (n === 0) return [];

  let values: number[];
  if (options.useEigen) {
    values = denseEigenMethod(graph, options);
  } else {
    // The power method oscillates when the two largest eigenvalues tie in
    // magnitude (e.g. bipartite structures); R's evcent returns the stale
    // iterate with a warning. Fall back to the dense eigen solver instead of
    // silently returning a non-converged vector.
    const power = powerMethod(graph, options);
    values = power.converged ? power.values : denseEigenMethod(graph, options);
  }
  const rescaled = options.rescale ? rescale(values) : values;
  return selectNodes(rescaled, options.nodes);
}

type DenseGraphLike = ReturnType<typeof makeDenseGraph>;

function powerMethod(graph: DenseGraphLike, options: EvcentOptions): { values: number[]; converged: boolean } {
  const n = graph.order;
  const ignoreEval = options.ignoreEval ?? false;
  const tol = options.tol ?? 1e-10;
  const maxiter = options.maxiter ?? 100_000;
  const values = Array.from({ length: n }, () => 1 / Math.sqrt(n));
  const next = Array.from({ length: n }, () => 0);

  let diff = 1;
  let iteration = 0;
  while (Math.sqrt(diff) > tol && iteration < maxiter) {
    iteration += 1;
    next.fill(0);

    for (let vertex = 0; vertex < n; vertex += 1) {
      for (let neighbor = 0; neighbor < n; neighbor += 1) {
        if (!graph.adjacency[vertex * n + neighbor]) continue;
        next[vertex] = next[vertex]! + (ignoreEval ? values[neighbor]! : graph.weights[vertex * n + neighbor]! * values[neighbor]!);
      }
    }

    let norm = 0;
    for (const value of next) norm += value * value;
    norm = Math.sqrt(norm);
    if (norm === 0) return { values: Array.from({ length: n }, () => Number.NaN), converged: true };

    diff = 0;
    for (let vertex = 0; vertex < n; vertex += 1) {
      next[vertex] = next[vertex]! / norm;
      diff += (values[vertex]! - next[vertex]!) ** 2;
      values[vertex] = next[vertex]!;
    }
  }

  return { values, converged: Math.sqrt(diff) <= tol };
}

function denseEigenMethod(graph: DenseGraphLike, options: EvcentOptions): number[] {
  const matrix = evcentMatrix(graph, options);
  if (matrix.every((row) => row.every((value) => value === 0))) return Array.from({ length: graph.order }, () => Number.NaN);

  const tol = options.tol ?? 1e-10;
  const maxiter = options.maxiter ?? 100_000;
  if (isSymmetric(matrix, tol)) {
    const eigen = jacobiEigenSymmetric(matrix, tol, maxiter);
    return normalizeAndCanonicalize(eigen.vectors.map((row) => row[0] ?? 0));
  }

  const eigenvalue = dominantRealEigenvalue(matrix, tol, maxiter);
  const inverse = inverseIterationEigenvector(matrix, eigenvalue, tol, maxiter);
  return inverse ?? densePowerVector(matrix, tol, maxiter);
}

function evcentMatrix(graph: DenseGraphLike, options: EvcentOptions): number[][] {
  const n = graph.order;
  const ignoreEval = options.ignoreEval ?? false;
  return Array.from({ length: n }, (_unused, row) =>
    Array.from({ length: n }, (_unused2, col) => {
      if (!(options.diag ?? false) && row === col) return 0;
      const index = row * n + col;
      if (!graph.adjacency[index]) return 0;
      return ignoreEval ? 1 : graph.weights[index]!;
    }),
  );
}

function isSymmetric(matrix: readonly (readonly number[])[], tol: number): boolean {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = row + 1; col < matrix.length; col += 1) {
      if (Math.abs(matrix[row]![col]! - matrix[col]![row]!) > tol) return false;
    }
  }
  return true;
}

function dominantRealEigenvalue(matrix: readonly (readonly number[])[], tol: number, maxiter: number): number {
  const candidates = qrEigenvalueCandidates(matrix, tol, maxiter).filter(Number.isFinite);
  if (candidates.length > 0) {
    return candidates.reduce((best, value) => {
      const bestAbs = Math.abs(best);
      const valueAbs = Math.abs(value);
      return valueAbs > bestAbs || (valueAbs === bestAbs && value > best) ? value : best;
    }, candidates[0]!);
  }
  return rayleighQuotient(matrix, densePowerVector(matrix, tol, maxiter));
}

function qrEigenvalueCandidates(matrix: readonly (readonly number[])[], tol: number, maxiter: number): number[] {
  const n = matrix.length;
  let current = matrix.map((row) => [...row]);
  const iterations = Math.max(1, Math.min(maxiter, 5_000));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (subdiagonalNorm(current) <= tol * (1 + matrixNorm(current))) break;
    const shift = current[n - 1]?.[n - 1] ?? 0;
    const shifted = current.map((row, rowIndex) => row.map((value, colIndex) => (rowIndex === colIndex ? value - shift : value)));
    const { q, r } = qrDecompose(shifted);
    current = multiplySquare(r, q);
    for (let index = 0; index < n; index += 1) current[index]![index] = current[index]![index]! + shift;
  }

  const threshold = Math.sqrt(tol) * (1 + matrixNorm(current));
  const out: number[] = [];
  for (let index = 0; index < n; index += 1) {
    if (index < n - 1 && Math.abs(current[index + 1]![index]!) > threshold) {
      const a = current[index]![index]!;
      const b = current[index]![index + 1]!;
      const c = current[index + 1]![index]!;
      const d = current[index + 1]![index + 1]!;
      const trace = a + d;
      const determinant = a * d - b * c;
      const discriminant = trace * trace - 4 * determinant;
      if (discriminant >= -threshold) {
        const root = Math.sqrt(Math.max(0, discriminant));
        out.push((trace + root) / 2, (trace - root) / 2);
      }
      index += 1;
    } else {
      out.push(current[index]![index]!);
    }
  }
  return out;
}

function qrDecompose(matrix: readonly (readonly number[])[]): { readonly q: number[][]; readonly r: number[][] } {
  const n = matrix.length;
  const r = matrix.map((row) => [...row]);
  const q = identityMatrix(n);

  for (let col = 0; col < n - 1; col += 1) {
    const x = Array.from({ length: n - col }, (_unused, offset) => r[col + offset]![col]!);
    const normX = vectorNorm(x);
    if (normX === 0) continue;
    const alpha = x[0]! >= 0 ? -normX : normX;
    const v = [...x];
    v[0] = v[0]! - alpha;
    const normV = vectorNorm(v);
    if (normV === 0) continue;
    for (let index = 0; index < v.length; index += 1) v[index] = v[index]! / normV;

    for (let targetCol = col; targetCol < n; targetCol += 1) {
      let dot = 0;
      for (let offset = 0; offset < v.length; offset += 1) dot += v[offset]! * r[col + offset]![targetCol]!;
      dot *= 2;
      for (let offset = 0; offset < v.length; offset += 1) r[col + offset]![targetCol] = r[col + offset]![targetCol]! - dot * v[offset]!;
    }

    for (let row = 0; row < n; row += 1) {
      let dot = 0;
      for (let offset = 0; offset < v.length; offset += 1) dot += q[row]![col + offset]! * v[offset]!;
      dot *= 2;
      for (let offset = 0; offset < v.length; offset += 1) q[row]![col + offset] = q[row]![col + offset]! - dot * v[offset]!;
    }
  }

  return { q, r };
}

function inverseIterationEigenvector(matrix: readonly (readonly number[])[], eigenvalue: number, tol: number, maxiter: number): number[] | null {
  const n = matrix.length;
  const iterations = Math.max(1, Math.min(maxiter, 200));
  const jitterBase = Math.max(Math.sqrt(tol), 1e-12) * (1 + Math.abs(eigenvalue));
  const jitters = [jitterBase, -jitterBase, jitterBase * 100, -jitterBase * 100, 1e-6, -1e-6];

  for (const jitter of jitters) {
    const shifted = matrix.map((row, rowIndex) => row.map((value, colIndex) => (rowIndex === colIndex ? value - eigenvalue - jitter : value)));
    let current = Array.from({ length: n }, () => 1 / Math.sqrt(n));
    let failed = false;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      let next: number[];
      try {
        next = solveLinearSystem(shifted, current, Number.EPSILON);
      } catch {
        failed = true;
        break;
      }
      next = normalizeAndCanonicalize(next);
      if (next.every(Number.isNaN)) {
        failed = true;
        break;
      }
      const diff = Math.min(vectorDistance(next, current), vectorDistance(next, current.map((value) => -value)));
      current = next;
      if (diff <= Math.sqrt(tol)) return current;
    }

    if (!failed) return current;
  }

  return null;
}

function densePowerVector(matrix: readonly (readonly number[])[], tol: number, maxiter: number): number[] {
  const n = matrix.length;
  const values = Array.from({ length: n }, () => 1 / Math.sqrt(n));
  let diff = 1;
  let iteration = 0;

  while (Math.sqrt(diff) > tol && iteration < maxiter) {
    iteration += 1;
    const next = multiplyMatrixVector(matrix, values);
    const normalized = normalizeAndCanonicalize(next);
    if (normalized.every(Number.isNaN)) return normalized;

    diff = vectorDistance(values, normalized) ** 2;
    for (let index = 0; index < n; index += 1) values[index] = normalized[index]!;
  }

  return values;
}

function rayleighQuotient(matrix: readonly (readonly number[])[], vector: readonly number[]): number {
  const product = multiplyMatrixVector(matrix, vector);
  const denom = vector.reduce((sum, value) => sum + value * value, 0);
  if (denom === 0) return 0;
  return vector.reduce((sum, value, index) => sum + value * product[index]!, 0) / denom;
}

function multiplyMatrixVector(matrix: readonly (readonly number[])[], vector: readonly number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index]!, 0));
}

function multiplySquare(left: readonly (readonly number[])[], right: readonly (readonly number[])[]): number[][] {
  const n = left.length;
  const out = createNumberMatrix(n, n);
  for (let row = 0; row < n; row += 1) {
    for (let inner = 0; inner < n; inner += 1) {
      const value = left[row]![inner]!;
      if (value === 0) continue;
      for (let col = 0; col < n; col += 1) out[row]![col] = out[row]![col]! + value * right[inner]![col]!;
    }
  }
  return out;
}

function identityMatrix(n: number): number[][] {
  const out = createNumberMatrix(n, n);
  for (let index = 0; index < n; index += 1) out[index]![index] = 1;
  return out;
}

function normalizeAndCanonicalize(values: readonly number[]): number[] {
  const norm = vectorNorm(values);
  if (!Number.isFinite(norm) || norm === 0) return Array.from({ length: values.length }, () => Number.NaN);
  const out = values.map((value) => value / norm);
  let maxIndex = 0;
  for (let index = 1; index < out.length; index += 1) {
    if (Math.abs(out[index]!) > Math.abs(out[maxIndex]!)) maxIndex = index;
  }
  if (out[maxIndex]! < 0) return out.map((value) => -value);
  return out;
}

function vectorNorm(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function vectorDistance(left: readonly number[], right: readonly number[]): number {
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]!) ** 2, 0));
}

function matrixNorm(matrix: readonly (readonly number[])[]): number {
  return Math.sqrt(matrix.reduce((sum, row) => sum + row.reduce((rowSum, value) => rowSum + value * value, 0), 0));
}

function subdiagonalNorm(matrix: readonly (readonly number[])[]): number {
  let sum = 0;
  for (let row = 1; row < matrix.length; row += 1) {
    for (let col = 0; col < row; col += 1) sum += matrix[row]![col]! ** 2;
  }
  return Math.sqrt(sum);
}

function rescale(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
}

function selectNodes(values: readonly number[], nodes: readonly number[] | undefined): number[] {
  if (!nodes) return [...values];
  return nodes.map((node) => {
    if (!Number.isInteger(node) || node < 0 || node >= values.length) throw new RangeError("node is outside graph order");
    return values[node]!;
  });
}
