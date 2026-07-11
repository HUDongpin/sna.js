import { createNumberMatrix } from "../core/matrix";
import { isDenseGraph, isEdgeListInput } from "../core/graph";
import type { GraphInput, GraphMode } from "../core/types";
import { asSociomatrixSna, symmetrize } from "./dataprep";
import { geodist } from "./geodist";

export type LogSpaceEmpty = [];
export type GapplyMargin = 1 | 2 | readonly (1 | 2)[];
export type GapplyStats = readonly number[] | readonly (readonly number[])[];
export type GapplyNeighborhood = readonly number[] | readonly (readonly number[])[];
export type GapplyFunction<T = unknown> = (values: GapplyNeighborhood, vertex: number) => T;
export type GliopOperator = "+" | "-" | "*" | "/" | ((left: unknown, right: unknown) => unknown);

export interface GapplyOptions {
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly distance?: number;
  readonly threshold?: number;
  readonly simplify?: boolean;
}

export interface GliopOptions<Args extends readonly unknown[] = readonly unknown[]> {
  readonly op?: GliopOperator;
  readonly g1?: number;
  readonly g2?: number;
  readonly args?: Args;
}

export function logSum(values: readonly []): LogSpaceEmpty;
export function logSum(values: readonly number[]): number | LogSpaceEmpty;
export function logSum(values: readonly number[]): number | LogSpaceEmpty {
  if (values.length === 0) return [];
  if (values.some(Number.isNaN)) return Number.NaN;
  const maxValue = Math.max(...values);
  if (maxValue === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY;
  if (maxValue === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  return maxValue + Math.log(values.reduce((acc, value) => acc + Math.exp(value - maxValue), 0));
}

export function logMean(values: readonly []): LogSpaceEmpty;
export function logMean(values: readonly number[]): number | LogSpaceEmpty;
export function logMean(values: readonly number[]): number | LogSpaceEmpty {
  if (values.length === 0) return [];
  const total = logSum(values);
  return Array.isArray(total) ? total : total - Math.log(values.length);
}

export function logSub(x: readonly number[], y: readonly number[]): number[] | LogSpaceEmpty {
  if (x.length !== y.length) throw new RangeError("x and y must be of the same length");
  if (x.length === 0) return [];
  return x.map((left, index) => logSubPair(left, y[index]!));
}

export function gapply<T = unknown>(
  input: GraphInput | readonly GraphInput[],
  margin: GapplyMargin,
  stats: GapplyStats,
  fn: GapplyFunction<T>,
  options: GapplyOptions = {},
): T[] | T[][] {
  if (isGraphStackInput(input)) {
    return input.map((graph) => gapplySingle(graph, margin, stats, fn, options));
  }
  return gapplySingle(input as GraphInput, margin, stats, fn, options);
}

export function gliop<Args extends readonly unknown[] = readonly unknown[]>(
  data: GraphInput | readonly GraphInput[],
  graphFn: (graph: number[][], ...args: Args) => unknown,
  options: GliopOptions<Args> = {},
): unknown {
  const stack = toMatrixStack(data);
  const g1 = options.g1 ?? 0;
  const g2 = options.g2 ?? 1;
  if (!Number.isInteger(g1) || g1 < 0 || g1 >= stack.length) throw new RangeError("g1 is outside graph stack");
  if (!Number.isInteger(g2) || g2 < 0 || g2 >= stack.length) throw new RangeError("g2 is outside graph stack");
  const args = (options.args ?? []) as Args;
  const left = graphFn(stack[g1]!, ...args);
  const right = graphFn(stack[g2]!, ...args);
  return applyGliopOperator(left, right, options.op ?? "-");
}

function logSubPair(x: number, y: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN;
  if (x === y) return Number.NEGATIVE_INFINITY;
  if (x < y) return Number.NaN;
  if (y === Number.NEGATIVE_INFINITY) return x;
  if (x === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  return x + Math.log1p(-Math.exp(y - x));
}

function gapplySingle<T>(
  input: GraphInput,
  margin: GapplyMargin,
  stats: GapplyStats,
  fn: GapplyFunction<T>,
  options: GapplyOptions,
): T[] {
  const matrix = asSociomatrixSna(input) as number[][];
  const order = assertSquareMatrix(matrix, "gapply");
  const statMatrix = normalizeStats(stats, order);
  let neighborhood = thresholdMatrix(matrix, options.threshold ?? 0);
  const distance = options.distance ?? 1;
  if (!Number.isFinite(distance) || distance < 1) throw new RangeError("distance must be a finite number greater than or equal to 1");
  if (distance > 1) {
    const distances = geodist(neighborhood, { diag: true, infReplace: Number.POSITIVE_INFINITY }).distances;
    neighborhood = distances.map((row) => row.map((value) => value <= distance));
  }
  if (!(options.diag ?? false)) {
    for (let i = 0; i < order; i += 1) neighborhood[i]![i] = false;
  }
  if ((options.mode ?? "digraph") === "graph") {
    for (let row = 0; row < order; row += 1) {
      for (let col = 0; col < row; col += 1) neighborhood[row]![col] = false;
    }
  }

  return Array.from({ length: order }, (_unused, vertex) => {
    const members = neighborhoodMembers(neighborhood, margin, vertex);
    const values = statMatrix.vectorInput ? members.map((member) => statMatrix.rows[member]![0]!) : members.map((member) => statMatrix.rows[member]!);
    return fn(values, vertex);
  });
}

function thresholdMatrix(matrix: readonly (readonly number[])[], threshold: number): boolean[][] {
  return matrix.map((row) => row.map((value) => Number.isFinite(value) && value > threshold));
}

function neighborhoodMembers(matrix: boolean[][], margin: GapplyMargin, vertex: number): number[] {
  const normalized = Array.isArray(margin) ? margin : [margin];
  if (normalized.length === 1 && normalized[0] === 1) {
    return matrix[vertex]!.flatMap((present, index) => (present ? [index] : []));
  }
  if (normalized.length === 1 && normalized[0] === 2) {
    return matrix.flatMap((row, index) => (row[vertex] ? [index] : []));
  }
  if (normalized.includes(1) && normalized.includes(2)) {
    const total = symmetrize(matrix.map((row) => row.map((value) => (value ? 1 : 0))), { rule: "weak" }) as number[][];
    return total[vertex]!.flatMap((present, index) => (present > 0 ? [index] : []));
  }
  throw new RangeError("MARGIN must be one of 1, 2, or [1, 2] in gapply");
}

function normalizeStats(stats: GapplyStats, order: number): { readonly rows: number[][]; readonly vectorInput: boolean } {
  if (stats.length !== order) throw new RangeError("STATS must contain one row or value per graph vertex");
  const first = stats[0] as unknown;
  if (Array.isArray(first)) {
    return { rows: (stats as readonly (readonly number[])[]).map((row) => [...row]), vectorInput: false };
  }
  return { rows: (stats as readonly number[]).map((value) => [value]), vectorInput: true };
}

function applyGliopOperator(left: unknown, right: unknown, op: GliopOperator): unknown {
  if (typeof op === "function") return op(left, right);
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      throw new RangeError("vector gliop operands must have equal lengths");
    }
    return left.map((value, index) => applyNumericGliop(value, right[index], op));
  }
  return applyNumericGliop(left, right, op);
}

function applyNumericGliop(left: unknown, right: unknown, op: Exclude<GliopOperator, (left: unknown, right: unknown) => unknown>): number {
  if (typeof left !== "number" || typeof right !== "number") throw new TypeError("built-in gliop operators require numeric operands");
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    default:
      throw new RangeError(`unsupported gliop operator: ${String(op)}`);
  }
}

function toMatrixStack(input: GraphInput | readonly GraphInput[]): number[][][] {
  if (isGraphStackInput(input)) return input.map((graph) => asSociomatrixSna(graph) as number[][]);
  return [asSociomatrixSna(input as GraphInput) as number[][]];
}

function assertSquareMatrix(matrix: readonly (readonly number[])[], label: string): number {
  const order = matrix.length;
  for (const row of matrix) {
    if (row.length !== order) throw new RangeError(`${label} requires square graph matrices`);
  }
  return order;
}

function isGraphStackInput(input: GraphInput | readonly GraphInput[]): input is readonly GraphInput[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as unknown;
  if (isDenseGraph(first as GraphInput) || isEdgeListInput(first as GraphInput)) return true;
  return Array.isArray(first) && first.length > 0 && Array.isArray((first as readonly unknown[])[0]);
}

export function graphComposition(leftInput: GraphInput, rightInput: GraphInput): number[][] {
  const left = asSociomatrixSna(leftInput) as number[][];
  const right = asSociomatrixSna(rightInput) as number[][];
  const order = assertSquareMatrix(left, "graphComposition");
  if (assertSquareMatrix(right, "graphComposition") !== order) throw new RangeError("graphComposition requires graphs of identical order");
  const out = createNumberMatrix(order, order);
  for (let row = 0; row < order; row += 1) {
    for (let col = 0; col < order; col += 1) {
      let reachable = false;
      for (let k = 0; k < order; k += 1) {
        if ((left[row]![k] ?? 0) !== 0 && (right[k]![col] ?? 0) !== 0) {
          reachable = true;
          break;
        }
      }
      out[row]![col] = reachable ? 1 : 0;
    }
  }
  return out;
}
