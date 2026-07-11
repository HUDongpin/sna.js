import { isDenseGraph, isEdgeListInput } from "../core/graph";
import { createNumberMatrix } from "../core/matrix";
import { randomInt, resolveRandomSource, type RandomOptions, type RandomSource } from "../core/random";
import type { DenseGraph, EdgeListInput, GraphInput, GraphMode, MatrixCell, MatrixLike } from "../core/types";

export type SnaEdge = readonly [number, number, number];

export interface SnaEdgeList extends Omit<EdgeListInput, "edges" | "indexBase" | "order"> {
  readonly edges: readonly SnaEdge[];
  readonly order: number;
  readonly indexBase: 0;
  readonly bipartite?: number;
  readonly vertexNames?: readonly string[];
}

export type GraphStackInput = ReadonlyArray<GraphInput>;
export type DataPrepInput = GraphInput | GraphStackInput;
export type MatrixStack = number[][][];
export type SociomatrixResult = number[][] | MatrixStack | number[][][];
export type EdgelistResult = SnaEdgeList | SnaEdgeList[];

export interface AsEdgelistOptions {
  readonly asDigraph?: boolean;
  readonly suppressDiag?: boolean;
  readonly forceBipartite?: boolean;
}

export interface AsSociomatrixOptions {
  readonly simplify?: boolean;
  readonly forceBipartite?: boolean;
}

export interface AddIsolatesOptions {
  readonly returnAsEdgelist?: boolean;
}

export interface RemoveOptions {
  readonly removeVal?: number;
}

export type EgoNeighborhood = "combined" | "in" | "out";

export interface EgoExtractOptions {
  readonly neighborhood?: EgoNeighborhood;
}

export interface GtOptions {
  readonly returnAsEdgelist?: boolean;
}

export interface GVectorizeOptions {
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly censorAsNa?: boolean;
}

export type Event2DichotMethod =
  | "quantile"
  | "rquantile"
  | "cquantile"
  | "mean"
  | "rmean"
  | "cmean"
  | "absolute"
  | "rank"
  | "rrank"
  | "crank";

export interface Event2DichotOptions {
  readonly method?: Event2DichotMethod;
  readonly thresh?: number;
  readonly leq?: boolean;
}

export type StochasticMode = "row" | "col" | "rowcol" | "total";

export interface MakeStochasticOptions extends RandomOptions {
  readonly mode?: StochasticMode;
  readonly tol?: number;
  readonly maxiter?: number;
  readonly annealDecay?: number;
  readonly errpow?: number;
}

export type IntervalGraphType = "simple" | "overlap" | "fracxy" | "fracyx" | "jntfrac";
export type Spell = readonly [number, number, number];
export type SpellListInput = ReadonlyArray<Spell> | ReadonlyArray<ReadonlyArray<Spell>>;

export interface IntervalGraphOptions {
  readonly type?: IntervalGraphType;
  readonly diag?: boolean;
}

export interface IntervalGraphResult {
  readonly graph: number[][] | MatrixStack;
  readonly exchangeList: number[] | number[][];
}

export type SymmetrizeRule = "weak" | "strong" | "upper" | "lower";

export interface SymmetrizeOptions {
  readonly rule?: SymmetrizeRule;
  readonly returnAsEdgelist?: boolean;
}

export function asEdgelistSna(input: DataPrepInput, options: AsEdgelistOptions = {}): EdgelistResult {
  if (isStackInput(input)) return input.map((graph) => asSingleEdgelist(graph, options));
  return asSingleEdgelist(input, options);
}

export function asSociomatrixSna(input: DataPrepInput, options: AsSociomatrixOptions = {}): SociomatrixResult {
  if (!isStackInput(input)) return asSingleSociomatrix(input, options);

  const matrices = input.map((graph) => asSingleSociomatrix(graph, options));
  if (options.simplify === false) return matrices;
  return matrices;
}

export function addIsolates(input: DataPrepInput, n: number, options: AddIsolatesOptions = {}): SociomatrixResult | EdgelistResult {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("n must be a non-negative integer");
  if (isStackInput(input)) {
    if (options.returnAsEdgelist) return input.map((graph) => addIsolates(graph, n, options) as SnaEdgeList);
    return input.map((graph) => addIsolates(graph, n, options) as number[][]);
  }

  const edgelist = asSingleEdgelist(input);
  const expanded: SnaEdgeList = { ...edgelist, order: edgelist.order + n };
  if (options.returnAsEdgelist) return expanded;
  return asSingleSociomatrix(expanded);
}

export function diagRemove(input: DataPrepInput, options: RemoveOptions = {}): number[][] | MatrixStack {
  return mapMatrices(input, (matrix) => replaceByPosition(matrix, (row, col) => row === col, options.removeVal ?? Number.NaN));
}

export function upperTriRemove(input: DataPrepInput, options: RemoveOptions = {}): number[][] | MatrixStack {
  return mapMatrices(input, (matrix) => replaceByPosition(matrix, (row, col) => row < col, options.removeVal ?? Number.NaN));
}

export function lowerTriRemove(input: DataPrepInput, options: RemoveOptions = {}): number[][] | MatrixStack {
  return mapMatrices(input, (matrix) => replaceByPosition(matrix, (row, col) => row > col, options.removeVal ?? Number.NaN));
}

export function egoExtract(input: DataPrepInput, ego?: number | readonly number[], options: EgoExtractOptions = {}): MatrixStack | MatrixStack[] {
  if (isStackInput(input)) return input.map((graph) => egoExtract(graph, ego, options) as MatrixStack);

  const matrix = asSingleSociomatrix(input);
  const n = matrix.length;
  const egos = ego === undefined ? Array.from({ length: n }, (_unused, index) => index) : Array.isArray(ego) ? [...ego] : [ego];
  const neighborhood = options.neighborhood ?? "combined";

  return egos.map((egoVertex) => {
    assertVertex(egoVertex, n, "ego");
    const selected: number[] = [egoVertex];
    for (let vertex = 0; vertex < n; vertex += 1) {
      const inNeighbor = positiveTie(matrix[vertex]?.[egoVertex] ?? 0);
      const outNeighbor = positiveTie(matrix[egoVertex]?.[vertex] ?? 0);
      const include =
        neighborhood === "in" ? inNeighbor : neighborhood === "out" ? outNeighbor : inNeighbor || outNeighbor;
      if (include && vertex !== egoVertex) selected.push(vertex);
    }
    return inducedSubmatrix(matrix, selected);
  });
}

export function gt(input: DataPrepInput, options: GtOptions = {}): SociomatrixResult | EdgelistResult {
  if (options.returnAsEdgelist) {
    if (isStackInput(input)) return input.map((graph) => transposeEdgelist(asSingleEdgelist(graph)));
    return transposeEdgelist(asSingleEdgelist(input));
  }

  return mapMatrices(input, transposeMatrix);
}

export function gvectorize(input: DataPrepInput, options: GVectorizeOptions = {}): number[] | number[][] {
  const matrices = isStackInput(input) ? input.map((graph) => asSingleSociomatrix(graph)) : [asSingleSociomatrix(input)];
  const vectors = matrices.map((matrix) => vectorizeSingle(matrix, options));
  if (vectors.length === 1) return vectors[0]!;

  const rowCount = vectors[0]?.length ?? 0;
  if (!vectors.every((vector) => vector.length === rowCount)) {
    throw new RangeError("all graphs must have the same vectorized length");
  }
  return Array.from({ length: rowCount }, (_unused, row) => vectors.map((vector) => vector[row]!));
}

export function event2dichot(input: DataPrepInput, options: Event2DichotOptions = {}): number[][] | MatrixStack {
  return mapValuedMatrices(input, (matrix) => event2dichotSingle(matrix, options));
}

export function makeStochastic(input: DataPrepInput, modeOrOptions: StochasticMode | MakeStochasticOptions = {}): number[][] | MatrixStack {
  const options: MakeStochasticOptions = typeof modeOrOptions === "string" ? { mode: modeOrOptions } : modeOrOptions;
  const rng = resolveRandomSource(options);
  return mapValuedMatrices(input, (matrix) => makeStochasticSingle(matrix, options, rng));
}

export function stackcount(input: DataPrepInput): number {
  return isStackInput(input) ? input.length : 1;
}

export function isEdgelistSna(value: unknown): boolean | boolean[] {
  if (Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry) && "edges" in entry)) {
    return value.map((entry) => isSingleSnaEdgelist(entry));
  }
  return isSingleSnaEdgelist(value);
}

export function sr2css(input: DataPrepInput): MatrixStack | MatrixStack[] {
  if (isStackInput(input)) return input.map((graph) => sr2css(graph) as MatrixStack);
  const matrix = asSingleSociomatrix(input);
  assertSquareNumericMatrix(matrix);
  const n = matrix.length;
  return Array.from({ length: n }, (_unused, observer) => {
    const slice = createNumberMatrix(n, n, Number.NaN);
    for (let col = 0; col < n; col += 1) slice[observer]![col] = matrix[observer]![col]!;
    return slice;
  });
}

export function intervalGraph(spells: SpellListInput, options: IntervalGraphOptions = {}): IntervalGraphResult {
  const stack = isSpellStackInput(spells) ? spells.map(normalizeSpellList) : [normalizeSpellList(spells as ReadonlyArray<Spell>)];
  const type = options.type ?? "simple";
  const graphStack = stack.map((spellList) => intervalGraphSingle(spellList, type, options.diag ?? false));
  const exchangeLists = stack.map((spellList) => spellList.map((spell) => spell[0]));

  if (isSpellStackInput(spells)) return { graph: graphStack, exchangeList: exchangeLists };
  return { graph: graphStack[0] ?? [], exchangeList: exchangeLists[0] ?? [] };
}

export function symmetrize(input: DataPrepInput, options: SymmetrizeOptions = {}): SociomatrixResult | EdgelistResult {
  const rule = options.rule ?? "weak";
  if (options.returnAsEdgelist) {
    if (isStackInput(input)) return input.map((graph) => symmetrizeEdgelist(asSingleEdgelist(graph), rule));
    return symmetrizeEdgelist(asSingleEdgelist(input), rule);
  }
  return mapMatrices(input, (matrix) => symmetrizeMatrix(matrix, rule));
}

function asSingleEdgelist(input: GraphInput, options: AsEdgelistOptions = {}): SnaEdgeList {
  const asDigraph = options.asDigraph ?? true;
  const suppressDiag = options.suppressDiag ?? false;

  if (isDenseGraph(input)) return denseToEdgelist(input, suppressDiag);

  if (isEdgeListInput(input)) {
    const indexBase = input.indexBase ?? 0;
    let order = input.order ?? 0;
    const edges: SnaEdge[] = [];
    for (const edge of input.edges) {
      const tail = edge[0] - indexBase;
      const head = edge[1] - indexBase;
      if (!Number.isInteger(tail) || !Number.isInteger(head) || tail < 0 || head < 0) {
        throw new RangeError("edge-list vertices must be non-negative integers after index-base conversion");
      }
      order = Math.max(order, tail + 1, head + 1);
      if (suppressDiag && tail === head) continue;
      const value = normalizeValue(edge[2] ?? 1);
      edges.push([tail, head, value]);
      if (input.directed === false && asDigraph && tail !== head) edges.push([head, tail, value]);
    }
    return input.directed === undefined ? { order, edges, indexBase: 0 } : { order, edges, indexBase: 0, directed: input.directed };
  }

  return matrixToEdgelist(input, options);
}

function asSingleSociomatrix(input: GraphInput, options: AsSociomatrixOptions = {}): number[][] {
  if (isDenseGraph(input)) return denseToMatrix(input);
  if (isEdgeListInput(input)) return edgeListToMatrix(asSingleEdgelist(input));

  const matrix = cloneRectangularMatrix(input);
  if (options.forceBipartite || matrix.length !== (matrix[0]?.length ?? 0)) return bipartiteMatrixToSquare(matrix);
  return matrix;
}

function mapMatrices(input: DataPrepInput, transform: (matrix: number[][]) => number[][]): number[][] | MatrixStack {
  if (isStackInput(input)) return input.map((graph) => transform(asSingleSociomatrix(graph)));
  return transform(asSingleSociomatrix(input));
}

function mapValuedMatrices(input: DataPrepInput, transform: (matrix: number[][]) => number[][]): number[][] | MatrixStack {
  if (isStackInput(input)) return input.map((graph) => transform(asValuedMatrix(graph)));
  return transform(asValuedMatrix(input));
}

function asValuedMatrix(input: GraphInput): number[][] {
  if (isDenseGraph(input) || isEdgeListInput(input)) return asSingleSociomatrix(input);
  return cloneRectangularMatrix(input);
}

function denseToMatrix(graph: DenseGraph): number[][] {
  const matrix = createNumberMatrix(graph.order, graph.order);
  for (let i = 0; i < graph.order; i += 1) {
    for (let j = 0; j < graph.order; j += 1) {
      matrix[i]![j] = graph.missing?.[i * graph.order + j] === 1 ? Number.NaN : graph.weights[i * graph.order + j]!;
    }
  }
  return matrix;
}

function edgeListToMatrix(edgelist: SnaEdgeList): number[][] {
  const matrix = createNumberMatrix(edgelist.order, edgelist.order);
  for (const [tail, head, value] of edgelist.edges) {
    assertVertex(tail, edgelist.order, "edge tail");
    assertVertex(head, edgelist.order, "edge head");
    matrix[tail]![head] = value;
  }
  return matrix;
}

function matrixToEdgelist(input: MatrixLike, options: AsEdgelistOptions): SnaEdgeList {
  const matrix = cloneRectangularMatrix(input);
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const forceBipartite = options.forceBipartite ?? false;
  const suppressDiag = options.suppressDiag ?? false;
  const edges: SnaEdge[] = [];

  if (forceBipartite || rows !== cols) {
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const value = matrix[row]![col]!;
        if (!edgePresentForCoercion(value)) continue;
        const tail = row;
        const head = rows + col;
        edges.push([tail, head, value], [head, tail, value]);
      }
    }
    return { order: rows + cols, edges, indexBase: 0, bipartite: rows };
  }

  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (suppressDiag && row === col) continue;
      const value = matrix[row]![col]!;
      if (edgePresentForCoercion(value)) edges.push([row, col, value]);
    }
  }
  return { order: rows, edges, indexBase: 0 };
}

function denseToEdgelist(graph: DenseGraph, suppressDiag: boolean): SnaEdgeList {
  const edges: SnaEdge[] = [];
  for (let col = 0; col < graph.order; col += 1) {
    for (let row = 0; row < graph.order; row += 1) {
      if (suppressDiag && row === col) continue;
      const index = row * graph.order + col;
      const value = graph.missing?.[index] === 1 ? Number.NaN : graph.weights[index]!;
      if (edgePresentForCoercion(value)) edges.push([row, col, value]);
    }
  }
  return { order: graph.order, edges, indexBase: 0, directed: graph.directed };
}

function bipartiteMatrixToSquare(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out = createNumberMatrix(rows + cols, rows + cols);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const value = matrix[row]![col]!;
      out[row]![rows + col] = value;
      out[rows + col]![row] = value;
    }
  }
  return out;
}

function replaceByPosition(matrix: number[][], predicate: (row: number, col: number, n: number) => boolean, value: number): number[][] {
  const out = cloneMatrix(matrix);
  for (let row = 0; row < out.length; row += 1) {
    for (let col = 0; col < out[row]!.length; col += 1) {
      if (predicate(row, col, out.length)) out[row]![col] = value;
    }
  }
  return out;
}

function transposeMatrix(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out = createNumberMatrix(cols, rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) out[col]![row] = matrix[row]![col]!;
  }
  return out;
}

function transposeEdgelist(edgelist: SnaEdgeList): SnaEdgeList {
  return { ...edgelist, edges: edgelist.edges.map(([tail, head, value]) => [head, tail, value] as const) };
}

function symmetrizeMatrix(matrix: number[][], rule: SymmetrizeRule): number[][] {
  assertSquareNumericMatrix(matrix);
  const n = matrix.length;
  const out = cloneMatrix(matrix);

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const upper = matrix[i]![j]!;
      const lower = matrix[j]![i]!;
      let value: number;
      switch (rule) {
        case "upper":
          value = upper;
          break;
        case "lower":
          value = lower;
          break;
        case "strong":
          value = strongLogicalValue(upper, lower);
          break;
        case "weak":
          value = weakLogicalValue(upper, lower);
          break;
      }
      out[i]![j] = value;
      out[j]![i] = value;
    }
  }

  if (rule === "weak" || rule === "strong") {
    for (let i = 0; i < n; i += 1) out[i]![i] = rule === "weak" ? weakLogicalValue(matrix[i]![i]!, matrix[i]![i]!) : strongLogicalValue(matrix[i]![i]!, matrix[i]![i]!);
  }

  return out;
}

function symmetrizeEdgelist(edgelist: SnaEdgeList, rule: SymmetrizeRule): SnaEdgeList {
  if (edgelist.bipartite !== undefined) return edgelist;

  const loops = edgelist.edges.filter(([tail, head]) => tail === head);
  const dyadic = edgelist.edges.filter(([tail, head]) => tail !== head);
  let selected: SnaEdge[] = [];

  switch (rule) {
    case "upper":
      selected = dyadic.filter(([tail, head]) => tail < head);
      break;
    case "lower":
      selected = dyadic.filter(([tail, head]) => tail > head);
      break;
    case "weak": {
      const seen = new Set<string>();
      for (const edge of dyadic) {
        const key = dyadKey(edge[0], edge[1]);
        if (seen.has(key)) continue;
        seen.add(key);
        selected.push(edge);
      }
      break;
    }
    case "strong": {
      const seen = new Set<string>();
      for (const edge of dyadic) {
        const key = dyadKey(edge[0], edge[1]);
        if (seen.has(key)) selected.push(edge);
        else seen.add(key);
      }
      break;
    }
  }

  return {
    ...edgelist,
    edges: [...selected, ...selected.map(([tail, head, value]) => [head, tail, value] as const), ...loops],
  };
}

function vectorizeSingle(matrix: number[][], options: GVectorizeOptions): number[] {
  assertSquareNumericMatrix(matrix);
  const mode = options.mode ?? "digraph";
  const diag = options.diag ?? false;
  const censorAsNa = options.censorAsNa ?? true;
  const prepared = cloneMatrix(matrix);
  const n = prepared.length;

  if (censorAsNa) {
    if (mode === "graph") {
      for (let row = 0; row < n; row += 1) {
        for (let col = row + 1; col < n; col += 1) prepared[row]![col] = Number.NaN;
      }
    }
    if (!diag) {
      for (let i = 0; i < n; i += 1) prepared[i]![i] = Number.NaN;
    }
    return columnMajorVector(prepared);
  }

  const out: number[] = [];
  for (let col = 0; col < n; col += 1) {
    for (let row = 0; row < n; row += 1) {
      const include = mode === "graph" ? row > col || (diag && row === col) : diag || row !== col;
      if (include) out.push(prepared[row]![col]!);
    }
  }
  return out;
}

function event2dichotSingle(matrix: number[][], options: Event2DichotOptions): number[][] {
  const method = options.method ?? "quantile";
  const thresh = options.thresh ?? 0.5;
  const leq = options.leq ?? false;

  switch (method) {
    case "quantile":
      return thresholdMatrix(matrix, quantile(columnMajorFinite(matrix), thresh), leq);
    case "rquantile":
      return rowThresholds(matrix, (row) => quantile(finiteValues(row), thresh), leq);
    case "cquantile":
      return columnThresholds(matrix, (col) => quantile(finiteValues(col), thresh), leq);
    case "mean":
      return thresholdMatrix(matrix, meanFinite(columnMajorFinite(matrix)), leq);
    case "rmean":
      return rowThresholds(matrix, (row) => meanFinite(finiteValues(row)), leq);
    case "cmean":
      return columnThresholds(matrix, (col) => meanFinite(finiteValues(col)), leq);
    case "absolute":
      return thresholdMatrix(matrix, thresh, leq);
    case "rank":
      return rankDichotomizeMatrix(matrix, thresh, leq);
    case "rrank":
      return matrix.map((row) => rankDichotomizeVector(row, thresh, leq));
    case "crank":
      return columnsToMatrix(matrix, matrixColumns(matrix).map((col) => rankDichotomizeVector(col, thresh, leq)));
    default:
      throw new RangeError(`Unknown event2dichot method: ${method satisfies never}`);
  }
}

function thresholdMatrix(matrix: number[][], threshold: number, leq: boolean): number[][] {
  return matrix.map((row) => row.map((value) => dichotomizeValue(value, threshold, leq)));
}

function rowThresholds(matrix: number[][], thresholdFor: (row: readonly number[]) => number, leq: boolean): number[][] {
  return matrix.map((row) => {
    const threshold = thresholdFor(row);
    return row.map((value) => dichotomizeValue(value, threshold, leq));
  });
}

function columnThresholds(matrix: number[][], thresholdFor: (column: readonly number[]) => number, leq: boolean): number[][] {
  const cols = matrix[0]?.length ?? 0;
  const thresholds = Array.from({ length: cols }, (_unused, col) => thresholdFor(matrix.map((row) => row[col] ?? Number.NaN)));
  return matrix.map((row) => row.map((value, col) => dichotomizeValue(value, thresholds[col]!, leq)));
}

function dichotomizeValue(value: number, threshold: number, leq: boolean): number {
  if (Number.isNaN(value) || Number.isNaN(threshold)) return Number.NaN;
  const gt = value > threshold ? 1 : 0;
  return leq ? 1 - gt : gt;
}

function rankDichotomizeMatrix(matrix: number[][], thresh: number, leq: boolean): number[][] {
  return uncolumnMajorVector(rankDichotomizeVector(columnMajorVector(matrix), thresh, leq), matrix.length, matrix[0]?.length ?? 0);
}

function rankDichotomizeVector(values: readonly number[], thresh: number, leq: boolean): number[] {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => {
      const leftMissing = Number.isNaN(left.value);
      const rightMissing = Number.isNaN(right.value);
      if (leftMissing && rightMissing) return left.index - right.index;
      if (leftMissing) return 1;
      if (rightMissing) return -1;
      if (left.value !== right.value) return left.value - right.value;
      return left.index - right.index;
    });
  const n = values.length;
  return order.map(({ value, index }) => {
    if (Number.isNaN(value)) return Number.NaN;
    const gt = n - index < thresh ? 1 : 0;
    return leq ? 1 - gt : gt;
  });
}

function makeStochasticSingle(matrix: number[][], options: MakeStochasticOptions, rng: RandomSource): number[][] {
  const mode = options.mode ?? "rowcol";
  switch (mode) {
    case "row":
      return rowNormalize(matrix);
    case "col":
      return colNormalize(matrix);
    case "total":
      return totalNormalize(matrix);
    case "rowcol":
      return rowColNormalize(matrix, options, rng);
    default:
      throw new RangeError(`Unknown stochastic mode: ${mode satisfies never}`);
  }
}

function rowNormalize(matrix: readonly (readonly number[])[]): number[][] {
  return matrix.map((row) => {
    const total = finiteSum(row);
    return row.map((value) => finiteOrZero(value / total));
  });
}

function colNormalize(matrix: readonly (readonly number[])[]): number[][] {
  const cols = matrix[0]?.length ?? 0;
  const totals = Array.from({ length: cols }, (_unused, column) => finiteSum(matrix.map((row) => row[column] ?? 0)));
  return matrix.map((row) => row.map((value, column) => finiteOrZero(value / totals[column]!)));
}

function totalNormalize(matrix: readonly (readonly number[])[]): number[][] {
  const total = finiteSum(matrix.flatMap((row) => [...row]));
  return matrix.map((row) => row.map((value) => finiteOrZero(value / total)));
}

function rowColNormalize(matrix: number[][], options: MakeStochasticOptions, rng: RandomSource): number[][] {
  let out = colNormalize(rowNormalize(matrix));
  const rows = out.length;
  const cols = out[0]?.length ?? 0;
  const tol = options.tol ?? 0.005;
  const maxiter = options.maxiter ?? Math.max(1, rows * cols * 100);
  const annealDecay = options.annealDecay ?? 0.01;
  const errpow = options.errpow ?? 1;
  const adjustableEdges: Array<readonly [number, number]> = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const value = matrix[row]![col]!;
      if (!Number.isNaN(value) && value > 0) adjustableEdges.push([row, col]);
    }
  }

  if (adjustableEdges.length === 0) return patchNonFinite(out);

  let error = rowColError(out, errpow);
  for (let iteration = 0; iteration < maxiter && error > (rows + cols) * tol; iteration += 1) {
    const [row, col] = adjustableEdges[randomInt(rng, adjustableEdges.length)]!;
    const original = matrix[row]![col]!;
    const current = out[row]![col]!;
    const draw = clamp(normalDraw(rng, current, original / 10), 0, original);
    const rowWithout = finiteSum(out[row]!) - current;
    const colWithout = columnSum(out, col) - current;
    const newError =
      error -
      Math.abs(finiteSum(out[row]!) - 1) ** errpow -
      Math.abs(columnSum(out, col) - 1) ** errpow +
      Math.abs(rowWithout + draw - 1) ** errpow +
      Math.abs(colWithout + draw - 1) ** errpow;

    if (newError < error || rng() < Math.exp(-annealDecay * iteration)) {
      out[row]![col] = draw;
      error = newError;
    }
  }

  return patchNonFinite(out);
}

function rowColError(matrix: readonly (readonly number[])[], errpow: number): number {
  const cols = matrix[0]?.length ?? 0;
  let error = 0;
  for (const row of matrix) error += Math.abs(finiteSum(row) - 1) ** errpow;
  for (let col = 0; col < cols; col += 1) error += Math.abs(columnSum(matrix, col) - 1) ** errpow;
  return error;
}

function patchNonFinite(matrix: number[][]): number[][] {
  return matrix.map((row) => row.map((value) => finiteOrZero(value)));
}

function intervalGraphSingle(spells: readonly Spell[], type: IntervalGraphType, diag: boolean): number[][] {
  const n = spells.length;
  const out = createNumberMatrix(n, n);
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const left = spells[row]!;
      const right = spells[col]!;
      const overlap = Math.max(Math.min(left[2], right[2]) - Math.max(left[1], right[1]), 0);
      const value =
        type === "simple"
          ? left[1] <= right[2] && left[2] >= right[1]
            ? 1
            : 0
          : type === "overlap"
            ? overlap
            : type === "fracxy"
              ? finiteOrZero(overlap / (left[2] - left[1]))
              : type === "fracyx"
                ? finiteOrZero(overlap / (right[2] - right[1]))
                : finiteOrZero((2 * overlap) / (left[2] - left[1] + right[2] - right[1]));
      out[row]![col] = value;
    }
  }
  if (!diag) for (let index = 0; index < n; index += 1) out[index]![index] = 0;
  return out;
}

function columnMajorVector(matrix: number[][]): number[] {
  const out: number[] = [];
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) out.push(matrix[row]![col]!);
  }
  return out;
}

function uncolumnMajorVector(values: readonly number[], rows: number, cols: number): number[][] {
  const out = createNumberMatrix(rows, cols);
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) out[row]![col] = values[col * rows + row] ?? 0;
  }
  return out;
}

function matrixColumns(matrix: number[][]): number[][] {
  const cols = matrix[0]?.length ?? 0;
  return Array.from({ length: cols }, (_unused, col) => matrix.map((row) => row[col] ?? Number.NaN));
}

function columnsToMatrix(source: number[][], columns: readonly (readonly number[])[]): number[][] {
  const rows = source.length;
  const cols = source[0]?.length ?? 0;
  const out = createNumberMatrix(rows, cols);
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) out[row]![col] = columns[col]?.[row] ?? Number.NaN;
  }
  return out;
}

function columnMajorFinite(matrix: number[][]): number[] {
  return finiteValues(columnMajorVector(matrix));
}

function finiteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function finiteSum(values: readonly number[]): number {
  return values.reduce((sum, value) => (Number.isFinite(value) ? sum + value : sum), 0);
}

function meanFinite(values: readonly number[]): number {
  return values.length === 0 ? Number.NaN : finiteSum(values) / values.length;
}

function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) return Number.NaN;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError("thresh must be a quantile in [0, 1]");
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower]! + fraction * (sorted[upper]! - sorted[lower]!);
}

function columnSum(matrix: readonly (readonly number[])[], col: number): number {
  let sum = 0;
  for (const row of matrix) {
    const value = row[col] ?? 0;
    if (Number.isFinite(value)) sum += value;
  }
  return sum;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalDraw(rng: RandomSource, mean: number, sd: number): number {
  if (!Number.isFinite(sd) || sd <= 0) return mean;
  const u1 = Math.max(rng(), Number.MIN_VALUE);
  const u2 = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSpellList(spells: ReadonlyArray<Spell>): Spell[] {
  return spells.map((spell) => {
    if (spell.length !== 3 || !spell.every((value) => Number.isFinite(value))) {
      throw new TypeError("each spell must be [type, onset, terminus] with finite numeric values");
    }
    if (spell[1] > spell[2]) throw new RangeError("spell onset must be less than or equal to terminus");
    return [spell[0], spell[1], spell[2]] as const;
  });
}

function isSpellStackInput(spells: SpellListInput): spells is ReadonlyArray<ReadonlyArray<Spell>> {
  if (!Array.isArray(spells) || spells.length === 0) return false;
  const first = spells[0] as unknown;
  return Array.isArray(first) && first.length > 0 && Array.isArray(first[0]);
}

function isSingleSnaEdgelist(value: unknown): value is SnaEdgeList {
  if (!isEdgeListInput(value as GraphInput)) return false;
  const candidate = value as Partial<SnaEdgeList>;
  if (candidate.indexBase !== 0 || !Number.isInteger(candidate.order) || (candidate.order ?? -1) < 0) return false;
  if (!Array.isArray(candidate.edges)) return false;
  return candidate.edges.every((edge) => {
    if (!Array.isArray(edge) || edge.length !== 3) return false;
    const [tail, head, edgeValue] = edge;
    return (
      Number.isInteger(tail) &&
      Number.isInteger(head) &&
      tail >= 0 &&
      head >= 0 &&
      tail < candidate.order! &&
      head < candidate.order! &&
      typeof edgeValue === "number"
    );
  });
}

function inducedSubmatrix(matrix: number[][], selected: readonly number[]): number[][] {
  return selected.map((row) => selected.map((col) => matrix[row]![col]!));
}

function cloneRectangularMatrix(matrix: MatrixLike): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out = createNumberMatrix(rows, cols);
  for (let row = 0; row < rows; row += 1) {
    const sourceRow = matrix[row];
    if (!sourceRow || sourceRow.length !== cols) throw new TypeError("matrix inputs must be rectangular");
    for (let col = 0; col < cols; col += 1) out[row]![col] = normalizeCell(sourceRow[col]);
  }
  return out;
}

function cloneMatrix(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}

function assertSquareNumericMatrix(matrix: number[][]): void {
  const n = matrix.length;
  for (const row of matrix) {
    if (row.length !== n) throw new TypeError("graph matrix inputs must be square");
  }
}

function normalizeCell(value: MatrixCell): number {
  if (value === true) return 1;
  if (value === false || value == null) return 0;
  if (Number.isNaN(value)) return Number.NaN;
  if (!Number.isFinite(value)) return 0;
  return value;
}

function normalizeValue(value: number): number {
  if (Number.isNaN(value)) return Number.NaN;
  if (!Number.isFinite(value)) return 0;
  return value;
}

function edgePresentForCoercion(value: number): boolean {
  return Number.isNaN(value) || value !== 0;
}

function positiveTie(value: number): boolean {
  return !Number.isNaN(value) && value > 0;
}

function booleanTie(value: number): boolean | undefined {
  if (Number.isNaN(value)) return undefined;
  return value !== 0;
}

function weakLogicalValue(a: number, b: number): number {
  const left = booleanTie(a);
  const right = booleanTie(b);
  if (left === true || right === true) return 1;
  if (left === undefined || right === undefined) return Number.NaN;
  return 0;
}

function strongLogicalValue(a: number, b: number): number {
  const left = booleanTie(a);
  const right = booleanTie(b);
  if (left === false || right === false) return 0;
  if (left === undefined || right === undefined) return Number.NaN;
  return 1;
}

function dyadKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function assertVertex(vertex: number, order: number, label: string): void {
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= order) {
    throw new RangeError(`${label} is outside graph order`);
  }
}

function isStackInput(input: DataPrepInput): input is GraphStackInput {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as unknown;
  if (isEdgeListInput(first as GraphInput) || isDenseGraph(first as GraphInput)) return true;
  return Array.isArray(first) && first.length > 0 && Array.isArray(first[0]);
}
