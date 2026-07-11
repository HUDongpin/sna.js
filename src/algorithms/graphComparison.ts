import { isDenseGraph, isEdgeListInput } from "../core/graph";
import { createNumberMatrix } from "../core/matrix";
import type { GraphInput, GraphMode } from "../core/types";
import { resolveRandomSource, type RandomOptions } from "../core/random";
import { asSociomatrixSna } from "./dataprep";
import { labOptimize } from "./permutation";

export type GraphComparisonInput = GraphInput | readonly GraphInput[];
export type GraphComparisonMethod = "none" | "exhaustive" | "anneal" | "hillclimb" | "mc" | "gumbel";
export type ExchangeList = number | readonly number[] | readonly (readonly number[])[];
export type SdmatOutput = "matrix" | "dist";

export interface GraphPairOptions {
  readonly dat2?: GraphComparisonInput;
  readonly g1?: number | readonly number[];
  readonly g2?: number | readonly number[];
  readonly diag?: boolean;
  readonly mode?: GraphMode;
}

export interface HdistOptions extends GraphPairOptions {
  readonly normalize?: boolean;
}

export interface StructuralComparisonOptions extends GraphPairOptions, RandomOptions {
  readonly method?: GraphComparisonMethod;
  readonly reps?: number;
  readonly probInit?: number;
  readonly probDecay?: number;
  readonly freezeTime?: number;
  readonly fullNeighborhood?: boolean;
  readonly exchangeList?: ExchangeList | null;
}

export interface StructdistOptions extends Omit<StructuralComparisonOptions, "dat2"> {
  readonly normalize?: boolean;
}

export interface SdmatOptions extends Omit<StructdistOptions, "g1" | "g2"> {
  readonly output?: SdmatOutput;
}

export interface CentralGraphOptions {
  readonly normalize?: boolean;
}

export interface ClusterObject {
  readonly groups?: readonly number[];
  readonly labels?: readonly number[];
  readonly merge?: readonly (readonly [number, number])[];
}

export type ClusterInput = readonly number[] | ClusterObject;

export interface BoxStats {
  readonly n: number;
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
}

export interface GclustBoxstatsResult {
  readonly groups: number[][];
  readonly stats: BoxStats[];
}

export function centralgraph(input: GraphComparisonInput, options: CentralGraphOptions = {}): number[][] {
  const stack = toMatrixStack(input);
  if (stack.length === 1) return cloneMatrix(stack[0]!);

  const order = assertUniformOrder(stack, "centralgraph");
  const out = createNumberMatrix(order, order, Number.NaN);
  for (let row = 0; row < order; row += 1) {
    for (let col = 0; col < order; col += 1) {
      const mean = meanFinite(stack.map((graph) => graph[row]![col]!));
      out[row]![col] = options.normalize || Number.isNaN(mean) ? mean : mean >= 0.5 ? 1 : 0;
    }
  }
  return out;
}

export function gcov(input: GraphComparisonInput, options: GraphPairOptions = {}): number | number[][] {
  const prepared = prepareGraphPairs(input, options, "gcov");
  return pairMatrix(prepared.g1, prepared.g2, (left, right) => covariance(vectorizeForStats(prepared.stack[left]!, prepared), vectorizeForStats(prepared.stack[right]!, prepared)));
}

export function gcor(input: GraphComparisonInput, options: GraphPairOptions = {}): number | number[][] {
  const prepared = prepareGraphPairs(input, options, "gcor");
  return pairMatrix(prepared.g1, prepared.g2, (left, right) => correlation(vectorizeForStats(prepared.stack[left]!, prepared), vectorizeForStats(prepared.stack[right]!, prepared)));
}

export function hdist(input: GraphComparisonInput, options: HdistOptions = {}): number | number[][] {
  const prepared = prepareGraphPairs(input, options, "hdist");
  const denominator = possibleTieCount(prepared.order, prepared.mode, prepared.diag);
  const out = pairMatrix(prepared.g1, prepared.g2, (left, right) => {
    const distance = hammingDistance(prepared.stack[left]!, prepared.stack[right]!, prepared);
    return options.normalize ? distance / denominator : distance;
  });
  return out;
}

export function gscov(input: GraphComparisonInput, options: StructuralComparisonOptions = {}): number | number[][] {
  const prepared = prepareGraphPairs(input, options, "gscov");
  const masked = prepared.stack.map((matrix) => maskForStats(matrix, prepared));
  return pairMatrix(prepared.g1, prepared.g2, (left, right) =>
    optimizeLabeling(masked[left]!, masked[right]!, (a, b) => covariance(matrixValues(a), matrixValues(b)), {
      ...options,
      seek: "max",
      graphIndexA: left,
      graphIndexB: right,
      graphCount: prepared.stack.length,
      order: prepared.order,
    }),
  );
}

export function gscor(input: GraphComparisonInput, options: StructuralComparisonOptions = {}): number | number[][] {
  const prepared = prepareGraphPairs(input, options, "gscor");
  const masked = prepared.stack.map((matrix) => maskForStats(matrix, prepared));
  return pairMatrix(prepared.g1, prepared.g2, (left, right) =>
    optimizeLabeling(masked[left]!, masked[right]!, (a, b) => correlation(matrixValues(a), matrixValues(b)), {
      ...options,
      seek: "max",
      graphIndexA: left,
      graphIndexB: right,
      graphCount: prepared.stack.length,
      order: prepared.order,
    }),
  );
}

export function structdist(input: GraphComparisonInput, options: StructdistOptions = {}): number | number[][] {
  const prepared = prepareGraphPairs(input, options, "structdist");
  const denominator = possibleTieCount(prepared.order, prepared.mode, prepared.diag);
  return pairMatrix(prepared.g1, prepared.g2, (left, right) => {
    const distance = optimizeLabeling(prepared.stack[left]!, prepared.stack[right]!, (a, b) => structuralDistance(a, b, prepared), {
      ...options,
      seek: "min",
      graphIndexA: left,
      graphIndexB: right,
      graphCount: prepared.stack.length,
      order: prepared.order,
    });
    return options.normalize ? distance / denominator : distance;
  });
}

export function sdmat(input: GraphComparisonInput, options: SdmatOptions = {}): number[][] | number[] {
  const stack = toMatrixStack(input);
  const order = assertUniformOrder(stack, "sdmat");
  const matrix = structdist(stack, { ...options, g1: allIndices(stack.length), g2: allIndices(stack.length) }) as number[][];
  for (let i = 0; i < stack.length; i += 1) matrix[i]![i] = 0;
  if ((options.output ?? "matrix") === "matrix") return matrix;
  return condensedDistance(matrix, order);
}

export function gclustCentralgraph(cluster: ClusterInput, k: number, input: GraphComparisonInput, options: CentralGraphOptions = {}): number[][][] {
  const stack = toMatrixStack(input);
  assertUniformOrder(stack, "gclustCentralgraph");
  const labels = cutClusters(cluster, k, stack.length);
  return Array.from({ length: k }, (_unused, group) => {
    const members = stack.filter((_matrix, index) => labels[index] === group + 1);
    return centralgraph(members, options);
  });
}

export function gclustBoxstats(cluster: ClusterInput, k: number, measures: readonly number[]): GclustBoxstatsResult {
  const labels = cutClusters(cluster, k, measures.length);
  const groups = Array.from({ length: k }, () => [] as number[]);
  for (let i = 0; i < measures.length; i += 1) groups[(labels[i] ?? 1) - 1]!.push(measures[i]!);
  return { groups, stats: groups.map(boxStats) };
}

interface PreparedPairs {
  readonly stack: number[][][];
  readonly g1: number[];
  readonly g2: number[];
  readonly order: number;
  readonly diag: boolean;
  readonly mode: GraphMode;
}

interface LabelOptimizeOptions extends StructuralComparisonOptions {
  readonly seek: "min" | "max";
  readonly graphIndexA: number;
  readonly graphIndexB: number;
  readonly graphCount: number;
  readonly order: number;
}

function prepareGraphPairs(input: GraphComparisonInput, options: GraphPairOptions, label: string): PreparedPairs {
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const left = toMatrixStack(input);
  assertUniformOrder(left, label);

  if (options.dat2 !== undefined) {
    const right = toMatrixStack(options.dat2);
    assertUniformOrder(right, label);
    const order = Math.max(left[0]?.length ?? 0, right[0]?.length ?? 0);
    const stack = [...padStack(left, order), ...padStack(right, order)];
    return {
      stack,
      g1: normalizeSelection(options.g1, left.length, 0),
      g2: normalizeSelection(options.g2, right.length, left.length),
      order,
      diag,
      mode,
    };
  }

  const order = left[0]?.length ?? 0;
  return {
    stack: left,
    g1: normalizeSelection(options.g1, left.length, 0),
    g2: normalizeSelection(options.g2, left.length, 0),
    order,
    diag,
    mode,
  };
}

function toMatrixStack(input: GraphComparisonInput): number[][][] {
  if (isGraphStackInput(input)) {
    if (input.length === 0) throw new RangeError("graph stack must contain at least one graph");
    return input.map((graph) => asSociomatrixSna(graph) as number[][]);
  }
  return [asSociomatrixSna(input as GraphInput) as number[][]];
}

function isGraphStackInput(input: GraphComparisonInput): input is readonly GraphInput[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as unknown;
  if (isDenseGraph(first as GraphInput) || isEdgeListInput(first as GraphInput)) return true;
  return Array.isArray(first) && first.length > 0 && Array.isArray((first as readonly unknown[])[0]);
}

function assertUniformOrder(stack: readonly number[][][], label: string): number {
  if (stack.length === 0) throw new RangeError(`${label} requires at least one graph`);
  const order = stack[0]!.length;
  for (const matrix of stack) {
    if (matrix.length !== order || matrix.some((row) => row.length !== order)) {
      throw new RangeError(`identical graph orders required in ${label}`);
    }
  }
  return order;
}

function padStack(stack: readonly number[][][], order: number): number[][][] {
  return stack.map((matrix) => {
    if (matrix.length === order) return cloneMatrix(matrix);
    const out = createNumberMatrix(order, order);
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = 0; col < matrix.length; col += 1) out[row]![col] = matrix[row]![col]!;
    }
    return out;
  });
}

function normalizeSelection(selection: number | readonly number[] | undefined, count: number, offset: number): number[] {
  const values = selection === undefined ? allIndices(count) : Array.isArray(selection) ? [...selection] : [selection];
  return values.map((value) => {
    if (!Number.isInteger(value) || value < 0 || value >= count) throw new RangeError("graph selection index is outside graph stack");
    return value + offset;
  });
}

function allIndices(count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => index);
}

function pairMatrix(left: readonly number[], right: readonly number[], valueAt: (left: number, right: number) => number): number | number[][] {
  const out = left.map((leftIndex) => right.map((rightIndex) => valueAt(leftIndex, rightIndex)));
  return left.length === 1 && right.length === 1 ? out[0]![0]! : out;
}

function vectorizeForStats(matrix: number[][], options: Pick<PreparedPairs, "diag" | "mode">): number[] {
  const out: number[] = [];
  for (let col = 0; col < matrix.length; col += 1) {
    for (let row = 0; row < matrix.length; row += 1) {
      if (!includeCell(row, col, options)) continue;
      out.push(matrix[row]![col]!);
    }
  }
  return out;
}

function maskForStats(matrix: number[][], options: Pick<PreparedPairs, "diag" | "mode">): number[][] {
  const out = cloneMatrix(matrix);
  for (let row = 0; row < out.length; row += 1) {
    for (let col = 0; col < out.length; col += 1) {
      if (!includeCell(row, col, options)) out[row]![col] = Number.NaN;
    }
  }
  return out;
}

function includeCell(row: number, col: number, options: Pick<PreparedPairs, "diag" | "mode">): boolean {
  if (options.mode === "graph") return row > col || (options.diag && row === col);
  return options.diag || row !== col;
}

function hammingDistance(left: number[][], right: number[][], options: Pick<PreparedPairs, "diag" | "mode">): number {
  let sum = 0;
  for (let col = 0; col < left.length; col += 1) {
    for (let row = 0; row < left.length; row += 1) {
      if (!includeCell(row, col, options)) continue;
      const diff = completeAbsDiff(left[row]![col]!, right[row]![col]!);
      if (!Number.isNaN(diff)) sum += diff;
    }
  }
  return sum;
}

function structuralDistance(left: number[][], right: number[][], options: Pick<PreparedPairs, "diag" | "mode">): number {
  let offDiagonal = 0;
  let diagonal = 0;
  for (let row = 0; row < left.length; row += 1) {
    for (let col = 0; col < left.length; col += 1) {
      const diff = completeAbsDiff(left[row]![col]!, right[row]![col]!);
      if (Number.isNaN(diff)) continue;
      if (row === col) diagonal += diff;
      else offDiagonal += diff;
    }
  }
  if (options.mode === "graph") return offDiagonal / 2 + (options.diag ? diagonal : 0);
  return offDiagonal + (options.diag ? diagonal : 0);
}

function completeAbsDiff(left: number, right: number): number {
  return Number.isNaN(left) || Number.isNaN(right) ? Number.NaN : Math.abs(left - right);
}

function possibleTieCount(order: number, mode: GraphMode, diag: boolean): number {
  if (mode === "graph") return diag ? (order * (order + 1)) / 2 : (order * (order - 1)) / 2;
  return order * (order - (diag ? 0 : 1));
}

function covariance(left: readonly number[], right: readonly number[]): number {
  const pairs = completePairs(left, right);
  if (pairs.length < 2) return Number.NaN;
  const leftMean = meanFinite(pairs.map((pair) => pair[0]));
  const rightMean = meanFinite(pairs.map((pair) => pair[1]));
  let sum = 0;
  for (const [a, b] of pairs) sum += (a - leftMean) * (b - rightMean);
  return sum / (pairs.length - 1);
}

function correlation(left: readonly number[], right: readonly number[]): number {
  const pairs = completePairs(left, right);
  if (pairs.length < 2) return Number.NaN;
  const leftValues = pairs.map((pair) => pair[0]);
  const rightValues = pairs.map((pair) => pair[1]);
  const cov = covariance(leftValues, rightValues);
  const leftVar = covariance(leftValues, leftValues);
  const rightVar = covariance(rightValues, rightValues);
  const denom = Math.sqrt(leftVar * rightVar);
  return denom === 0 || Number.isNaN(denom) ? Number.NaN : cov / denom;
}

function completePairs(left: readonly number[], right: readonly number[]): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (!Number.isNaN(a) && !Number.isNaN(b)) out.push([a, b]);
  }
  return out;
}

function meanFinite(values: readonly number[]): number {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (Number.isNaN(value)) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? Number.NaN : sum / count;
}

function matrixValues(matrix: number[][]): number[] {
  const out: number[] = [];
  for (let col = 0; col < matrix.length; col += 1) {
    for (let row = 0; row < matrix.length; row += 1) out.push(matrix[row]![col]!);
  }
  return out;
}

function optimizeLabeling(left: number[][], right: number[][], score: (left: number[][], right: number[][]) => number, options: LabelOptimizeOptions): number {
  const method = options.method ?? "anneal";
  if (method === "none") return score(left, right);
  if (method === "exhaustive" || method === "mc" || method === "hillclimb" || method === "anneal" || method === "gumbel") {
    return labOptimize(left, right, score, {
      ...options,
      optMethod: method,
      ...(options.reps === undefined ? {} : { draws: options.reps }),
      exchangeList: options.exchangeList ?? 0,
      graphIndexA: options.graphIndexA,
      graphIndexB: options.graphIndexB,
      graphCount: options.graphCount,
    });
  }
  throw new RangeError(`unsupported structural comparison method: ${method}`);
}

function exhaustiveOptimize(
  left: number[][],
  right: number[][],
  groups: readonly number[][],
  score: (left: number[][], right: number[][]) => number,
  initial: number,
  seek: "min" | "max",
): number {
  let best = initial;
  for (const order of permutationsWithinGroups(groups, left.length)) {
    best = betterScore(score(left, permuteMatrix(right, order)), best, seek);
  }
  return best;
}

function hillclimbOptimize(
  left: number[][],
  right: number[][],
  groups: readonly number[][],
  score: (left: number[][], right: number[][]) => number,
  initial: number,
  seek: "min" | "max",
): number {
  let order = allIndices(left.length);
  let best = initial;
  let improved = true;
  while (improved) {
    improved = false;
    for (const candidate of swapNeighborhood(order, groups)) {
      const value = score(left, permuteMatrix(right, candidate));
      if (isBetterScore(value, best, seek)) {
        order = candidate;
        best = value;
        improved = true;
      }
    }
  }
  return best;
}

function annealOptimize(
  left: number[][],
  right: number[][],
  groups: readonly number[][],
  score: (left: number[][], right: number[][]) => number,
  initial: number,
  options: LabelOptimizeOptions,
): number {
  let order = allIndices(left.length);
  let current = initial;
  let best = initial;
  let prob = options.probInit ?? 0.9;
  const decay = options.probDecay ?? 0.85;
  let frozen = options.freezeTime ?? 25;
  const rng = resolveRandomSource(options);

  while (frozen > 0) {
    if (options.fullNeighborhood ?? true) {
      let moved = false;
      for (const candidate of swapNeighborhood(order, groups)) {
        const value = score(left, permuteMatrix(right, candidate));
        if (isBetterScore(value, current, options.seek)) {
          order = candidate;
          current = value;
          best = betterScore(value, best, options.seek);
          moved = true;
        }
      }
      if (!moved) {
        const neighbors = [...swapNeighborhood(order, groups)];
        if (neighbors.length > 0 && rng() < prob) {
          order = neighbors[Math.floor(rng() * neighbors.length)]!;
          current = score(left, permuteMatrix(right, order));
        }
        frozen -= 1;
      }
    } else {
      const neighbors = [...swapNeighborhood(order, groups)];
      if (neighbors.length === 0) break;
      const candidate = neighbors[Math.floor(rng() * neighbors.length)]!;
      const value = score(left, permuteMatrix(right, candidate));
      if (isBetterScore(value, current, options.seek) || rng() < prob) {
        order = candidate;
        current = value;
        best = betterScore(value, best, options.seek);
      }
      frozen -= 1;
    }
    prob *= decay;
  }
  return best;
}

function monteCarloOptimize(
  left: number[][],
  right: number[][],
  groups: readonly number[][],
  score: (left: number[][], right: number[][]) => number,
  initial: number,
  seek: "min" | "max",
  reps: number,
  options: RandomOptions,
): number {
  const rng = resolveRandomSource(options);
  let best = initial;
  for (let draw = 0; draw < reps; draw += 1) {
    const order = randomPermutationWithinGroups(groups, left.length, rng);
    best = betterScore(score(left, permuteMatrix(right, order)), best, seek);
  }
  return best;
}

function betterScore(candidate: number, best: number, seek: "min" | "max"): number {
  return isBetterScore(candidate, best, seek) ? candidate : best;
}

function isBetterScore(candidate: number, best: number, seek: "min" | "max"): boolean {
  if (Number.isNaN(candidate)) return false;
  if (Number.isNaN(best)) return true;
  return seek === "min" ? candidate < best : candidate > best;
}

function exchangeRows(exchangeList: ExchangeList, graphCount: number, order: number, left: number, right: number): [number[], number[]] {
  if (typeof exchangeList === "number") return [Array.from({ length: order }, () => exchangeList), Array.from({ length: order }, () => exchangeList)];
  if (!Array.isArray(exchangeList)) throw new TypeError("exchangeList must be a number, vector, or matrix");
  if (exchangeList.length === 0) throw new RangeError("exchangeList must not be empty");
  if (!Array.isArray(exchangeList[0])) {
    if (exchangeList.length !== order) throw new RangeError("exchangeList vector length must match graph order");
    const row = [...(exchangeList as readonly number[])];
    return [row, [...row]];
  }

  const matrix = exchangeList as readonly (readonly number[])[];
  if (matrix.length === order && matrix.every((row) => row.length === 2)) {
    return [matrix.map((row) => row[0]!), matrix.map((row) => row[1]!)];
  }
  if (matrix.length >= graphCount && matrix.every((row) => row.length === order)) {
    return [[...matrix[left]!], [...matrix[right]!]];
  }
  if (matrix.length === 2 && matrix.every((row) => row.length === order)) {
    return [[...matrix[0]!], [...matrix[1]!]];
  }
  throw new RangeError("exchangeList matrix must be graph-by-vertex, 2-by-vertex, or vertex-by-2");
}

function orderByLabels(labels: readonly number[]): number[] {
  return allIndices(labels.length).sort((a, b) => (labels[a]! === labels[b]! ? a - b : labels[a]! < labels[b]! ? -1 : 1));
}

function sameLabels(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exchangeGroups(labels: readonly number[]): number[][] {
  const groups: number[][] = [];
  for (let index = 0; index < labels.length; index += 1) {
    if (index === 0 || labels[index] !== labels[index - 1]) groups.push([]);
    groups[groups.length - 1]!.push(index);
  }
  return groups;
}

function* permutationsWithinGroups(groups: readonly number[][], order: number): Generator<number[]> {
  const current = allIndices(order);
  function* visit(groupIndex: number): Generator<number[]> {
    if (groupIndex >= groups.length) {
      yield [...current];
      return;
    }
    const positions = groups[groupIndex]!;
    for (const permutation of permutations(positions)) {
      for (let i = 0; i < positions.length; i += 1) current[positions[i]!] = permutation[i]!;
      yield* visit(groupIndex + 1);
    }
  }
  yield* visit(0);
}

function* permutations(values: readonly number[]): Generator<number[]> {
  if (values.length <= 1) {
    yield [...values];
    return;
  }
  for (let i = 0; i < values.length; i += 1) {
    const head = values[i]!;
    const rest = values.filter((_value, index) => index !== i);
    for (const tail of permutations(rest)) yield [head, ...tail];
  }
}

function* swapNeighborhood(order: readonly number[], groups: readonly number[][]): Generator<number[]> {
  for (const group of groups) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const next = [...order];
        const a = group[i]!;
        const b = group[j]!;
        const temp = next[a]!;
        next[a] = next[b]!;
        next[b] = temp;
        yield next;
      }
    }
  }
}

function randomPermutationWithinGroups(groups: readonly number[][], order: number, rng: () => number): number[] {
  const out = allIndices(order);
  for (const group of groups) {
    const shuffled = [...group];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const temp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = temp;
    }
    for (let i = 0; i < group.length; i += 1) out[group[i]!] = shuffled[i]!;
  }
  return out;
}

function permuteMatrix(matrix: number[][], order: readonly number[]): number[][] {
  return order.map((row) => order.map((col) => matrix[row]![col]!));
}

function condensedDistance(matrix: number[][], _order: number): number[] {
  const out: number[] = [];
  for (let col = 0; col < matrix.length; col += 1) {
    for (let row = col + 1; row < matrix.length; row += 1) out.push(matrix[row]![col]!);
  }
  return out;
}

function cutClusters(cluster: ClusterInput, k: number, n: number): number[] {
  if (!Number.isInteger(k) || k < 1) throw new RangeError("k must be a positive integer");
  if (isClusterLabelArray(cluster)) return relabelClusters(cluster, k, n);

  const direct = cluster.groups ?? cluster.labels;
  if (direct !== undefined) return relabelClusters(direct, k, n);

  const merge = cluster.merge;
  if (!merge) throw new TypeError("cluster object must contain groups, labels, or merge");
  if (merge.length !== n - 1) throw new RangeError("hclust merge length must be n - 1");
  const active = new Map<number, number[]>();
  for (let leaf = 1; leaf <= n; leaf += 1) active.set(-leaf, [leaf - 1]);
  const built = new Map<number, number[]>();
  for (let step = 0; step < n - k; step += 1) {
    const [left, right] = merge[step]!;
    const members = [...(active.get(left) ?? built.get(left) ?? []), ...(active.get(right) ?? built.get(right) ?? [])];
    if (members.length === 0) throw new RangeError("invalid hclust merge reference");
    active.delete(left);
    active.delete(right);
    built.set(step + 1, members);
    active.set(step + 1, members);
  }
  const labels = Array.from({ length: n }, () => 0);
  [...active.values()]
    .sort((a, b) => Math.min(...a) - Math.min(...b))
    .forEach((members, group) => {
      for (const member of members) labels[member] = group + 1;
    });
  return labels;
}

function isClusterLabelArray(cluster: ClusterInput): cluster is readonly number[] {
  return Array.isArray(cluster);
}

function relabelClusters(labels: readonly number[], k: number, n: number): number[] {
  if (labels.length !== n) throw new RangeError("cluster labels length must match data length");
  const unique = [...new Set<number>(labels)].sort((a, b) => a - b);
  if (unique.length > k) throw new RangeError("cluster labels contain more than k groups");
  const map = new Map(unique.map((value, index) => [value, index + 1]));
  return labels.map((value) => map.get(value)!);
}

function boxStats(values: readonly number[]): BoxStats {
  const sorted = values.filter((value) => !Number.isNaN(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return { n: 0, min: Number.NaN, q1: Number.NaN, median: Number.NaN, q3: Number.NaN, max: Number.NaN };
  return {
    n: sorted.length,
    min: sorted[0]!,
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1]!,
  };
}

function quantile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function cloneMatrix(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}
