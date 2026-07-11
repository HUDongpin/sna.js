import { isDenseGraph, isEdgeListInput } from "../core/graph";
import { createNumberMatrix } from "../core/matrix";
import type { GraphInput, GraphMode } from "../core/types";
import type { RandomOptions } from "../core/random";
import { asSociomatrixSna } from "./dataprep";
import { rgraph } from "./randomGraph";

export type RoleGraphInput = GraphInput | readonly GraphInput[];
export type SedistMethod = "correlation" | "euclidean" | "hamming" | "gamma" | "exact";
export type RedistMethod = "catrege";
export type EquivDistanceFunction = "sedist" | "redist";
export type HclustMethod = "complete" | "single" | "average" | "mcquitty" | "weighted" | "median" | "centroid" | "ward.D" | "ward.D2";
export type BlockContent = "density" | "meanrowsum" | "meancolsum" | "sum" | "median" | "min" | "max" | "types";
export type BlockCell = number | string;
export type BlockModelMatrix = BlockCell[][];
export type BlockModelStack = BlockCell[][][];

export interface SedistOptions {
  readonly g?: number | readonly number[];
  readonly method?: SedistMethod;
  readonly jointAnalysis?: boolean;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly codeDiss?: boolean;
}

export interface RedistOptions {
  readonly g?: number | readonly number[];
  readonly method?: RedistMethod;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly seedPartition?: readonly number[] | null;
  readonly codeDiss?: boolean;
}

export interface HclustResult {
  readonly merge: readonly (readonly [number, number])[];
  readonly height: readonly number[];
  readonly order: readonly number[];
  readonly method: HclustMethod;
  readonly labels: readonly string[];
}

export interface EquivClustOptions {
  readonly g?: number | readonly number[];
  readonly equivDist?: readonly (readonly number[])[];
  readonly equivFun?: EquivDistanceFunction;
  readonly method?: SedistMethod | RedistMethod;
  readonly mode?: GraphMode;
  readonly diag?: boolean;
  readonly clusterMethod?: HclustMethod;
  readonly glabels?: readonly (string | number)[];
  readonly plabels?: readonly (string | number)[];
  readonly seedPartition?: readonly number[] | null;
}

export interface EquivClustResult {
  readonly type: "equiv.clust";
  readonly cluster: HclustResult;
  readonly metric: string;
  readonly equivFun: EquivDistanceFunction;
  readonly clusterMethod: HclustMethod;
  readonly glabels: readonly string[];
  readonly plabels: readonly string[];
  readonly distances: number[][];
}

export interface BlockmodelOptions {
  readonly k?: number;
  readonly h?: number;
  readonly blockContent?: BlockContent;
  readonly plabels?: readonly (string | number)[];
  readonly glabels?: readonly (string | number)[];
  readonly rlabels?: readonly (string | number)[];
  readonly mode?: GraphMode;
  readonly diag?: boolean;
}

export interface BlockmodelResult {
  readonly type: "blockmodel";
  readonly blockMembership: readonly number[];
  readonly orderVector: readonly number[];
  readonly blockContent: BlockContent;
  readonly blockedData: number[][] | number[][][];
  readonly blockModel: BlockModelMatrix | BlockModelStack;
  readonly plabels: readonly string[];
  readonly glabels: readonly string[];
  readonly rlabels: readonly string[];
  readonly clusterMethod: string;
  readonly equivFun: string;
  readonly equivMetric: string;
}

export interface BlockmodelExpandOptions extends RandomOptions {
  readonly mode?: GraphMode;
  readonly diag?: boolean;
}

interface MatrixStackInfo {
  readonly stack: number[][][];
  readonly isStack: boolean;
}

interface ClusterNode {
  readonly uid: number;
  readonly ref: number;
  readonly size: number;
  readonly members: readonly number[];
  readonly left?: ClusterNode;
  readonly right?: ClusterNode;
}

export function sedist(input: RoleGraphInput, options: SedistOptions = {}): number[][] | number[][][] {
  const { stack } = toMatrixStack(input, "sedist");
  const selected = selectGraphs(stack, options.g, "sedist").map(cloneMatrix);
  const order = assertUniformOrder(selected, "sedist");
  if (!(options.diag ?? false)) {
    for (const matrix of selected) {
      for (let i = 0; i < order; i += 1) matrix[i]![i] = Number.NaN;
    }
  }

  const method = options.method ?? "hamming";
  if (options.jointAnalysis ?? false) {
    const profiles = actorProfiles(selected);
    return distanceMatrixFromProfiles(profiles, method, options.codeDiss ?? false);
  }

  const out = selected.map((matrix) => distanceMatrixFromProfiles(actorProfiles([matrix]), method, options.codeDiss ?? false, true));
  return out.length === 1 ? out[0]! : out;
}

export function redist(input: RoleGraphInput, options: RedistOptions = {}): number[][] {
  const method = options.method ?? "catrege";
  if (method !== "catrege") throw new RangeError(`unsupported redist method: ${method}`);

  const { stack } = toMatrixStack(input, "redist");
  const selected = selectGraphs(stack, options.g, "redist").map(cloneMatrix);
  const order = assertUniformOrder(selected, "redist");
  for (const matrix of selected) validateBinaryMatrix(matrix, "redist");

  if ((options.mode ?? "digraph") === "graph") {
    for (const matrix of selected) weakSymmetrizeBinaryInPlace(matrix);
  }
  if (!(options.diag ?? false)) {
    for (const matrix of selected) {
      for (let i = 0; i < order; i += 1) matrix[i]![i] = 0;
    }
  }

  const codes = categoricalTieCodes(selected);
  const typeCount = 2 ** (2 * selected.length) - 1;
  const outpart: number[][] = [];
  let part = resolveSeedPartition(options.seedPartition, order);
  let changed = true;

  while (changed) {
    const neighborhoods = catregeNeighborhoods(codes, typeCount, part, order);
    outpart.push([...part]);
    changed = false;
    const next = Array.from({ length: order }, (_unused, index) => index + 1);
    for (let i = 1; i < order; i += 1) {
      for (let j = 0; j < i; j += 1) {
        if (part[i] !== part[j]) continue;
        if (sameCatregeNeighborhood(neighborhoods, typeCount, order, i, j)) next[i] = next[j]!;
        else changed = true;
      }
    }
    part = next;
  }

  const eq = createNumberMatrix(order, order);
  for (let i = 0; i < order; i += 1) {
    for (let j = 0; j < order; j += 1) {
      let value = 0;
      for (let iter = 0; iter < outpart.length; iter += 1) {
        if (outpart[iter]![i] === outpart[iter]![j]) value = iter + 1;
      }
      eq[i]![j] = value;
    }
  }

  if (options.codeDiss === false) return eq;
  const flat = eq.flat();
  const minValue = Math.min(...flat);
  const maxValue = Math.max(...flat);
  if (maxValue === minValue) return createNumberMatrix(order, order);
  return eq.map((row) => row.map((value) => (maxValue - value) / (maxValue - minValue)));
}

export function equivClust(input: RoleGraphInput, options: EquivClustOptions = {}): EquivClustResult {
  const { stack } = toMatrixStack(input, "equivClust");
  const selectedIndices = normalizeGraphSelection(options.g, stack.length, "equivClust");
  const order = assertUniformOrder(stack, "equivClust");
  const equivFun = options.equivFun ?? "sedist";
  const method = options.method ?? (equivFun === "redist" ? "catrege" : "hamming");
  const distances =
    options.equivDist === undefined
      ? equivFun === "redist"
        ? redist(input, {
            g: selectedIndices,
            method: "catrege",
            codeDiss: true,
            ...(options.mode === undefined ? {} : { mode: options.mode }),
            ...(options.diag === undefined ? {} : { diag: options.diag }),
            ...(options.seedPartition === undefined ? {} : { seedPartition: options.seedPartition }),
          })
        : (sedist(input, {
            g: selectedIndices,
            method: method as SedistMethod,
            jointAnalysis: true,
            codeDiss: true,
            ...(options.mode === undefined ? {} : { mode: options.mode }),
            ...(options.diag === undefined ? {} : { diag: options.diag }),
          }) as number[][])
      : cloneDistanceMatrix(options.equivDist);

  validateDistanceMatrix(distances, order, "equivClust");
  const plabels = stringifyLabels(options.plabels, order, 1);
  const glabels = stringifyLabels(options.glabels, selectedIndices.length, 1, selectedIndices);
  const clusterMethod = options.clusterMethod ?? "complete";
  const cluster = hclust(distances, clusterMethod, plabels);
  return {
    type: "equiv.clust",
    cluster,
    metric: method,
    equivFun,
    clusterMethod,
    glabels,
    plabels,
    distances,
  };
}

export function blockmodel(input: RoleGraphInput, ec: readonly number[] | HclustResult | EquivClustResult, options: BlockmodelOptions = {}): BlockmodelResult {
  const { stack, isStack } = toMatrixStack(input, "blockmodel");
  const order = assertUniformOrder(stack, "blockmodel");
  const membership = resolveBlockMembership(ec, options, order);
  const roleCount = Math.max(...membership);
  const blockContent = options.blockContent ?? "density";
  const prepared = stack.map(cloneMatrix);
  if (!(options.diag ?? false)) {
    for (const matrix of prepared) {
      for (let i = 0; i < order; i += 1) matrix[i]![i] = Number.NaN;
    }
  }

  const orderVector = blockOrder(ec, membership);
  const plabels = blockPositionLabels(ec, options.plabels, order, orderVector);
  const glabels = stringifyLabels(options.glabels ?? (isEquivClustResult(ec) ? ec.glabels : undefined), stack.length, 1);
  const rlabels = stringifyLabels(options.rlabels, roleCount, 1, undefined, "Block ");
  const blockModels = prepared.map((matrix) => blockmodelMatrix(matrix, membership, roleCount, blockContent));
  const blockedStack = stack.map((matrix) => permuteMatrix(matrix, orderVector));

  return {
    type: "blockmodel",
    blockMembership: orderVector.map((index) => membership[index]!),
    orderVector,
    blockContent,
    blockedData: isStack ? blockedStack : blockedStack[0]!,
    blockModel: blockModels.length === 1 ? blockModels[0]! : blockModels,
    plabels,
    glabels,
    rlabels,
    clusterMethod: clusterMethodFor(ec),
    equivFun: isEquivClustResult(ec) ? ec.equivFun : "None",
    equivMetric: isEquivClustResult(ec) ? ec.metric : "None",
  };
}

export function blockmodelExpand(object: BlockmodelResult, expansionVector: readonly number[], options: BlockmodelExpandOptions = {}): number[][] | number[][][] {
  if (object.blockContent !== "density") {
    throw new Error(`Content type ${object.blockContent} is not supported by blockmodel.expand; R sna 2.8 only supports density expansion.`);
  }
  const roleCount = object.rlabels.length;
  if (expansionVector.length !== roleCount) throw new RangeError("expansionVector length must match the number of roles");
  const totalOrder = expansionVector.reduce((sum, value) => {
    if (!Number.isInteger(value) || value < 0) throw new RangeError("expansionVector entries must be non-negative integers");
    return sum + value;
  }, 0);
  if (totalOrder < 1) throw new RangeError("expansionVector must expand to at least one vertex");

  const blockStack = isBlockModelStack(object.blockModel) ? object.blockModel : [object.blockModel];
  const probabilityStack = blockStack.map((matrix) => expandDensityBlockMatrix(matrix, expansionVector, totalOrder));
  return rgraph(totalOrder, {
    graphs: probabilityStack.length,
    tprob: probabilityStack,
    mode: options.mode ?? "digraph",
    diag: options.diag ?? false,
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.rng === undefined ? {} : { rng: options.rng }),
  }) as number[][] | number[][][];
}

function hclust(distances: number[][], method: HclustMethod, labels: readonly string[]): HclustResult {
  const n = distances.length;
  if (n < 1) throw new RangeError("hclust requires at least one object");
  const normalizedMethod = method === "weighted" ? "mcquitty" : method;
  const active: ClusterNode[] = Array.from({ length: n }, (_unused, index) => ({
    uid: index,
    ref: -(index + 1),
    size: 1,
    members: [index],
  }));
  const dist = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) dist.set(distanceKey(active[i]!.uid, active[j]!.uid), distances[j]![i]!);
  }

  const merge: Array<readonly [number, number]> = [];
  const height: number[] = [];
  let nextUid = n;
  let root = active[0]!;
  for (let step = 0; step < n - 1; step += 1) {
    let bestA = 0;
    let bestB = 1;
    let best = dist.get(distanceKey(active[0]!.uid, active[1]!.uid)) ?? Number.POSITIVE_INFINITY;
    for (let a = 0; a < active.length; a += 1) {
      for (let b = a + 1; b < active.length; b += 1) {
        const value = dist.get(distanceKey(active[a]!.uid, active[b]!.uid)) ?? Number.POSITIVE_INFINITY;
        if (value < best) {
          best = value;
          bestA = a;
          bestB = b;
        }
      }
    }

    const left = active[bestA]!;
    const right = active[bestB]!;
    merge.push([left.ref, right.ref]);
    height.push(best);
    const next: ClusterNode = {
      uid: nextUid,
      ref: step + 1,
      size: left.size + right.size,
      members: [...left.members, ...right.members],
      left,
      right,
    };
    nextUid += 1;

    for (let index = 0; index < active.length; index += 1) {
      if (index === bestA || index === bestB) continue;
      const other = active[index]!;
      const dLeft = dist.get(distanceKey(left.uid, other.uid))!;
      const dRight = dist.get(distanceKey(right.uid, other.uid))!;
      const dMerged = dist.get(distanceKey(left.uid, right.uid))!;
      dist.set(distanceKey(next.uid, other.uid), lanceWilliamsDistance(dLeft, dRight, dMerged, left.size, right.size, other.size, normalizedMethod));
    }

    const remove = new Set([bestA, bestB]);
    const survivors = active.filter((_node, index) => !remove.has(index));
    active.length = 0;
    active.push(...survivors, next);
    root = next;
  }

  return {
    merge,
    height,
    order: leafOrder(root),
    method,
    labels,
  };
}

function cutTree(cluster: HclustResult, options: { readonly k?: number; readonly h?: number }): number[] {
  const n = cluster.labels.length;
  if (n === 0) return [];
  let mergeCount: number;
  if (options.k !== undefined) {
    if (!Number.isInteger(options.k) || options.k < 1 || options.k > n) throw new RangeError("k must be an integer in [1, graph order]");
    mergeCount = n - options.k;
  } else if (options.h !== undefined) {
    if (!Number.isFinite(options.h)) throw new RangeError("h must be finite");
    mergeCount = cluster.height.filter((value) => value <= options.h!).length;
  } else {
    throw new RangeError("k or h is required when cutting a clustering object");
  }

  const active = new Map<number, number[]>();
  const built = new Map<number, number[]>();
  for (let leaf = 1; leaf <= n; leaf += 1) active.set(-leaf, [leaf - 1]);

  for (let step = 0; step < mergeCount; step += 1) {
    const [left, right] = cluster.merge[step]!;
    const members = [...membersForClusterRef(left, active, built), ...membersForClusterRef(right, active, built)];
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

function toMatrixStack(input: RoleGraphInput, label: string): MatrixStackInfo {
  if (isGraphStackInput(input)) {
    if (input.length === 0) throw new RangeError(`${label} requires at least one graph`);
    return { stack: input.map((graph) => asSociomatrixSna(graph) as number[][]), isStack: true };
  }
  return { stack: [asSociomatrixSna(input as GraphInput) as number[][]], isStack: false };
}

function isGraphStackInput(input: RoleGraphInput): input is readonly GraphInput[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as unknown;
  if (isDenseGraph(first as GraphInput) || isEdgeListInput(first as GraphInput)) return true;
  return Array.isArray(first) && first.length > 0 && Array.isArray((first as readonly unknown[])[0]);
}

function assertUniformOrder(stack: readonly number[][][], label: string): number {
  if (stack.length === 0) throw new RangeError(`${label} requires at least one graph`);
  const order = stack[0]!.length;
  for (const matrix of stack) {
    if (matrix.length !== order || matrix.some((row) => row.length !== order)) throw new RangeError(`${label} requires input graphs to be of identical order`);
  }
  return order;
}

function selectGraphs(stack: readonly number[][][], selection: number | readonly number[] | undefined, label: string): number[][][] {
  return normalizeGraphSelection(selection, stack.length, label).map((index) => stack[index]!);
}

function normalizeGraphSelection(selection: number | readonly number[] | undefined, count: number, label: string): number[] {
  const values = selection === undefined ? Array.from({ length: count }, (_unused, index) => index) : Array.isArray(selection) ? [...selection] : [selection];
  return values.map((value) => {
    if (!Number.isInteger(value) || value < 0 || value >= count) throw new RangeError(`${label} graph index is outside graph stack`);
    return value;
  });
}

function actorProfiles(stack: readonly number[][][]): Float64Array[] {
  const graphCount = stack.length;
  const order = stack[0]!.length;
  return Array.from({ length: order }, (_unused, actor) => {
    const profile = new Float64Array(2 * graphCount * order);
    let offset = 0;
    for (let col = 0; col < order; col += 1) {
      for (let graph = 0; graph < graphCount; graph += 1) {
        profile[offset] = stack[graph]![actor]![col]!;
        offset += 1;
      }
    }
    for (let row = 0; row < order; row += 1) {
      for (let graph = 0; graph < graphCount; graph += 1) {
        profile[offset] = stack[graph]![row]![actor]!;
        offset += 1;
      }
    }
    return profile;
  });
}

function distanceMatrixFromProfiles(profiles: readonly Float64Array[], method: SedistMethod, codeDiss: boolean, replaceNaCorrelation = false): number[][] {
  const order = profiles.length;
  const out = createNumberMatrix(order, order);
  for (let i = 0; i < order; i += 1) {
    for (let j = 0; j < order; j += 1) {
      let value: number;
      if (method === "correlation") value = profileCorrelation(profiles[i]!, profiles[j]!);
      else if (method === "euclidean") value = profileEuclidean(profiles[i]!, profiles[j]!);
      else if (method === "hamming") value = profileHamming(profiles[i]!, profiles[j]!);
      else if (method === "gamma") value = profileGamma(profiles[i]!, profiles[j]!);
      else if (method === "exact") value = profileExact(profiles[i]!, profiles[j]!);
      else throw new RangeError(`unsupported sedist method: ${method}`);

      if (replaceNaCorrelation && method === "correlation" && Number.isNaN(value)) value = 0;
      if (codeDiss && (method === "correlation" || method === "gamma")) value = -value;
      out[i]![j] = value;
    }
  }
  return out;
}

function profileHamming(left: Float64Array, right: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!;
    const b = right[i]!;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    sum += Math.abs(a - b);
  }
  return sum;
}

function profileEuclidean(left: Float64Array, right: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!;
    const b = right[i]!;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    sum += (a - b) ** 2;
  }
  return Math.sqrt(sum);
}

function profileExact(left: Float64Array, right: Float64Array): number {
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!;
    const b = right[i]!;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    if (a !== b) return 1;
  }
  return 0;
}

function profileGamma(left: Float64Array, right: Float64Array): number {
  let concord = 0;
  let discord = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!;
    const b = right[i]!;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    if (a === b) concord += 1;
    else discord += 1;
  }
  const denom = concord + discord;
  return denom === 0 ? Number.NaN : (concord - discord) / denom;
}

function profileCorrelation(left: Float64Array, right: Float64Array): number {
  let count = 0;
  let sumLeft = 0;
  let sumRight = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!;
    const b = right[i]!;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    sumLeft += a;
    sumRight += b;
    count += 1;
  }
  if (count < 2) return Number.NaN;
  const meanLeft = sumLeft / count;
  const meanRight = sumRight / count;
  let cross = 0;
  let leftVar = 0;
  let rightVar = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!;
    const b = right[i]!;
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    const da = a - meanLeft;
    const db = b - meanRight;
    cross += da * db;
    leftVar += da * da;
    rightVar += db * db;
  }
  const denom = Math.sqrt(leftVar * rightVar);
  return denom === 0 ? Number.NaN : cross / denom;
}

function validateBinaryMatrix(matrix: number[][], label: string): void {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix.length; col += 1) {
      const value = matrix[row]![col]!;
      if (!Number.isFinite(value) || (value !== 0 && value !== 1)) throw new RangeError(`${label} requires binary 0/1 graph values`);
    }
  }
}

function weakSymmetrizeBinaryInPlace(matrix: number[][]): void {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = row + 1; col < matrix.length; col += 1) {
      const value = matrix[row]![col]! > 0 || matrix[col]![row]! > 0 ? 1 : 0;
      matrix[row]![col] = value;
      matrix[col]![row] = value;
    }
  }
}

function categoricalTieCodes(stack: readonly number[][][]): Uint32Array {
  const graphCount = stack.length;
  const order = stack[0]!.length;
  const codes = new Uint32Array(order * order);
  for (let row = 0; row < order; row += 1) {
    for (let col = 0; col < order; col += 1) {
      let code = 0;
      for (let graph = 0; graph < graphCount; graph += 1) {
        if (stack[graph]![row]![col]! > 0) code += 2 ** (2 * graph);
        if (stack[graph]![col]![row]! > 0) code += 2 ** (2 * graph + 1);
      }
      codes[row * order + col] = code;
    }
  }
  return codes;
}

function resolveSeedPartition(seed: readonly number[] | null | undefined, order: number): number[] {
  if (seed == null) return Array.from({ length: order }, () => 1);
  if (seed.length !== order) throw new RangeError("seedPartition length must match graph order");
  return seed.map((value) => {
    if (!Number.isInteger(value) || value < 1 || value > order) throw new RangeError("seedPartition entries must be integers in [1, graph order]");
    return value;
  });
}

function catregeNeighborhoods(codes: Uint32Array, typeCount: number, part: readonly number[], order: number): Uint8Array {
  const out = new Uint8Array(typeCount * order * order);
  for (let actor = 0; actor < order; actor += 1) {
    for (let alter = 0; alter < order; alter += 1) {
      const code = codes[actor * order + alter]!;
      if (code > 0) out[((code - 1) * order + actor) * order + (part[alter]! - 1)] = 1;
    }
  }
  return out;
}

function sameCatregeNeighborhood(neighborhoods: Uint8Array, typeCount: number, order: number, left: number, right: number): boolean {
  for (let type = 0; type < typeCount; type += 1) {
    for (let role = 0; role < order; role += 1) {
      if (neighborhoods[(type * order + left) * order + role]! !== neighborhoods[(type * order + right) * order + role]!) return false;
    }
  }
  return true;
}

function cloneDistanceMatrix(input: readonly (readonly number[])[]): number[][] {
  return input.map((row) => [...row]);
}

function validateDistanceMatrix(matrix: number[][], order: number, label: string): void {
  if (matrix.length !== order || matrix.some((row) => row.length !== order)) throw new RangeError(`${label} distance matrix dimensions must match graph order`);
  for (const row of matrix) {
    for (const value of row) {
      if (!Number.isFinite(value)) throw new RangeError(`${label} distance matrix values must be finite`);
    }
  }
}

function stringifyLabels(
  labels: readonly (string | number)[] | undefined,
  count: number,
  start = 1,
  selected?: readonly number[],
  prefix = "",
): string[] {
  if (labels !== undefined) {
    if (labels.length < count) throw new RangeError("label vector is shorter than required");
    return Array.from({ length: count }, (_unused, index) => String(labels[index]));
  }
  return Array.from({ length: count }, (_unused, index) => `${prefix}${(selected?.[index] ?? index) + start}`);
}

function lanceWilliamsDistance(
  dLeft: number,
  dRight: number,
  dMerged: number,
  leftSize: number,
  rightSize: number,
  otherSize: number,
  method: HclustMethod,
): number {
  if (method === "single") return Math.min(dLeft, dRight);
  if (method === "complete") return Math.max(dLeft, dRight);
  if (method === "average") return (leftSize * dLeft + rightSize * dRight) / (leftSize + rightSize);
  if (method === "mcquitty" || method === "weighted") return (dLeft + dRight) / 2;
  if (method === "centroid") return Math.sqrt(Math.max(0, (leftSize * dLeft ** 2 + rightSize * dRight ** 2) / (leftSize + rightSize) - (leftSize * rightSize * dMerged ** 2) / (leftSize + rightSize) ** 2));
  if (method === "median") return Math.sqrt(Math.max(0, 0.5 * dLeft ** 2 + 0.5 * dRight ** 2 - 0.25 * dMerged ** 2));
  if (method === "ward.D2") {
    return Math.sqrt(Math.max(0, ((leftSize + otherSize) * dLeft ** 2 + (rightSize + otherSize) * dRight ** 2 - otherSize * dMerged ** 2) / (leftSize + rightSize + otherSize)));
  }
  if (method === "ward.D") return Math.max(0, ((leftSize + otherSize) * dLeft + (rightSize + otherSize) * dRight - otherSize * dMerged) / (leftSize + rightSize + otherSize));
  return Math.max(dLeft, dRight);
}

function distanceKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function leafOrder(node: ClusterNode): number[] {
  if (!node.left || !node.right) return [node.members[0]!];
  return [...leafOrder(node.left), ...leafOrder(node.right)];
}

function membersForClusterRef(ref: number, active: ReadonlyMap<number, number[]>, built: ReadonlyMap<number, number[]>): number[] {
  const members = active.get(ref) ?? built.get(ref);
  if (!members) throw new RangeError("invalid hclust merge reference");
  return members;
}

function resolveBlockMembership(ec: readonly number[] | HclustResult | EquivClustResult, options: BlockmodelOptions, order: number): number[] {
  const membership = isMembershipVector(ec)
    ? [...ec]
    : cutTree(isEquivClustResult(ec) ? ec.cluster : ec, {
        ...(options.k === undefined ? {} : { k: options.k }),
        ...(options.h === undefined ? {} : { h: options.h }),
      });
  if (membership.length !== order) throw new RangeError("block membership length must match graph order");
  for (const value of membership) {
    if (!Number.isInteger(value) || value < 1) throw new RangeError("block membership entries must be positive integers");
  }
  return membership;
}

function isMembershipVector(value: readonly number[] | HclustResult | EquivClustResult): value is readonly number[] {
  return Array.isArray(value);
}

function blockOrder(ec: readonly number[] | HclustResult | EquivClustResult, membership: readonly number[]): number[] {
  if (isEquivClustResult(ec)) return [...ec.cluster.order];
  if (isHclustResult(ec)) return [...ec.order];
  return Array.from({ length: membership.length }, (_unused, index) => index).sort((a, b) => (membership[a]! === membership[b]! ? a - b : membership[a]! - membership[b]!));
}

function blockPositionLabels(ec: readonly number[] | HclustResult | EquivClustResult, labels: readonly (string | number)[] | undefined, order: number, orderVector: readonly number[]): string[] {
  const source = labels ?? (isEquivClustResult(ec) ? ec.plabels : undefined);
  const base = stringifyLabels(source, order, 1);
  return orderVector.map((index) => base[index]!);
}

function clusterMethodFor(ec: readonly number[] | HclustResult | EquivClustResult): string {
  if (isEquivClustResult(ec)) return ec.clusterMethod;
  if (isHclustResult(ec)) return ec.method;
  return "Prespecified";
}

function isEquivClustResult(value: unknown): value is EquivClustResult {
  return !!value && typeof value === "object" && (value as { type?: unknown }).type === "equiv.clust";
}

function isHclustResult(value: unknown): value is HclustResult {
  return !!value && typeof value === "object" && Array.isArray((value as { merge?: unknown }).merge) && Array.isArray((value as { height?: unknown }).height);
}

function blockmodelMatrix(matrix: number[][], membership: readonly number[], roleCount: number, content: BlockContent): BlockModelMatrix {
  return Array.from({ length: roleCount }, (_unused, rowRole) =>
    Array.from({ length: roleCount }, (_unused2, colRole) => blockContentValue(matrix, membership, rowRole + 1, colRole + 1, content)),
  );
}

function blockContentValue(matrix: number[][], membership: readonly number[], rowRole: number, colRole: number, content: BlockContent): BlockCell {
  const block = blockValues(matrix, membership, rowRole, colRole);
  if (content === "density") return mean(block);
  if (content === "sum") return sum(block);
  if (content === "median") return median(block);
  if (content === "min") return minValue(block);
  if (content === "max") return maxValue(block);
  const shape = blockShape(matrix, membership, rowRole, colRole);
  if (content === "meanrowsum") return mean(shape.rows.map((row) => sum(row)));
  if (content === "meancolsum") return mean(shape.cols.map((col) => sum(col)));
  if (content === "types") return blockType(block, shape.rows, shape.cols);
  throw new RangeError(`unsupported block content: ${content}`);
}

function blockValues(matrix: number[][], membership: readonly number[], rowRole: number, colRole: number): number[] {
  const out: number[] = [];
  for (let row = 0; row < matrix.length; row += 1) {
    if (membership[row] !== rowRole) continue;
    for (let col = 0; col < matrix.length; col += 1) {
      if (membership[col] === colRole) out.push(matrix[row]![col]!);
    }
  }
  return out;
}

function blockShape(matrix: number[][], membership: readonly number[], rowRole: number, colRole: number): { readonly rows: number[][]; readonly cols: number[][] } {
  const rowActors = membership.map((role, index) => (role === rowRole ? index : -1)).filter((index) => index >= 0);
  const colActors = membership.map((role, index) => (role === colRole ? index : -1)).filter((index) => index >= 0);
  const rows = rowActors.map((row) => colActors.map((col) => matrix[row]![col]!));
  const cols = colActors.map((col) => rowActors.map((row) => matrix[row]![col]!));
  return { rows, cols };
}

function blockType(values: readonly number[], rows: readonly number[][], cols: readonly number[][]): string {
  const avg = mean(values);
  if (Number.isNaN(avg)) return "NA";
  if (avg === 0) return "null";
  if (avg === 1) return "complete";
  const rowCovered = rows.every((row) => sum(row) > 0);
  const colCovered = cols.every((col) => sum(col) > 0);
  if (rowCovered && colCovered) return "1 covered";
  if (rowCovered) return "1 row-covered";
  if (colCovered) return "1 col-covered";
  return "other";
}

function permuteMatrix(matrix: number[][], order: readonly number[]): number[][] {
  return order.map((row) => order.map((col) => matrix[row]![col]!));
}

function expandDensityBlockMatrix(matrix: BlockModelMatrix, expansionVector: readonly number[], totalOrder: number): number[][] {
  const out = createNumberMatrix(totalOrder, totalOrder);
  const starts: number[] = [];
  let cursor = 0;
  for (const count of expansionVector) {
    starts.push(cursor);
    cursor += count;
  }
  for (let blockRow = 0; blockRow < expansionVector.length; blockRow += 1) {
    for (let blockCol = 0; blockCol < expansionVector.length; blockCol += 1) {
      const raw = matrix[blockRow]?.[blockCol];
      if (typeof raw !== "number") throw new Error("density blockmodel expansion requires numeric block values");
      const probability = Number.isNaN(raw) ? 0 : raw;
      const rowStart = starts[blockRow]!;
      const colStart = starts[blockCol]!;
      for (let row = rowStart; row < rowStart + expansionVector[blockRow]!; row += 1) {
        for (let col = colStart; col < colStart + expansionVector[blockCol]!; col += 1) out[row]![col] = probability;
      }
    }
  }
  return out;
}

function isBlockModelStack(value: BlockModelMatrix | BlockModelStack): value is BlockModelStack {
  return Array.isArray(value[0]?.[0]);
}

function mean(values: readonly number[]): number {
  let total = 0;
  let count = 0;
  for (const value of values) {
    if (Number.isNaN(value)) continue;
    total += value;
    count += 1;
  }
  return count === 0 ? Number.NaN : total / count;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isNaN(value)) total += value;
  }
  return total;
}

function median(values: readonly number[]): number {
  const finite = values.filter((value) => !Number.isNaN(value)).sort((a, b) => a - b);
  if (finite.length === 0) return Number.NaN;
  const mid = finite.length / 2;
  return finite.length % 2 === 1 ? finite[Math.floor(mid)]! : (finite[mid - 1]! + finite[mid]!) / 2;
}

function minValue(values: readonly number[]): number {
  const finite = values.filter((value) => !Number.isNaN(value));
  return finite.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...finite);
}

function maxValue(values: readonly number[]): number {
  const finite = values.filter((value) => !Number.isNaN(value));
  return finite.length === 0 ? Number.NEGATIVE_INFINITY : Math.max(...finite);
}

function cloneMatrix(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}
