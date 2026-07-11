import { isDenseGraph, isEdgeListInput } from "../core/graph";
import type { GraphInput } from "../core/types";
import { resolveRandomSource, shuffleInPlace, type RandomOptions, type RandomSource } from "../core/random";
import { asSociomatrixSna } from "./dataprep";

export type ExchangeLabel = string | number | boolean | null | undefined;
export type PermutationInput = GraphInput | readonly GraphInput[];
export type LabOptimizeMethod = "anneal" | "exhaustive" | "mc" | "hillclimb" | "gumbel";
export type LabOptimizeSeek = "min" | "max";
export type LabOptimizeExchangeList = ExchangeLabel | readonly ExchangeLabel[] | readonly (readonly ExchangeLabel[])[];
export type LabOptimizeFunction = (d1: number[][], d2: number[][], ...args: unknown[]) => number;

export interface PermutationOptions extends RandomOptions {}

export interface MatrixPermutationOptions extends RandomOptions {}

export interface LabOptimizeOptions extends RandomOptions {
  readonly exchangeList?: LabOptimizeExchangeList;
  readonly seek?: LabOptimizeSeek;
  readonly optMethod?: LabOptimizeMethod;
  readonly probInit?: number;
  readonly probDecay?: number;
  readonly freezeTime?: number;
  readonly fullNeighborhood?: boolean;
  readonly draws?: number;
  readonly tol?: number;
  readonly estimator?: "mean" | "median" | "mode";
  readonly graphIndexA?: number;
  readonly graphIndexB?: number;
  readonly graphCount?: number;
}

export function numperm(olength: number, permnum: number | bigint): number[] {
  if (!Number.isInteger(olength) || olength < 0) throw new RangeError("olength must be a non-negative integer");
  const upper = factorialBigInt(olength);
  const requested = normalizePermutationNumber(permnum);
  if (requested < 0n || requested >= upper) throw new RangeError("permnum must be an integer in [0, olength! - 1]");

  const out = Array.from({ length: olength }, () => -1);
  let remaining = requested;
  for (let item = 0; item < olength; item += 1) {
    let relativePosition = Number(remaining % BigInt(olength - item));
    let slot = 0;
    while (slot < olength) {
      if (out[slot] === -1) {
        if (relativePosition === 0) {
          out[slot] = item;
          break;
        }
        relativePosition -= 1;
      }
      slot += 1;
    }
    remaining /= BigInt(olength - item);
  }
  return out;
}

export function rperm(exchangeList: readonly ExchangeLabel[], options: PermutationOptions = {}): number[] {
  const rng = resolveRandomSource(options);
  const out = Array.from({ length: exchangeList.length }, (_unused, index) => index);
  const groups = new Map<ExchangeLabel, number[]>();

  for (let index = 0; index < exchangeList.length; index += 1) {
    const label = exchangeList[index];
    const group = groups.get(label) ?? [];
    group.push(index);
    groups.set(label, group);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const shuffled = shuffleInPlace([...group], rng);
    for (let index = 0; index < group.length; index += 1) out[group[index]!] = shuffled[index]!;
  }

  return out;
}

export function rmperm(input: PermutationInput, options: MatrixPermutationOptions = {}): number[][] | number[][][] {
  const rng = resolveRandomSource(options);
  if (isGraphStackInput(input)) return input.map((graph) => permuteSingleMatrix(graph, rng));
  return permuteSingleMatrix(input as GraphInput, rng);
}

export function labOptimize(d1: GraphInput, d2: GraphInput, fun: LabOptimizeFunction, options: LabOptimizeOptions = {}, ...args: unknown[]): number {
  const method = options.optMethod ?? "anneal";
  if (method === "anneal") return labOptimizeAnneal(d1, d2, fun, options, ...args);
  if (method === "exhaustive") return labOptimizeExhaustive(d1, d2, fun, options, ...args);
  if (method === "mc") return labOptimizeMc(d1, d2, fun, options, ...args);
  if (method === "hillclimb") return labOptimizeHillclimb(d1, d2, fun, options, ...args);
  return labOptimizeGumbel(d1, d2, fun, options, ...args);
}

export function labOptimizeAnneal(d1: GraphInput, d2: GraphInput, fun: LabOptimizeFunction, options: LabOptimizeOptions = {}, ...args: unknown[]): number {
  const prepared = prepareLabOptimize(d1, d2, fun, options, args);
  if (prepared.groups.every((group) => group.length <= 1)) return prepared.initial;
  let order = allIndices(prepared.order);
  let current = prepared.initial;
  let best = prepared.initial;
  let globalBest = prepared.initial;
  let prob = options.probInit ?? 1;
  const decay = options.probDecay ?? 0.99;
  let freezeTime = options.freezeTime ?? 1000;
  const fullNeighborhood = options.fullNeighborhood ?? true;
  const rng = resolveRandomSource(options);
  let locallyOptimal = false;

  while (!locallyOptimal || freezeTime > 0) {
    locallyOptimal = true;
    const neighbors = [...swapNeighborhood(order, prepared.groups)];
    if (neighbors.length === 0) break;

    if (fullNeighborhood) {
      const scored = neighbors.map((candidate) => ({ candidate, value: prepared.score(candidate) })).filter((row) => Number.isFinite(row.value));
      if (scored.length === 0) break;
      const bestValue = prepared.seek === "min" ? Math.min(...scored.map((row) => row.value)) : Math.max(...scored.map((row) => row.value));
      const bestCandidates = scored.filter((row) => row.value === bestValue);
      const chosen = bestCandidates[randomIndex(rng, bestCandidates.length)]!;
      if (isBetterScore(chosen.value, current, prepared.seek) || (prepared.seek === "max" && rng() < prob)) {
        order = chosen.candidate;
        current = chosen.value;
        locallyOptimal = !isBetterScore(chosen.value, best, prepared.seek);
        best = betterScore(chosen.value, best, prepared.seek);
        globalBest = betterScore(chosen.value, globalBest, prepared.seek);
      } else if (freezeTime > 0 && rng() < prob) {
        const fallback = neighbors[randomIndex(rng, neighbors.length)]!;
        order = fallback;
        current = prepared.score(order);
      }
    } else {
      const candidate = neighbors[randomIndex(rng, neighbors.length)]!;
      const value = prepared.score(candidate);
      if (isBetterScore(value, current, prepared.seek)) {
        order = candidate;
        current = value;
        locallyOptimal = false;
        globalBest = betterScore(value, globalBest, prepared.seek);
      } else if (freezeTime > 0 && rng() < prob) {
        order = candidate;
        current = value;
        globalBest = betterScore(value, globalBest, prepared.seek);
      }
    }
    freezeTime -= 1;
    prob *= decay;
  }
  return globalBest;
}

export function labOptimizeExhaustive(d1: GraphInput, d2: GraphInput, fun: LabOptimizeFunction, options: LabOptimizeOptions = {}, ...args: unknown[]): number {
  const prepared = prepareLabOptimize(d1, d2, fun, options, args);
  if (prepared.groups.every((group) => group.length <= 1)) return prepared.initial;
  let best = prepared.initial;
  for (const order of permutationsWithinGroups(prepared.groups, prepared.order)) best = betterScore(prepared.score(order), best, prepared.seek);
  return best;
}

export function labOptimizeHillclimb(d1: GraphInput, d2: GraphInput, fun: LabOptimizeFunction, options: LabOptimizeOptions = {}, ...args: unknown[]): number {
  const prepared = prepareLabOptimize(d1, d2, fun, options, args);
  if (prepared.groups.every((group) => group.length <= 1)) return prepared.initial;
  let order = allIndices(prepared.order);
  let best = prepared.initial;
  let improved = true;
  const rng = resolveRandomSource(options);
  while (improved) {
    improved = false;
    const scored = [...swapNeighborhood(order, prepared.groups)].map((candidate) => ({ candidate, value: prepared.score(candidate) }));
    const bestValue = prepared.seek === "min" ? Math.min(...scored.map((row) => row.value)) : Math.max(...scored.map((row) => row.value));
    const candidates = scored.filter((row) => row.value === bestValue);
    const chosen = candidates[randomIndex(rng, candidates.length)]!;
    if (chosen && isBetterScore(chosen.value, best, prepared.seek)) {
      order = chosen.candidate;
      best = chosen.value;
      improved = true;
    }
  }
  return best;
}

export function labOptimizeMc(d1: GraphInput, d2: GraphInput, fun: LabOptimizeFunction, options: LabOptimizeOptions = {}, ...args: unknown[]): number {
  const prepared = prepareLabOptimize(d1, d2, fun, options, args);
  if (prepared.groups.every((group) => group.length <= 1)) return prepared.initial;
  const draws = resolveNonnegativeInteger(options.draws ?? 1000, "draws");
  const rng = resolveRandomSource(options);
  let best = prepared.initial;
  for (let draw = 0; draw < draws; draw += 1) best = betterScore(prepared.score(randomPermutationWithinGroups(prepared.groups, prepared.order, rng)), best, prepared.seek);
  return best;
}

export function labOptimizeGumbel(d1: GraphInput, d2: GraphInput, fun: LabOptimizeFunction, options: LabOptimizeOptions = {}, ...args: unknown[]): number {
  const prepared = prepareLabOptimize(d1, d2, fun, options, args);
  const draws = resolvePositiveInteger(options.draws ?? 500, "draws");
  const tol = options.tol ?? 1e-5;
  const rng = resolveRandomSource(options);
  const values = Array.from({ length: draws }, () => prepared.score(randomPermutationWithinGroups(prepared.groups, prepared.order, rng))).filter(Number.isFinite);
  if (values.length === 0) return Number.NaN;
  let b = 1;
  let diff = Number.POSITIVE_INFINITY;
  const meanValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  while (diff > tol) {
    const old = b;
    const weights = values.map((value) => Math.exp(-value / b));
    const denom = weights.reduce((sum, value) => sum + value, 0);
    b = meanValue - values.reduce((sum, value, index) => sum + value * weights[index]!, 0) / denom;
    if (!Number.isFinite(b) || Math.abs(b) <= tol) return prepared.seek === "min" ? Math.min(...values) : Math.max(...values);
    diff = Math.abs(old - b);
  }
  const a = -b * Math.log(values.reduce((sum, value) => sum + Math.exp(-value / b), 0) / values.length);
  const estimator = options.estimator ?? "median";
  if (estimator === "mean") return a + 0.5772156649015329 * b;
  if (estimator === "mode") return a;
  return a - b * Math.log(Math.log(2));
}

export function permuteMatrixByOrder(matrix: readonly (readonly number[])[], order: readonly number[]): number[][] {
  return order.map((row) => order.map((col) => matrix[row]![col]!));
}

function normalizePermutationNumber(value: number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) throw new RangeError("permnum must be a safe integer or bigint");
  return BigInt(value);
}

function factorialBigInt(value: number): bigint {
  let out = 1n;
  for (let i = 2; i <= value; i += 1) out *= BigInt(i);
  return out;
}

function permuteSingleMatrix(input: GraphInput, rng: RandomSource): number[][] {
  const matrix = asSociomatrixSna(input) as number[][];
  const order = matrix.length;
  const permutation = shuffleInPlace(Array.from({ length: order }, (_unused, index) => index), rng);
  return permutation.map((row) => permutation.map((col) => matrix[row]![col]!));
}

function isGraphStackInput(input: PermutationInput): input is readonly GraphInput[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as unknown;
  if (isDenseGraph(first as GraphInput) || isEdgeListInput(first as GraphInput)) return true;
  return Array.isArray(first) && first.length > 0 && Array.isArray(first[0]);
}

interface PreparedLabOptimize {
  readonly order: number;
  readonly groups: number[][];
  readonly initial: number;
  readonly seek: LabOptimizeSeek;
  readonly score: (order: readonly number[]) => number;
}

function prepareLabOptimize(d1: GraphInput, d2: GraphInput, fun: LabOptimizeFunction, options: LabOptimizeOptions, args: readonly unknown[]): PreparedLabOptimize {
  const left = asSociomatrixSna(d1) as number[][];
  const right = asSociomatrixSna(d2) as number[][];
  if (left.length !== right.length || left.some((row) => row.length !== left.length) || right.some((row) => row.length !== right.length)) {
    throw new RangeError("lab.optimize routines require input graphs to be of identical order");
  }
  const order = left.length;
  const [leftLabels, rightLabels] = exchangeRows(options.exchangeList ?? 0, options.graphCount ?? 2, order, options.graphIndexA ?? 0, options.graphIndexB ?? 1);
  const leftOrder = orderByLabels(leftLabels);
  const rightOrder = orderByLabels(rightLabels);
  const sortedLeftLabels = leftOrder.map((index) => leftLabels[index]!);
  const sortedRightLabels = rightOrder.map((index) => rightLabels[index]!);
  if (!sameLabels(sortedLeftLabels, sortedRightLabels)) throw new RangeError("Illegal exchange list; lists must be comparable");

  const preparedLeft = permuteMatrixByOrder(left, leftOrder);
  const preparedRight = permuteMatrixByOrder(right, rightOrder);
  const groups = exchangeGroups(sortedLeftLabels);
  const seek = options.seek ?? "min";
  const score = (nextOrder: readonly number[]) => fun(preparedLeft, permuteMatrixByOrder(preparedRight, nextOrder), ...args);
  return { order, groups, initial: fun(preparedLeft, preparedRight, ...args), seek, score };
}

function exchangeRows(exchangeList: LabOptimizeExchangeList, graphCount: number, order: number, left: number, right: number): [ExchangeLabel[], ExchangeLabel[]] {
  if (!Array.isArray(exchangeList)) {
    const label = exchangeList as ExchangeLabel;
    return [Array.from({ length: order }, () => label), Array.from({ length: order }, () => label)];
  }
  if (exchangeList.length === 0) throw new RangeError("exchangeList must not be empty");
  if (!Array.isArray(exchangeList[0])) {
    if (exchangeList.length !== order) throw new RangeError("exchangeList vector length must match graph order");
    const row = [...(exchangeList as readonly ExchangeLabel[])];
    return [row, [...row]];
  }

  const matrix = exchangeList as readonly (readonly ExchangeLabel[])[];
  if (matrix.length === order && matrix.every((row) => row.length === 2)) {
    return [matrix.map((row) => row[0]), matrix.map((row) => row[1])];
  }
  if (matrix.length >= graphCount && matrix.every((row) => row.length === order)) {
    return [[...matrix[left]!], [...matrix[right]!]];
  }
  if (matrix.length === 2 && matrix.every((row) => row.length === order)) return [[...matrix[0]!], [...matrix[1]!]];
  throw new RangeError("exchangeList matrix must be graph-by-vertex, 2-by-vertex, or vertex-by-2");
}

function orderByLabels(labels: readonly ExchangeLabel[]): number[] {
  return allIndices(labels.length).sort((a, b) => {
    const cmp = compareLabels(labels[a], labels[b]);
    return cmp === 0 ? a - b : cmp;
  });
}

function compareLabels(a: ExchangeLabel, b: ExchangeLabel): number {
  if (a === b) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function sameLabels(left: readonly ExchangeLabel[], right: readonly ExchangeLabel[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exchangeGroups(labels: readonly ExchangeLabel[]): number[][] {
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

function randomPermutationWithinGroups(groups: readonly number[][], order: number, rng: RandomSource): number[] {
  const out = allIndices(order);
  for (const group of groups) {
    const shuffled = shuffleInPlace([...group], rng);
    for (let i = 0; i < group.length; i += 1) out[group[i]!] = shuffled[i]!;
  }
  return out;
}

function betterScore(candidate: number, best: number, seek: LabOptimizeSeek): number {
  return isBetterScore(candidate, best, seek) ? candidate : best;
}

function isBetterScore(candidate: number, best: number, seek: LabOptimizeSeek): boolean {
  if (Number.isNaN(candidate)) return false;
  if (Number.isNaN(best)) return true;
  return seek === "min" ? candidate < best : candidate > best;
}

function allIndices(count: number): number[] {
  return Array.from({ length: count }, (_unused, index) => index);
}

function randomIndex(rng: RandomSource, count: number): number {
  return Math.floor(rng() * count);
}

function resolveNonnegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`);
  return value;
}

function resolvePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer`);
  return value;
}
