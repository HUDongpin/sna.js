// Ported from R sna 2.8: R/gtest.R (`qaptest`, `cugtest`, `cug.test`).
import { isDenseGraph, isEdgeListInput } from "../core/graph";
import { checkAborted, type CancellationOptions } from "../core/cancellation";
import type { GraphInput, GraphMode } from "../core/types";
import { resolveRandomSource, shuffleInPlace, type RandomOptions, type RandomSource } from "../core/random";
import { asSociomatrixSna } from "./dataprep";
import { gden, nties } from "./density";
import { dyadCensus } from "./graphStatistics";
import { rmperm } from "./permutation";
import { rgnm, rgraph, rguman, rewireUd, type RgraphOptions } from "./randomGraph";

export type GraphTestData = number[][] | number[][][];
export type GraphTestStatistic = (data: GraphTestData, options: Record<string, unknown>) => unknown;

export interface GraphTestResult {
  readonly testValue: number;
  readonly distribution: number[];
  readonly pGreaterEqual: number;
  readonly pLessEqual: number;
  readonly reps: number;
}

export interface QaptestOptions extends RandomOptions, CancellationOptions {
  readonly reps?: number;
  readonly g1?: number;
  readonly g2?: number;
  readonly statisticOptions?: Record<string, unknown>;
}

export interface CugtestOptions extends RandomOptions, CancellationOptions {
  readonly reps?: number;
  readonly gmode?: GraphMode;
  readonly mode?: GraphMode;
  readonly cmode?: "density" | "ties" | "order";
  readonly diag?: boolean;
  readonly g1?: number;
  readonly g2?: number;
  readonly statisticOptions?: Record<string, unknown>;
}

export interface CugtestResult extends GraphTestResult {
  readonly cmode: "density" | "ties" | "order";
  readonly mode: GraphMode;
  readonly diag: boolean;
}

export type CugTestStatistic = (data: number[][], options: Record<string, unknown>) => unknown;

export interface CugTestOptions extends RandomOptions, CancellationOptions {
  readonly reps?: number;
  readonly mode?: GraphMode;
  readonly cmode?: "size" | "edges" | "dyad.census";
  readonly diag?: boolean;
  readonly ignoreEval?: boolean;
  readonly statisticOptions?: Record<string, unknown>;
}

export interface CugTestResult extends GraphTestResult {
  readonly type: "cug.test";
  readonly cmode: "size" | "edges" | "dyad.census";
  readonly mode: GraphMode;
  readonly diag: boolean;
  readonly ignoreEval: boolean;
}

export function qaptest(data: GraphInput | readonly GraphInput[], statistic: GraphTestStatistic, options: QaptestOptions = {}): GraphTestResult {
  const reps = resolveReps(options.reps);
  const stack = toMatrixStack(data);
  const statisticOptions = { ...(options.statisticOptions ?? {}) };
  if (options.g1 !== undefined) statisticOptions.g1 = options.g1;
  if (options.g2 !== undefined) statisticOptions.g2 = options.g2;

  const testValue = evaluateStatistic(statistic(stack, statisticOptions), "qaptest");
  const distribution = Array.from({ length: reps }, (_unused, index) => {
    checkAborted(options.signal);
    const permuted = rmperm(stack, rngOptionsForRep(options, index)) as number[][][];
    const value = evaluateStatistic(statistic(permuted, statisticOptions), "qaptest");
    options.onProgress?.(index + 1, reps);
    return value;
  });

  return {
    testValue,
    distribution,
    pGreaterEqual: tailProbability(distribution, testValue, "greater"),
    pLessEqual: tailProbability(distribution, testValue, "less"),
    reps,
  };
}

export function cugtest(data: GraphInput | readonly GraphInput[], statistic: GraphTestStatistic, options: CugtestOptions = {}): CugtestResult {
  const reps = resolveReps(options.reps);
  const stack = toMatrixStack(data);
  const g1 = options.g1 ?? 0;
  const g2 = options.g2 ?? 1;
  assertGraphIndex(g1, stack.length, "g1");
  assertGraphIndex(g2, stack.length, "g2");

  const mode = options.gmode ?? options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const cmode = options.cmode ?? "density";
  const statisticOptions = { ...(options.statisticOptions ?? {}), g1: 0, g2: 1 };
  const testOptions = { ...(options.statisticOptions ?? {}), g1, g2 };
  const testValue = evaluateStatistic(statistic(stack, testOptions), "cugtest");
  const graph1 = stack[g1]!;
  const graph2 = stack[g2]!;
  const densities =
    cmode === "density"
      ? [gden(graph1, { mode, diag }), gden(graph2, { mode, diag })]
      : [0.5, 0.5];

  const distribution = Array.from({ length: reps }, (_unused, index) => {
    const rngOptions = rngOptionsForRep(options, index);
    const secondRngOptions = options.rng !== undefined ? { rng: options.rng } : options.seed !== undefined ? { seed: `${String(options.seed)}:cug:${index}:second` } : {};
    checkAborted(options.signal);
    const draw1 = rgraph(graph1.length, cugDrawOptions(rngOptions, mode, diag, cmode, densities[0]!, graph1)) as number[][];
    const draw2 = rgraph(graph2.length, cugDrawOptions(secondRngOptions, mode, diag, cmode, densities[1]!, graph2)) as number[][];
    const value = evaluateStatistic(statistic([draw1, draw2], statisticOptions), "cugtest");
    options.onProgress?.(index + 1, reps);
    return value;
  });

  return {
    testValue,
    distribution,
    pGreaterEqual: tailProbability(distribution, testValue, "greater"),
    pLessEqual: tailProbability(distribution, testValue, "less"),
    reps,
    cmode,
    mode,
    diag,
  };
}

export function cugTest(data: GraphInput, statistic: CugTestStatistic, options?: CugTestOptions): CugTestResult;
export function cugTest(data: readonly GraphInput[], statistic: CugTestStatistic, options?: CugTestOptions): CugTestResult[];
export function cugTest(data: GraphInput | readonly GraphInput[], statistic: CugTestStatistic, options: CugTestOptions = {}): CugTestResult | CugTestResult[] {
  if (isGraphStackInput(data)) {
    return data.map((graph, index) => cugTestSingle(graph, statistic, options.seed === undefined ? options : { ...options, seed: `${String(options.seed)}:${index}` }));
  }
  return cugTestSingle(data as GraphInput, statistic, options);
}

function rngOptionsForRep(options: RandomOptions, index: number): RandomOptions {
  if (options.rng !== undefined) return { rng: options.rng };
  if (options.seed !== undefined) return { seed: `${String(options.seed)}:${index}` };
  return {};
}

function cugTestSingle(data: GraphInput, statistic: CugTestStatistic, options: CugTestOptions): CugTestResult {
  const reps = resolveReps(options.reps);
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const cmode = options.cmode ?? "size";
  const ignoreEval = options.ignoreEval ?? true;
  const raw = asSociomatrixSna(data) as number[][];
  assertSquareMatrix(raw, "cugTest");
  const observedGraph = ignoreEval ? dichotomizeMatrix(raw, diag) : cloneMatrix(raw);
  const statisticOptions = { ...(options.statisticOptions ?? {}), mode, diag };
  const testValue = evaluateStatistic(statistic(observedGraph, statisticOptions), "cugTest");

  const distribution = Array.from({ length: reps }, (_unused, index) => {
    const rngOptions = rngOptionsForRep(options, index);
    checkAborted(options.signal);
    const draw = ignoreEval
      ? drawUnvaluedCugReplicate(observedGraph, mode, diag, cmode, rngOptions)
      : drawValuedCugReplicate(raw, mode, diag, cmode, resolveRandomSource(rngOptions), rngOptions);
    const value = evaluateStatistic(statistic(draw, statisticOptions), "cugTest");
    options.onProgress?.(index + 1, reps);
    return value;
  });

  return {
    type: "cug.test",
    testValue,
    distribution,
    pGreaterEqual: tailProbability(distribution, testValue, "greater"),
    pLessEqual: tailProbability(distribution, testValue, "less"),
    reps,
    cmode,
    mode,
    diag,
    ignoreEval,
  };
}

function drawUnvaluedCugReplicate(
  observed: number[][],
  mode: GraphMode,
  diag: boolean,
  cmode: CugTestResult["cmode"],
  rngOptions: RandomOptions,
): number[][] {
  const order = observed.length;
  if (cmode === "size") return rgraph(order, { ...rngOptions, mode, diag, tprob: 0.5 }) as number[][];
  if (cmode === "edges") {
    return rgnm(order, nties(observed, { mode, diag }), { ...rngOptions, mode, diag }) as number[][];
  }
  const census = dyadCensus(observed, { mode: "digraph", diag: false });
  return rguman(order, {
    ...rngOptions,
    mut: census.mutual,
    asym: census.asymmetric,
    nullDyads: census.nullDyads,
    method: "exact",
  }) as number[][];
}

function drawValuedCugReplicate(
  observed: number[][],
  mode: GraphMode,
  diag: boolean,
  cmode: CugTestResult["cmode"],
  rng: RandomSource,
  rngOptions: RandomOptions,
): number[][] {
  if (cmode === "size") return rgraph(observed.length, { ...rngOptions, mode, diag, tprob: 0.5 }) as number[][];
  if (cmode === "edges") return shuffleEligibleValues(observed, mode, diag, rng);
  const rewired = rewireUd(observed, 1, { rng }) as number[][];
  if (diag) {
    const diagonal = shuffleInPlace(
      Array.from({ length: observed.length }, (_unused, index) => observed[index]![index]!),
      rng,
    );
    for (let i = 0; i < rewired.length; i += 1) rewired[i]![i] = diagonal[i]!;
  }
  return rewired;
}

function shuffleEligibleValues(matrix: number[][], mode: GraphMode, diag: boolean, rng: RandomSource): number[][] {
  const out = cloneMatrix(matrix);
  const positions: Array<readonly [number, number]> = [];
  if (mode === "graph") {
    for (let row = 0; row < out.length; row += 1) {
      for (let col = row + (diag ? 0 : 1); col < out.length; col += 1) positions.push([row, col]);
    }
    const values = shuffleInPlace(positions.map(([row, col]) => matrix[row]![col]!), rng);
    positions.forEach(([row, col], index) => {
      out[row]![col] = values[index]!;
      if (row !== col) out[col]![row] = values[index]!;
    });
    return out;
  }

  for (let row = 0; row < out.length; row += 1) {
    for (let col = 0; col < out.length; col += 1) {
      if (diag || row !== col) positions.push([row, col]);
    }
  }
  const values = shuffleInPlace(positions.map(([row, col]) => matrix[row]![col]!), rng);
  positions.forEach(([row, col], index) => {
    out[row]![col] = values[index]!;
  });
  return out;
}

function cugDrawOptions(
  rngOptions: RandomOptions,
  mode: GraphMode,
  diag: boolean,
  cmode: "density" | "ties" | "order",
  tprob: number,
  tielist: number[][],
): RgraphOptions {
  return cmode === "ties" ? { ...rngOptions, mode, diag, tielist } : { ...rngOptions, mode, diag, tprob };
}

function evaluateStatistic(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} statistic must return a finite number`);
  return value;
}

function tailProbability(distribution: readonly number[], testValue: number, tail: "greater" | "less"): number {
  if (distribution.length === 0) return Number.NaN;
  let count = 0;
  for (const value of distribution) {
    if (tail === "greater" ? value >= testValue : value <= testValue) count += 1;
  }
  return count / distribution.length;
}

function resolveReps(reps: number | undefined): number {
  const value = reps ?? 1000;
  if (!Number.isInteger(value) || value < 0) throw new RangeError("reps must be a non-negative integer");
  return value;
}

function toMatrixStack(input: GraphInput | readonly GraphInput[]): number[][][] {
  if (isGraphStackInput(input)) {
    if (input.length === 0) throw new RangeError("graph stack must contain at least one graph");
    return input.map((graph) => asSociomatrixSna(graph) as number[][]);
  }
  return [asSociomatrixSna(input as GraphInput) as number[][]];
}

function assertGraphIndex(index: number, count: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new RangeError(`${label} is outside graph stack`);
}

function assertSquareMatrix(matrix: readonly (readonly number[])[], label: string): void {
  for (const row of matrix) {
    if (row.length !== matrix.length) throw new RangeError(`${label} requires a square graph matrix`);
  }
}

function dichotomizeMatrix(matrix: number[][], diag: boolean): number[][] {
  return matrix.map((row, rowIndex) => row.map((value, colIndex) => (!diag && rowIndex === colIndex ? 0 : Number.isFinite(value) && value !== 0 ? 1 : 0)));
}

function cloneMatrix(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}

function isGraphStackInput(input: GraphInput | readonly GraphInput[]): input is readonly GraphInput[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as unknown;
  if (isDenseGraph(first as GraphInput) || isEdgeListInput(first as GraphInput)) return true;
  return Array.isArray(first) && first.length > 0 && Array.isArray(first[0]);
}
