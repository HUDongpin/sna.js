// Ported from R sna 2.8: R/randomgraph.R (`rgraph`, `rgnm`, `rguman`, `rgws`, `rgbn`, `rgnmix`, `rewire.ws`, `rewire.ud`).
import { isDenseGraph, isEdgeListInput } from "../core/graph";
import { createNumberMatrix } from "../core/matrix";
import type { GraphInput, GraphMode, MatrixLike } from "../core/types";
import {
  assertProbability,
  binomial,
  randomInt,
  resolveRandomSource,
  sampleWithoutReplacement,
  shuffleInPlace,
  type RandomOptions,
  type RandomSource,
} from "../core/random";
import { asEdgelistSna, asSociomatrixSna, type EdgelistResult } from "./dataprep";

export type ProbabilityMatrix = ReadonlyArray<ReadonlyArray<number>>;
export type ProbabilityStack = ReadonlyArray<ProbabilityMatrix>;
export type TieProbability = number | readonly number[] | ProbabilityMatrix | ProbabilityStack;
export type TieList = readonly number[] | MatrixLike | ReadonlyArray<MatrixLike>;
export type RandomGraphResult = number[][] | number[][][] | EdgelistResult;

export interface RgraphOptions extends RandomOptions {
  readonly graphs?: number;
  readonly tprob?: TieProbability;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly replace?: boolean;
  readonly tielist?: TieList;
  readonly returnAsEdgelist?: boolean;
}

export interface RgnmOptions extends RandomOptions {
  readonly graphs?: number;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly returnAsEdgelist?: boolean;
}

export type RgnmixType = number | string;

export interface RgnmixOptions extends RandomOptions {
  readonly graphs?: number;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly method?: "probability" | "exact";
  readonly returnAsEdgelist?: boolean;
  readonly levels?: readonly string[];
}

export interface RgumanOptions extends RandomOptions {
  readonly graphs?: number;
  readonly mut?: number;
  readonly asym?: number;
  readonly null?: number;
  readonly nullDyads?: number;
  readonly method?: "probability" | "exact";
  readonly returnAsEdgelist?: boolean;
}

export interface RewireOptions extends RandomOptions {
  readonly returnAsEdgelist?: boolean;
}

export interface RgwsOptions extends RewireOptions {
  readonly graphs?: number;
}

export interface RgbnParameters {
  readonly pi?: number;
  readonly sigma?: number;
  readonly rho?: number;
  readonly d?: number | ProbabilityMatrix;
  readonly delta?: number;
  readonly epsilon?: number | ProbabilityMatrix;
}

export interface RgbnOptions extends RandomOptions {
  readonly graphs?: number;
  readonly param?: RgbnParameters;
  readonly burn?: number;
  readonly thin?: number;
  readonly maxiter?: number;
  readonly method?: "mcmc" | "cftp";
  readonly dichotomizeSibEffects?: boolean;
  readonly returnAsEdgelist?: boolean;
  readonly seedGraph?: GraphInput;
  readonly maxDensity?: number;
}

export interface RgbnResult {
  readonly graphs: RandomGraphResult;
  readonly earlyTermination: boolean;
  readonly cftpConverged?: boolean[];
}

type EdgeCandidate = readonly [number, number];

export function rgraph(order: number, options: RgraphOptions = {}): RandomGraphResult {
  assertOrder(order, "order");
  const rng = resolveRandomSource(options);
  const graphCount = resolveGraphCount(options.graphs);
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const directed = mode !== "graph";

  const stack = Array.from({ length: graphCount }, (_unused, graphIndex) =>
    options.tielist === undefined
      ? drawBernoulliGraph(order, graphIndex, graphCount, options.tprob ?? 0.5, directed, diag, rng)
      : drawTielistGraph(order, graphIndex, options.tielist, options.replace ?? false, directed, diag, rng),
  );

  return formatGraphResult(stack, options.returnAsEdgelist ?? false);
}

export function rgnm(order: number, edgeCount: number | readonly number[], options: RgnmOptions = {}): RandomGraphResult {
  assertOrder(order, "order");
  const rng = resolveRandomSource(options);
  const graphCount = resolveGraphCount(options.graphs);
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const directed = mode !== "graph";
  const candidates = edgeCandidates(order, directed, diag);

  const stack = Array.from({ length: graphCount }, (_unused, graphIndex) => {
    const m = resolveNumericSequence(edgeCount, graphIndex, "edgeCount");
    if (!Number.isInteger(m) || m < 0) throw new RangeError("edgeCount must be a non-negative integer");
    if (m > candidates.length) throw new RangeError("too many edges requested in rgnm");

    const matrix = createNumberMatrix(order, order);
    for (const candidateIndex of sampleWithoutReplacement(candidates.length, m, rng)) {
      const [tail, head] = candidates[candidateIndex]!;
      matrix[tail]![head] = 1;
      if (!directed && tail !== head) matrix[head]![tail] = 1;
    }
    return matrix;
  });

  return formatGraphResult(stack, options.returnAsEdgelist ?? false);
}

export function rguman(order: number, options: RgumanOptions = {}): RandomGraphResult {
  assertOrder(order, "order");
  const rng = resolveRandomSource(options);
  const graphCount = resolveGraphCount(options.graphs);
  const method = options.method ?? "probability";
  const dyads = edgeCandidates(order, false, false);
  const dyadCount = dyads.length;
  let mut = options.mut ?? 0.25;
  let asym = options.asym ?? 0.5;
  let nullDyads = options.nullDyads ?? options.null ?? 0.25;

  if (method === "exact") {
    if (![mut, asym, nullDyads].every(Number.isInteger)) throw new RangeError("exact U|MAN counts must be integers");
    if (mut + asym + nullDyads !== dyadCount) throw new RangeError("sum of dyad counts must equal the number of dyads");
  } else {
    if (mut < 0 || asym < 0 || nullDyads < 0) throw new RangeError("U|MAN probabilities must be non-negative");
    const total = mut + asym + nullDyads;
    if (total <= 0) throw new RangeError("at least one U|MAN probability must be positive");
    mut /= total;
    asym /= total;
    nullDyads /= total;
  }

  const stack = Array.from({ length: graphCount }, () => {
    let mutualCount: number;
    let asymmetricCount: number;
    let nullCount: number;
    if (method === "probability") {
      mutualCount = binomial(dyadCount, mut, rng);
      asymmetricCount = binomial(dyadCount - mutualCount, asym + nullDyads === 0 ? 0 : asym / (asym + nullDyads), rng);
      nullCount = dyadCount - mutualCount - asymmetricCount;
    } else {
      mutualCount = mut;
      asymmetricCount = asym;
      nullCount = nullDyads;
    }

    const states = shuffleInPlace(
      [
        ...Array.from({ length: mutualCount }, () => 1),
        ...Array.from({ length: asymmetricCount }, () => 2),
        ...Array.from({ length: nullCount }, () => 3),
      ],
      rng,
    );
    const matrix = createNumberMatrix(order, order);
    for (let index = 0; index < dyads.length; index += 1) {
      const [tail, head] = dyads[index]!;
      const state = states[index]!;
      if (state === 1) {
        matrix[tail]![head] = 1;
        matrix[head]![tail] = 1;
      } else if (state === 2) {
        if (rng() < 0.5) matrix[tail]![head] = 1;
        else matrix[head]![tail] = 1;
      }
    }
    return matrix;
  });

  return formatGraphResult(stack, options.returnAsEdgelist ?? false);
}

export function rgnmix(types: readonly RgnmixType[], mix: ProbabilityMatrix, options: RgnmixOptions = {}): RandomGraphResult {
  if (types.length === 0) throw new RangeError("types must contain at least one vertex type");
  if (!Array.isArray(mix) || mix.length === 0 || mix.some((row) => row.length !== mix.length)) throw new RangeError("mix must be a square matrix");
  const typeIds = normalizeMixTypes(types, mix.length, options.levels);
  const graphCount = resolveGraphCount(options.graphs);
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const method = options.method ?? "probability";
  const rng = resolveRandomSource(options);

  if (method === "probability") {
    const tprob = typeIds.map((tailType) => typeIds.map((headType) => mix[tailType]![headType]!));
    return rgraph(types.length, {
      graphs: graphCount,
      tprob,
      mode,
      diag,
      rng,
      ...(options.returnAsEdgelist === undefined ? {} : { returnAsEdgelist: options.returnAsEdgelist }),
    });
  }

  const counts = mix.map((row: readonly number[], rowIndex: number) =>
    row.map((value: number, colIndex: number) => {
      if (!Number.isInteger(value) || value < 0) throw new RangeError(`mix[${rowIndex},${colIndex}] must be a non-negative integer for exact rgnmix`);
      return value;
    }),
  );
  const groups = Array.from({ length: mix.length }, (_unused, group) => typeIds.flatMap((value, vertex) => (value === group ? [vertex] : [])));
  const stack = Array.from({ length: graphCount }, () => drawExactMixedGraph(types.length, groups, counts, mode, diag, rng));
  return formatGraphResult(stack, options.returnAsEdgelist ?? false);
}

export function rgws(verticesPerDimension: number, dimension: number, z: number, p: number, options: RgwsOptions = {}): RandomGraphResult {
  assertOrder(verticesPerDimension, "verticesPerDimension");
  assertOrder(dimension, "dimension");
  if (!Number.isFinite(z) || z < 0) throw new RangeError("z must be a non-negative number");
  assertProbability(p, "p");

  const graphCount = resolveGraphCount(options.graphs);
  const totalVertices = verticesPerDimension ** dimension;
  assertOrder(totalVertices, "verticesPerDimension ** dimension");
  const lattice = wattsStrogatzLattice(verticesPerDimension, dimension, z);
  const stack = Array.from({ length: graphCount }, () => cloneMatrix(lattice));
  const rewired = rewireStack(stack, p, "ws", resolveRandomSource(options));
  return formatGraphResult(rewired, options.returnAsEdgelist ?? false);
}

export function rewireWs(input: GraphInput | readonly GraphInput[], p: number, options: RewireOptions = {}): RandomGraphResult {
  assertProbability(p, "p");
  const rng = resolveRandomSource(options);
  const stackInput = isGraphStackInput(input);
  const stack = stackInput ? input.map((graph) => asSociomatrixSna(graph) as number[][]) : [asSociomatrixSna(input as GraphInput) as number[][]];
  const rewired = rewireStack(stack, p, "ws", rng);
  return formatGraphResultForShape(rewired, options.returnAsEdgelist ?? false, stackInput);
}

export function rewireUd(input: GraphInput | readonly GraphInput[], p: number, options: RewireOptions = {}): RandomGraphResult {
  assertProbability(p, "p");
  const rng = resolveRandomSource(options);
  const stackInput = isGraphStackInput(input);
  const stack = stackInput ? input.map((graph) => asSociomatrixSna(graph) as number[][]) : [asSociomatrixSna(input as GraphInput) as number[][]];
  const rewired = rewireStack(stack, p, "ud", rng);
  return formatGraphResultForShape(rewired, options.returnAsEdgelist ?? false, stackInput);
}

export function rgbn(order: number, options: RgbnOptions = {}): RgbnResult {
  assertOrder(order, "order");

  const rng = resolveRandomSource(options);
  const graphCount = resolveGraphCount(options.graphs);
  const param = options.param ?? {};
  const pi = param.pi ?? 0;
  const sigma = param.sigma ?? 0;
  const rho = param.rho ?? 0;
  const delta = param.delta ?? 0;
  [pi, sigma, rho, delta].forEach((value, index) => assertProbability(value, ["pi", "sigma", "rho", "delta"][index]!));
  const d = expandProbabilityMatrix(param.d ?? 0.5, order, "d");
  const epsilon = expandProbabilityMatrix(param.epsilon ?? 0, order, "epsilon");
  const method = options.method ?? "mcmc";

  if (method === "cftp") {
    if (delta > 0) throw new Error("Satiation parameter (delta) is not supported with rgbn CFTP; use MCMC instead");
    if (epsilon.some((row) => row.some((value) => value > 0))) throw new Error("Inhibition events (epsilon) are not supported with rgbn CFTP; use MCMC instead");
    const maxiter = options.maxiter ?? 1e7;
    if (!Number.isInteger(maxiter) || maxiter < 0) throw new RangeError("maxiter must be a non-negative integer");
    const cftp = Array.from({ length: graphCount }, () => bnCftpDraw(order, { pi, sigma, rho, d, dichotomize: options.dichotomizeSibEffects ?? false, maxiter }, rng));
    return {
      graphs: formatGraphResult(cftp.map((draw) => draw.graph), options.returnAsEdgelist ?? false),
      earlyTermination: false,
      cftpConverged: cftp.map((draw) => draw.converged),
    };
  }

  const burn = options.burn ?? order * order * 5 * 100;
  const thin = options.thin ?? order * order * 5;
  if (!Number.isInteger(burn) || burn < 0) throw new RangeError("burn must be a non-negative integer");
  if (!Number.isInteger(thin) || thin <= 0) throw new RangeError("thin must be a positive integer");
  const current = initialBnGraph(order, options.seedGraph);
  const bnState = initializeBnState(current);
  const maxDensity = options.maxDensity ?? 1;
  if (!Number.isFinite(maxDensity) || maxDensity < 0) throw new RangeError("maxDensity must be a non-negative number");
  const maxEdges = maxDensity * order * (order - 1);

  let earlyTermination = false;
  const draws: number[][][] = [];
  const update = () => {
    if (order < 2) return true;
    const ok = bnMcmcUpdate(bnState, { pi, sigma, rho, delta, d, epsilon, dichotomize: options.dichotomizeSibEffects ?? false, maxEdges }, rng);
    if (!ok) earlyTermination = true;
    return ok;
  };

  for (let count = 0; count < burn; count += 1) {
    if (!update()) break;
  }

  for (let draw = 0; draw < graphCount; draw += 1) {
    if (!earlyTermination) {
      for (let count = 0; count < thin; count += 1) {
        if (!update()) break;
      }
    }
    draws.push(cloneMatrix(bnState.graph));
    if (earlyTermination) {
      while (draws.length < graphCount) draws.push(cloneMatrix(bnState.graph));
      break;
    }
  }

  return { graphs: formatGraphResult(draws, options.returnAsEdgelist ?? false), earlyTermination };
}

function drawBernoulliGraph(
  order: number,
  graphIndex: number,
  graphCount: number,
  tprob: TieProbability,
  directed: boolean,
  diag: boolean,
  rng: RandomSource,
): number[][] {
  validateTieProbability(tprob, order, graphCount);
  const matrix = createNumberMatrix(order, order);

  if (directed) {
    for (let tail = 0; tail < order; tail += 1) {
      for (let head = 0; head < order; head += 1) {
        if (!diag && tail === head) continue;
        const probability = probabilityAt(tprob, graphIndex, tail, head);
        if (rng() < probability) matrix[tail]![head] = 1;
      }
    }
    return matrix;
  }

  for (let tail = 0; tail < order; tail += 1) {
    const start = diag ? tail : tail + 1;
    for (let head = start; head < order; head += 1) {
      const probability = probabilityAt(tprob, graphIndex, tail, head);
      if (rng() < probability) {
        matrix[tail]![head] = 1;
        matrix[head]![tail] = 1;
      }
    }
  }
  return matrix;
}

function drawTielistGraph(order: number, graphIndex: number, tielist: TieList, replace: boolean, directed: boolean, diag: boolean, rng: RandomSource): number[][] {
  const values = tieValues(tielist, graphIndex);
  const needed = order * order;
  if (values.length === 0) throw new RangeError("tielist must contain at least one value");
  if (!replace && values.length < needed) throw new RangeError("tielist is too small to sample without replacement");

  const sampled = replace
    ? Array.from({ length: needed }, () => values[randomInt(rng, values.length)]!)
    : sampleWithoutReplacement(values.length, needed, rng).map((index) => values[index]!);
  const matrix = createNumberMatrix(order, order);
  for (let row = 0; row < order; row += 1) {
    for (let col = 0; col < order; col += 1) matrix[row]![col] = sampled[row * order + col]!;
  }
  if (!diag) for (let i = 0; i < order; i += 1) matrix[i]![i] = 0;
  if (!directed) {
    for (let row = 0; row < order; row += 1) {
      for (let col = row + 1; col < order; col += 1) matrix[row]![col] = matrix[col]![row]!;
    }
  }
  return matrix;
}

function normalizeMixTypes(types: readonly RgnmixType[], levelCount: number, levels: readonly string[] | undefined): number[] {
  const levelIndex = new Map<string, number>();
  levels?.forEach((level, index) => {
    if (index >= levelCount) throw new RangeError("levels length must not exceed mix dimensions");
    levelIndex.set(level, index);
  });
  return types.map((type) => {
    if (typeof type === "number") {
      if (!Number.isInteger(type) || type < 0 || type >= levelCount) throw new RangeError("numeric rgnmix types must be zero-based indices into mix");
      return type;
    }
    const index = levelIndex.get(type);
    if (index === undefined) throw new RangeError("string rgnmix types require options.levels entries matching mix rows");
    return index;
  });
}

function drawExactMixedGraph(order: number, groups: readonly (readonly number[])[], counts: readonly (readonly number[])[], mode: GraphMode, diag: boolean, rng: RandomSource): number[][] {
  const directed = mode !== "graph";
  const matrix = createNumberMatrix(order, order);
  if (directed) {
    for (let rowType = 0; rowType < groups.length; rowType += 1) {
      for (let colType = 0; colType < groups.length; colType += 1) {
        const candidates = blockCandidates(groups[rowType]!, groups[colType]!, true, diag);
        placeMixedEdges(matrix, candidates, counts[rowType]![colType]!, true, rng);
      }
    }
    return matrix;
  }

  for (let rowType = 0; rowType < groups.length; rowType += 1) {
    for (let colType = rowType; colType < groups.length; colType += 1) {
      const candidates = blockCandidates(groups[rowType]!, groups[colType]!, rowType !== colType, diag);
      placeMixedEdges(matrix, candidates, counts[rowType]![colType]!, false, rng);
    }
  }
  return matrix;
}

function blockCandidates(tails: readonly number[], heads: readonly number[], directedBlock: boolean, diag: boolean): EdgeCandidate[] {
  const out: EdgeCandidate[] = [];
  if (directedBlock) {
    for (const tail of tails) {
      for (const head of heads) {
        if (!diag && tail === head) continue;
        out.push([tail, head]);
      }
    }
    return out;
  }
  for (let i = 0; i < tails.length; i += 1) {
    for (let j = i + (diag ? 0 : 1); j < tails.length; j += 1) out.push([tails[i]!, tails[j]!]);
  }
  return out;
}

function placeMixedEdges(matrix: number[][], candidates: readonly EdgeCandidate[], count: number, directed: boolean, rng: RandomSource): void {
  if (count > candidates.length) throw new RangeError("mix requests more ties than are possible for a block");
  for (const candidateIndex of sampleWithoutReplacement(candidates.length, count, rng)) {
    const [tail, head] = candidates[candidateIndex]!;
    matrix[tail]![head] = 1;
    if (!directed && tail !== head) matrix[head]![tail] = 1;
  }
}

function edgeCandidates(order: number, directed: boolean, diag: boolean): EdgeCandidate[] {
  const candidates: EdgeCandidate[] = [];
  if (directed) {
    for (let tail = 0; tail < order; tail += 1) {
      for (let head = 0; head < order; head += 1) {
        if (!diag && tail === head) continue;
        candidates.push([tail, head]);
      }
    }
    return candidates;
  }

  for (let tail = 0; tail < order; tail += 1) {
    const start = diag ? tail : tail + 1;
    for (let head = start; head < order; head += 1) candidates.push([tail, head]);
  }
  return candidates;
}

function wattsStrogatzLattice(verticesPerDimension: number, dimension: number, z: number): number[][] {
  const total = verticesPerDimension ** dimension;
  const coordinates = Array.from({ length: total }, (_unused, vertex) => latticeCoordinate(vertex, verticesPerDimension, dimension));
  const matrix = createNumberMatrix(total, total);
  for (let i = 0; i < total; i += 1) {
    for (let j = i + 1; j < total; j += 1) {
      if (manhattanDistance(coordinates[i]!, coordinates[j]!) <= z) {
        matrix[i]![j] = 1;
        matrix[j]![i] = 1;
      }
    }
  }
  return matrix;
}

function latticeCoordinate(vertex: number, verticesPerDimension: number, dimension: number): number[] {
  const coordinate = Array.from({ length: dimension }, () => 0);
  let value = vertex;
  for (let axis = dimension - 1; axis >= 0; axis -= 1) {
    coordinate[axis] = value % verticesPerDimension;
    value = Math.floor(value / verticesPerDimension);
  }
  return coordinate;
}

function manhattanDistance(left: readonly number[], right: readonly number[]): number {
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) distance += Math.abs(left[index]! - right[index]!);
  return distance;
}

function rewireStack(stack: readonly number[][][], p: number, mode: "ws" | "ud", rng: RandomSource): number[][][] {
  return stack.map((matrix) => (mode === "ws" ? rewireWsSingle(matrix, p, rng) : rewireUdSingle(matrix, p, rng)));
}

function rewireWsSingle(matrix: number[][], p: number, rng: RandomSource): number[][] {
  const original = cloneMatrix(matrix);
  const out = cloneMatrix(matrix);
  const order = out.length;
  if (order < 3) return out;

  for (let tail = 0; tail < order; tail += 1) {
    for (let head = tail + 1; head < order; head += 1) {
      if ((original[tail]![head]! === 0 && original[head]![tail]! === 0) || rng() >= p) continue;
      const moveHead = rng() < 0.5;
      const candidates: EdgeCandidate[] = [];
      if (moveHead) {
        for (let nextHead = 0; nextHead < order; nextHead += 1) {
          if (nextHead === tail || nextHead === head) continue;
          if (out[tail]![nextHead]! === 0 && out[nextHead]![tail]! === 0) candidates.push([tail, nextHead]);
        }
      } else {
        for (let nextTail = 0; nextTail < order; nextTail += 1) {
          if (nextTail === tail || nextTail === head) continue;
          if (out[nextTail]![head]! === 0 && out[head]![nextTail]! === 0) candidates.push([nextTail, head]);
        }
      }
      if (candidates.length === 0) continue;
      const [newTail, newHead] = candidates[randomInt(rng, candidates.length)]!;
      swapDyads(out, tail, head, newTail, newHead);
    }
  }

  return out;
}

function rewireUdSingle(matrix: number[][], p: number, rng: RandomSource): number[][] {
  const out = cloneMatrix(matrix);
  const order = out.length;
  if (order < 3) return out;

  for (let tail = 0; tail < order; tail += 1) {
    for (let head = tail + 1; head < order; head += 1) {
      if (rng() >= p) continue;
      const choices = Array.from({ length: order }, (_unused, vertex) => vertex).filter((vertex) => vertex !== tail && vertex !== head);
      const moveHead = rng() < 0.5;
      const replacement = choices[randomInt(rng, choices.length)]!;
      const newTail = moveHead ? tail : replacement;
      const newHead = moveHead ? replacement : head;
      swapDyads(out, tail, head, newTail, newHead);
    }
  }

  return out;
}

function swapDyads(matrix: number[][], tail: number, head: number, newTail: number, newHead: number): void {
  const forward = matrix[newTail]![newHead]!;
  const reverse = matrix[newHead]![newTail]!;
  matrix[newTail]![newHead] = matrix[tail]![head]!;
  matrix[newHead]![newTail] = matrix[head]![tail]!;
  matrix[tail]![head] = forward;
  matrix[head]![tail] = reverse;
}

interface BnState {
  readonly graph: number[][];
  readonly parents: number[][];
  readonly outdegree: number[];
  edgeCount: number;
}

interface BnUpdateOptions {
  readonly pi: number;
  readonly sigma: number;
  readonly rho: number;
  readonly delta: number;
  readonly d: number[][];
  readonly epsilon: number[][];
  readonly dichotomize: boolean;
  readonly maxEdges: number;
}

interface BnCftpOptions {
  readonly pi: number;
  readonly sigma: number;
  readonly rho: number;
  readonly d: number[][];
  readonly dichotomize: boolean;
  readonly maxiter: number;
}

interface BnCftpEvent {
  readonly tail: number;
  readonly head: number;
  readonly coin: number;
}

function initialBnGraph(order: number, seedGraph?: GraphInput): number[][] {
  const matrix = createNumberMatrix(order, order);
  if (seedGraph === undefined) return matrix;

  const seed = asSociomatrixSna(seedGraph) as number[][];
  if (seed.length !== order || seed.some((row) => row.length !== order)) throw new RangeError("seedGraph order must match rgbn order");
  for (let tail = 0; tail < order; tail += 1) {
    for (let head = 0; head < order; head += 1) {
      if (tail === head) continue;
      const value = seed[tail]![head]!;
      matrix[tail]![head] = value !== 0 && !Number.isNaN(value) ? 1 : 0;
    }
  }
  return matrix;
}

function initializeBnState(graph: number[][]): BnState {
  const order = graph.length;
  const parents = createNumberMatrix(order, order);
  const outdegree = Array.from({ length: order }, () => 0);
  let edgeCount = 0;

  for (let tail = 0; tail < order; tail += 1) {
    for (let head = 0; head < order; head += 1) {
      if (!graph[tail]![head]) continue;
      edgeCount += 1;
      outdegree[tail] = outdegree[tail]! + 1;
      for (let other = 0; other < order; other += 1) {
        if (other === tail || other === head || !graph[tail]![other]) continue;
        parents[head]![other] = parents[head]![other]! + 1;
        parents[other]![head] = parents[other]![head]! + 1;
      }
    }
  }

  return { graph, parents, outdegree, edgeCount };
}

function bnMcmcUpdate(state: BnState, options: BnUpdateOptions, rng: RandomSource): boolean {
  const order = state.graph.length;
  const tail = randomInt(rng, order);
  let head = randomInt(rng, order - 1);
  if (head >= tail) head += 1;

  const oldState = state.graph[tail]![head]!;
  const reverse = state.graph[head]![tail]!;
  const siblingRaw = state.parents[tail]![head]!;
  const sibling = options.dichotomize ? (siblingRaw > 0 ? 1 : 0) : siblingRaw;
  const excitationLog =
    logOneMinus(options.d[tail]![head]!) + reverse * logOneMinus(options.pi) + sibling * logOneMinus(options.sigma) + reverse * sibling * logOneMinus(options.rho);
  let edgeProbability = (1 - Math.exp(excitationLog)) * Math.exp(state.outdegree[tail]! * logOneMinus(options.delta) + logOneMinus(options.epsilon[tail]![head]!));
  edgeProbability = Math.max(0, Math.min(1, edgeProbability));

  if (rng() <= edgeProbability) {
    if (oldState === 0) {
      state.graph[tail]![head] = 1;
      state.edgeCount += 1;
      state.outdegree[tail] = state.outdegree[tail]! + 1;
      for (let other = 0; other < order; other += 1) {
        if (other === tail || other === head || !state.graph[tail]![other]) continue;
        state.parents[head]![other] = state.parents[head]![other]! + 1;
        state.parents[other]![head] = state.parents[other]![head]! + 1;
      }
    }
  } else if (oldState === 1) {
    state.graph[tail]![head] = 0;
    state.edgeCount -= 1;
    state.outdegree[tail] = state.outdegree[tail]! - 1;
    for (let other = 0; other < order; other += 1) {
      if (other === tail || other === head || !state.graph[tail]![other]) continue;
      state.parents[head]![other] = state.parents[head]![other]! - 1;
      state.parents[other]![head] = state.parents[other]![head]! - 1;
    }
  }

  return state.edgeCount <= options.maxEdges;
}

function bnCftpDraw(order: number, options: BnCftpOptions, rng: RandomSource): { graph: number[][]; converged: boolean } {
  if (order < 2 || options.d.every((row) => row.every((value) => value <= 0))) return { graph: createNumberMatrix(order, order), converged: true };
  if (options.d.every((row, tail) => row.every((value, head) => tail === head || value >= 1))) {
    const complete = createNumberMatrix(order, order, 1);
    for (let i = 0; i < order; i += 1) complete[i]![i] = 0;
    return { graph: complete, converged: true };
  }

  const d = options.d.map((row) => row.map((value) => clampProbabilityForCftp(value)));
  let horizon = order * (order - 1);
  let events = Array.from({ length: horizon }, () => randomCftpEvent(order, rng));
  const maxiter = options.maxiter <= 0 ? Number.MAX_SAFE_INTEGER : options.maxiter;

  while (horizon < maxiter) {
    const lower = initializeBnState(createNumberMatrix(order, order));
    const upper = initializeBnState(createNumberMatrix(order, order, 1));
    for (let i = 0; i < order; i += 1) upper.graph[i]![i] = 0;
    const initializedUpper = initializeBnState(upper.graph);
    let sample: BnState | null = null;

    for (const event of events) {
      if (sample) {
        bnApplyEvent(sample, event, { ...options, d });
        continue;
      }
      bnApplyEvent(lower, event, { ...options, d });
      bnApplyEvent(initializedUpper, event, { ...options, d });
      if (lower.edgeCount === initializedUpper.edgeCount && sameGraph(lower.graph, initializedUpper.graph)) sample = initializeBnState(cloneMatrix(lower.graph));
    }

    if (sample) return { graph: cloneMatrix(sample.graph), converged: true };
    const old = events;
    events = [...old, ...Array.from({ length: horizon }, () => randomCftpEvent(order, rng))];
    horizon *= 2;
  }

  return { graph: createNumberMatrix(order, order, Number.NaN), converged: false };
}

function bnApplyEvent(state: BnState, event: BnCftpEvent, options: BnCftpOptions): void {
  const { tail, head, coin } = event;
  const oldState = state.graph[tail]![head]!;
  const reverse = state.graph[head]![tail]!;
  const siblingRaw = state.parents[tail]![head]!;
  const sibling = options.dichotomize ? (siblingRaw > 0 ? 1 : 0) : siblingRaw;
  const excitationLog = logOneMinus(options.d[tail]![head]!) + reverse * logOneMinus(options.pi) + sibling * logOneMinus(options.sigma) + reverse * sibling * logOneMinus(options.rho);
  const edgeProbability = Math.max(0, Math.min(1, 1 - Math.exp(excitationLog)));
  if (coin <= edgeProbability) {
    if (oldState === 0) setBnEdge(state, tail, head, 1);
  } else if (oldState === 1) {
    setBnEdge(state, tail, head, 0);
  }
}

function setBnEdge(state: BnState, tail: number, head: number, value: 0 | 1): void {
  const old = state.graph[tail]![head]!;
  if (old === value) return;
  const delta = value === 1 ? 1 : -1;
  state.graph[tail]![head] = value;
  state.edgeCount += delta;
  state.outdegree[tail] = state.outdegree[tail]! + delta;
  for (let other = 0; other < state.graph.length; other += 1) {
    if (other === tail || other === head || !state.graph[tail]![other]) continue;
    state.parents[head]![other] = state.parents[head]![other]! + delta;
    state.parents[other]![head] = state.parents[other]![head]! + delta;
  }
}

function randomCftpEvent(order: number, rng: RandomSource): BnCftpEvent {
  const tail = randomInt(rng, order);
  let head = randomInt(rng, order - 1);
  if (head >= tail) head += 1;
  return { tail, head, coin: rng() };
}

function sameGraph(left: readonly (readonly number[])[], right: readonly (readonly number[])[]): boolean {
  return left.length === right.length && left.every((row, i) => row.every((value, j) => value === right[i]![j]));
}

function clampProbabilityForCftp(value: number): number {
  if (value <= 0) return 1e-10;
  if (value >= 1) return 1 - 1e-10;
  return value;
}

function logOneMinus(probability: number): number {
  return probability < 1 ? Math.log1p(-probability) : Number.NEGATIVE_INFINITY;
}

function expandProbabilityMatrix(value: number | ProbabilityMatrix, order: number, label: string): number[][] {
  if (typeof value === "number") {
    assertProbability(value, label);
    return Array.from({ length: order }, () => Array.from({ length: order }, () => value));
  }
  if (value.length !== order || value.some((row) => row.length !== order)) throw new RangeError(`${label} matrix dimensions must match order`);
  return value.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      assertProbability(cell, `${label}[${rowIndex},${colIndex}]`);
      return cell;
    }),
  );
}

function validateTieProbability(tprob: TieProbability, order: number, graphCount: number): void {
  if (typeof tprob === "number") {
    assertProbability(tprob, "tprob");
    return;
  }
  if (!Array.isArray(tprob) || tprob.length === 0) throw new RangeError("tprob must not be empty");
  if (isProbabilityStack(tprob)) {
    if (tprob.length !== graphCount) throw new RangeError("3D tprob length must match graphs");
    for (const matrix of tprob) validateProbabilityMatrix(matrix, order);
  } else if (isProbabilityMatrix(tprob)) {
    validateProbabilityMatrix(tprob, order);
  } else {
    for (const probability of tprob as readonly number[]) assertProbability(probability, "tprob");
  }
}

function validateProbabilityMatrix(matrix: ProbabilityMatrix, order: number): void {
  if (matrix.length !== order || matrix.some((row) => row.length !== order)) throw new RangeError("tprob matrix dimensions must match order");
  for (let row = 0; row < order; row += 1) {
    for (let col = 0; col < order; col += 1) assertProbability(matrix[row]![col]!, `tprob[${row},${col}]`);
  }
}

function probabilityAt(tprob: TieProbability, graphIndex: number, tail: number, head: number): number {
  if (typeof tprob === "number") return tprob;
  if (isProbabilityStack(tprob)) return tprob[graphIndex]![tail]![head]!;
  if (isProbabilityMatrix(tprob)) return tprob[tail]![head]!;
  const vector = tprob as readonly number[];
  return vector[graphIndex % vector.length]!;
}

function isProbabilityStack(value: unknown): value is ProbabilityStack {
  return Array.isArray(value) && value.length > 0 && Array.isArray(value[0]) && Array.isArray(value[0][0]);
}

function isProbabilityMatrix(value: unknown): value is ProbabilityMatrix {
  return Array.isArray(value) && value.length > 0 && Array.isArray(value[0]) && !Array.isArray(value[0][0]);
}

function tieValues(tielist: TieList, graphIndex: number): number[] {
  if (!Array.isArray(tielist)) throw new TypeError("tielist must be an array-like value");
  if (tielist.length === 0) return [];
  const first = tielist[0] as unknown;
  if (!Array.isArray(first)) return [...(tielist as readonly number[])];
  if ((first as readonly unknown[]).length > 0 && Array.isArray((first as readonly unknown[])[0])) {
    const stack = tielist as ReadonlyArray<MatrixLike>;
    return flattenMatrixColumnMajor(stack[graphIndex % stack.length]!);
  }
  return flattenMatrixColumnMajor(tielist as MatrixLike);
}

function flattenMatrixColumnMajor(matrix: MatrixLike): number[] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out: number[] = [];
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const value = matrix[row]?.[col];
      out.push(value === true ? 1 : typeof value === "number" && Number.isFinite(value) ? value : 0);
    }
  }
  return out;
}

function formatGraphResult(stack: number[][][], returnAsEdgelist: boolean): RandomGraphResult {
  return formatGraphResultForShape(stack, returnAsEdgelist, stack.length !== 1);
}

function formatGraphResultForShape(stack: number[][][], returnAsEdgelist: boolean, keepStack: boolean): RandomGraphResult {
  const value = keepStack ? stack : stack[0]!;
  return returnAsEdgelist ? asEdgelistSna(value) : value;
}

function cloneMatrix(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}

function resolveGraphCount(graphs: number | undefined): number {
  const count = graphs ?? 1;
  if (!Number.isInteger(count) || count < 1) throw new RangeError("graphs must be a positive integer");
  return count;
}

function resolveNumericSequence(value: number | readonly number[], index: number, label: string): number {
  if (typeof value === "number") return value;
  if (value.length === 0) throw new RangeError(`${label} must not be empty`);
  return value[index % value.length]!;
}

function assertOrder(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || !Number.isFinite(value)) throw new RangeError(`${label} must be a non-negative integer`);
}

function isGraphStackInput(input: GraphInput | readonly GraphInput[]): input is readonly GraphInput[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as unknown;
  if (isEdgeListInput(first as GraphInput) || isDenseGraph(first as GraphInput)) return true;
  return Array.isArray(first) && first.length > 0 && Array.isArray(first[0]);
}
