import { assertSquareMatrix } from "../core/matrix";
import type { DenseGraph, EdgeListInput, EdgeTuple, GraphInput, MatrixCell, MatrixLike } from "../core/types";
import type {
  DuplicateEdgePolicy,
  GraphAttributes,
  GraphData,
  GraphEdge,
  MakeSparseGraphOptions,
  ModernGraphInput,
  NodeId,
  SparseAdjacency,
  SparseGraph,
} from "./types";

const EMPTY_ATTRIBUTES: GraphAttributes = Object.freeze({});
const MAX_UINT32 = 0xffff_ffff;

interface IndexedEdge {
  source: number;
  target: number;
  weight: number;
  attributes: GraphAttributes;
}

interface NormalizedGraph {
  nodeIds: NodeId[];
  nodeAttributes: GraphAttributes[];
  edges: IndexedEdge[];
  directed: boolean;
  loops: boolean;
  attributes: GraphAttributes;
}

function assertNodeId(value: unknown, label: string): asserts value is NodeId {
  if (typeof value === "string") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  throw new TypeError(`${label} must be a finite number or string`);
}

function normalizeAttributes(value: GraphAttributes | undefined, label: string): GraphAttributes {
  if (value === undefined) return EMPTY_ATTRIBUTES;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  for (const attribute of Object.values(value)) {
    if (attribute !== null && typeof attribute !== "string" && typeof attribute !== "number" && typeof attribute !== "boolean") {
      throw new TypeError(`${label} values must be JSON-safe scalars`);
    }
    if (typeof attribute === "number" && !Number.isFinite(attribute)) {
      throw new RangeError(`${label} numeric values must be finite`);
    }
  }
  return value;
}

function resolveDirected(inputDirected: boolean | undefined, options: MakeSparseGraphOptions): boolean {
  if (typeof options.directed === "boolean") return options.directed;
  if (options.mode !== undefined) return options.mode !== "graph";
  return inputDirected ?? true;
}

function resolveLoops(inputLoops: boolean | undefined, options: MakeSparseGraphOptions): boolean {
  if (typeof options.loops === "boolean") return options.loops;
  if (typeof options.diag === "boolean") return options.diag;
  return inputLoops ?? true;
}

function normalizeWeight(value: number | undefined, label: string): number {
  const weight = value ?? 1;
  if (!Number.isFinite(weight)) throw new RangeError(`${label} must be finite`);
  return weight;
}

function cellWeight(value: MatrixCell): number | undefined {
  if (value === true) return 1;
  if (value === false || value == null || !Number.isFinite(value) || value === 0) return undefined;
  return value;
}

function isLegacyDenseGraph(input: unknown): input is DenseGraph {
  return typeof input === "object" && input !== null && "kind" in input && input.kind === "dense";
}

function isMatrixLike(input: unknown): input is MatrixLike {
  return Array.isArray(input);
}

function isGraphData(input: ModernGraphInput): input is GraphData {
  if (isMatrixLike(input) || isLegacyDenseGraph(input) || isSparseGraph(input)) return false;
  const candidate = input as EdgeListInput | GraphData;
  if ("nodes" in candidate || "attributes" in candidate) return true;
  const firstEdge: EdgeTuple | GraphEdge | undefined = candidate.edges[0];
  return firstEdge !== undefined && !Array.isArray(firstEdge);
}

function normalizeGraphData(input: GraphData, options: MakeSparseGraphOptions): NormalizedGraph {
  if (typeof input.directed !== "boolean") throw new TypeError("GraphData directed must be a boolean");
  if (!Array.isArray(input.nodes)) throw new TypeError("GraphData nodes must be an array");
  if (!Array.isArray(input.edges)) throw new TypeError("GraphData edges must be an array");
  const nodeIds: NodeId[] = [];
  const nodeAttributes: GraphAttributes[] = [];
  const nodeIndex = new Map<NodeId, number>();

  const appendNode = (id: NodeId, attributes: GraphAttributes | undefined): number => {
    assertNodeId(id, "node id");
    const existing = nodeIndex.get(id);
    if (existing !== undefined) throw new RangeError(`duplicate node id: ${String(id)}`);
    const index = nodeIds.length;
    nodeIndex.set(id, index);
    nodeIds.push(id);
    nodeAttributes.push(normalizeAttributes(attributes, `attributes for node ${String(id)}`));
    return index;
  };

  for (const node of input.nodes) appendNode(node.id, node.attributes);

  const loops = resolveLoops(undefined, options);
  const edges: IndexedEdge[] = [];
  for (let edgeIndex = 0; edgeIndex < input.edges.length; edgeIndex += 1) {
    const edge = input.edges[edgeIndex]!;
    assertNodeId(edge.source, `edge ${edgeIndex} source`);
    assertNodeId(edge.target, `edge ${edgeIndex} target`);
    const source = nodeIndex.get(edge.source);
    const target = nodeIndex.get(edge.target);
    if (source === undefined) throw new RangeError(`edge ${edgeIndex} source node is not declared: ${String(edge.source)}`);
    if (target === undefined) throw new RangeError(`edge ${edgeIndex} target node is not declared: ${String(edge.target)}`);
    if (!loops && source === target) continue;
    edges.push({
      source,
      target,
      weight: normalizeWeight(edge.weight, `edge ${edgeIndex} weight`),
      attributes: normalizeAttributes(edge.attributes, `attributes for edge ${edgeIndex}`),
    });
  }

  return {
    nodeIds,
    nodeAttributes,
    edges,
    directed: resolveDirected(input.directed, options),
    loops,
    attributes: normalizeAttributes(input.attributes, "graph attributes"),
  };
}

function normalizeLegacyEdgeList(input: EdgeListInput, options: MakeSparseGraphOptions): NormalizedGraph {
  const indexBase = options.indexBase ?? input.indexBase ?? 0;
  let order = input.order ?? 0;
  if (!Number.isInteger(order) || order < 0) throw new RangeError("edge-list order must be a non-negative integer");

  const edges: IndexedEdge[] = [];
  const loops = resolveLoops(undefined, options);
  for (let edgeIndex = 0; edgeIndex < input.edges.length; edgeIndex += 1) {
    const edge = input.edges[edgeIndex]!;
    const source = edge[0] - indexBase;
    const target = edge[1] - indexBase;
    if (!Number.isInteger(source) || !Number.isInteger(target) || source < 0 || target < 0) {
      throw new RangeError("edge-list vertices must be non-negative integers after index-base conversion");
    }
    order = Math.max(order, source + 1, target + 1);
    if (!loops && source === target) continue;
    const rawWeight = edge[2] ?? 1;
    // Legacy NaN represents a missing tie and non-finite values are no ties.
    if (!Number.isFinite(rawWeight)) continue;
    edges.push({ source, target, weight: rawWeight, attributes: EMPTY_ATTRIBUTES });
  }

  if (order > MAX_UINT32) throw new RangeError("sparse graph order exceeds Uint32 capacity");
  return {
    nodeIds: Array.from({ length: order }, (_, index) => index),
    nodeAttributes: Array.from({ length: order }, () => EMPTY_ATTRIBUTES),
    edges,
    directed: resolveDirected(input.directed, options),
    loops,
    attributes: EMPTY_ATTRIBUTES,
  };
}

function pushMatrixPair(
  edges: IndexedEdge[],
  source: number,
  target: number,
  forward: number | undefined,
  reverse: number | undefined,
): void {
  if (forward === undefined && reverse === undefined) return;
  if (forward !== undefined) edges.push({ source, target, weight: forward, attributes: EMPTY_ATTRIBUTES });
  if (reverse !== undefined && reverse !== forward) {
    // A differing reciprocal value is an actual duplicate logical edge. It
    // is resolved by the caller's explicit duplicate policy.
    edges.push({ source, target, weight: reverse, attributes: EMPTY_ATTRIBUTES });
  }
}

function normalizeMatrix(input: MatrixLike, options: MakeSparseGraphOptions): NormalizedGraph {
  const order = assertSquareMatrix(input);
  if (order > MAX_UINT32) throw new RangeError("sparse graph order exceeds Uint32 capacity");
  const directed = resolveDirected(undefined, options);
  const loops = resolveLoops(undefined, options);
  const edges: IndexedEdge[] = [];

  if (directed) {
    for (let source = 0; source < order; source += 1) {
      const row = input[source]!;
      for (let target = 0; target < order; target += 1) {
        if (!loops && source === target) continue;
        const weight = cellWeight(row[target]);
        if (weight !== undefined) edges.push({ source, target, weight, attributes: EMPTY_ATTRIBUTES });
      }
    }
  } else {
    if (loops) {
      for (let node = 0; node < order; node += 1) {
        const weight = cellWeight(input[node]![node]);
        if (weight !== undefined) edges.push({ source: node, target: node, weight, attributes: EMPTY_ATTRIBUTES });
      }
    }
    for (let source = 0; source < order; source += 1) {
      for (let target = source + 1; target < order; target += 1) {
        pushMatrixPair(edges, source, target, cellWeight(input[source]![target]), cellWeight(input[target]![source]));
      }
    }
  }

  return {
    nodeIds: Array.from({ length: order }, (_, index) => index),
    nodeAttributes: Array.from({ length: order }, () => EMPTY_ATTRIBUTES),
    edges,
    directed,
    loops,
    attributes: EMPTY_ATTRIBUTES,
  };
}

function denseCellWeight(input: DenseGraph, source: number, target: number): number | undefined {
  const index = source * input.order + target;
  if (input.adjacency[index] !== 1) return undefined;
  const weight = input.weights[index];
  return weight !== undefined && Number.isFinite(weight) ? weight : undefined;
}

function normalizeDenseGraph(input: DenseGraph, options: MakeSparseGraphOptions): NormalizedGraph {
  const directed = resolveDirected(input.directed, options);
  const loops = resolveLoops(input.loops, options);
  const edges: IndexedEdge[] = [];

  if (directed) {
    for (let source = 0; source < input.order; source += 1) {
      for (let target = 0; target < input.order; target += 1) {
        if (!loops && source === target) continue;
        const weight = denseCellWeight(input, source, target);
        if (weight !== undefined) edges.push({ source, target, weight, attributes: EMPTY_ATTRIBUTES });
      }
    }
  } else {
    if (loops) {
      for (let node = 0; node < input.order; node += 1) {
        const weight = denseCellWeight(input, node, node);
        if (weight !== undefined) edges.push({ source: node, target: node, weight, attributes: EMPTY_ATTRIBUTES });
      }
    }
    for (let source = 0; source < input.order; source += 1) {
      for (let target = source + 1; target < input.order; target += 1) {
        pushMatrixPair(edges, source, target, denseCellWeight(input, source, target), denseCellWeight(input, target, source));
      }
    }
  }

  return {
    nodeIds: Array.from({ length: input.order }, (_, index) => index),
    nodeAttributes: Array.from({ length: input.order }, () => EMPTY_ATTRIBUTES),
    edges,
    directed,
    loops,
    attributes: EMPTY_ATTRIBUTES,
  };
}

function mergeDuplicate(existing: IndexedEdge, candidate: IndexedEdge, policy: DuplicateEdgePolicy): void {
  switch (policy) {
    case "sum":
      existing.weight += candidate.weight;
      if (!Number.isFinite(existing.weight)) throw new RangeError("summed duplicate edge weight must remain finite");
      return;
    case "max":
      if (candidate.weight > existing.weight) {
        existing.weight = candidate.weight;
        existing.attributes = candidate.attributes;
      }
      return;
    case "first":
      return;
    case "last":
      existing.weight = candidate.weight;
      existing.attributes = candidate.attributes;
      return;
    case "reject":
      throw new RangeError(`duplicate edge between node indices ${existing.source} and ${existing.target}`);
  }
}

function deduplicateEdges(edges: readonly IndexedEdge[], directed: boolean, policy: DuplicateEdgePolicy): IndexedEdge[] {
  const result: IndexedEdge[] = [];
  const positions = new Map<string, number>();

  for (const inputEdge of edges) {
    const source = directed || inputEdge.source <= inputEdge.target ? inputEdge.source : inputEdge.target;
    const target = directed || inputEdge.source <= inputEdge.target ? inputEdge.target : inputEdge.source;
    const edge: IndexedEdge = { source, target, weight: inputEdge.weight, attributes: inputEdge.attributes };
    const key = `${source}:${target}`;
    const existingIndex = positions.get(key);
    if (existingIndex === undefined) {
      positions.set(key, result.length);
      result.push(edge);
    } else {
      mergeDuplicate(result[existingIndex]!, edge, policy);
    }
  }

  return result;
}

function validateAdjacency(adjacency: SparseAdjacency, graph: SparseGraph, label: string, incoming: boolean): void {
  const { order, size } = graph;
  if (adjacency.offsets.length !== order + 1) throw new RangeError(`${label} offsets length must equal order + 1`);
  if (adjacency.offsets[0] !== 0) throw new RangeError(`${label} offsets must start at zero`);
  const entries = adjacency.indices.length;
  if (adjacency.weights.length !== entries || adjacency.edgeIds.length !== entries) {
    throw new RangeError(`${label} sparse arrays must have equal lengths`);
  }
  if (adjacency.offsets[order] !== entries) throw new RangeError(`${label} final offset must equal adjacency length`);
  let expectedEntries = 0;
  for (let edge = 0; edge < size; edge += 1) {
    expectedEntries += !graph.directed && graph.edgeSources[edge] !== graph.edgeTargets[edge] ? 2 : 1;
  }
  if (entries !== expectedEntries) throw new RangeError(`${label} adjacency length does not match logical edges`);
  for (let node = 0; node < order; node += 1) {
    if (adjacency.offsets[node]! > adjacency.offsets[node + 1]!) throw new RangeError(`${label} offsets must be monotonic`);
  }
  const edgeOccurrences = new Uint8Array(size);
  for (let owner = 0; owner < order; owner += 1) {
    for (let entry = adjacency.offsets[owner]!; entry < adjacency.offsets[owner + 1]!; entry += 1) {
      const neighbor = adjacency.indices[entry]!;
      const edgeId = adjacency.edgeIds[entry]!;
      if (neighbor >= order) throw new RangeError(`${label} contains an out-of-range node index`);
      if (edgeId >= size) throw new RangeError(`${label} contains an out-of-range edge id`);
      const weight = adjacency.weights[entry]!;
      if (!Number.isFinite(weight)) throw new RangeError(`${label} weights must be finite`);
      if (weight !== graph.edgeWeights[edgeId]) throw new RangeError(`${label} weight does not match its logical edge`);

      const source = graph.edgeSources[edgeId]!;
      const target = graph.edgeTargets[edgeId]!;
      const orientationMatches = graph.directed
        ? incoming
          ? target === owner && source === neighbor
          : source === owner && target === neighbor
        : (source === owner && target === neighbor) || (target === owner && source === neighbor);
      if (!orientationMatches) throw new RangeError(`${label} arc does not match its logical edge`);
      edgeOccurrences[edgeId] = edgeOccurrences[edgeId]! + 1;
    }
  }
  for (let edge = 0; edge < size; edge += 1) {
    const expected = !graph.directed && graph.edgeSources[edge] !== graph.edgeTargets[edge] ? 2 : 1;
    if (edgeOccurrences[edge] !== expected) throw new RangeError(`${label} logical edge occurrence count is invalid`);
  }
}

function validateSparseGraph(graph: SparseGraph): void {
  if (!Number.isInteger(graph.order) || graph.order < 0 || graph.order > MAX_UINT32) {
    throw new RangeError("sparse graph order must fit in a Uint32 index");
  }
  if (!Number.isInteger(graph.size) || graph.size < 0 || graph.size > MAX_UINT32) {
    throw new RangeError("sparse graph size must fit in a Uint32 edge id");
  }
  if (graph.nodeIds.length !== graph.order || graph.nodeAttributes.length !== graph.order) {
    throw new RangeError("sparse graph node arrays must match order");
  }
  if (
    graph.edgeSources.length !== graph.size ||
    graph.edgeTargets.length !== graph.size ||
    graph.edgeWeights.length !== graph.size ||
    graph.edgeAttributes.length !== graph.size
  ) {
    throw new RangeError("sparse graph edge arrays must match size");
  }
  const seen = new Map<NodeId, true>();
  normalizeAttributes(graph.attributes, "sparse graph attributes");
  for (let node = 0; node < graph.order; node += 1) {
    const nodeId = graph.nodeIds[node]!;
    assertNodeId(nodeId, "sparse graph node id");
    if (seen.has(nodeId)) throw new RangeError(`duplicate node id: ${String(nodeId)}`);
    seen.set(nodeId, true);
    normalizeAttributes(graph.nodeAttributes[node], `attributes for sparse node ${String(nodeId)}`);
  }
  const duplicateEdges = new Set<string>();
  for (let edge = 0; edge < graph.size; edge += 1) {
    const source = graph.edgeSources[edge]!;
    const target = graph.edgeTargets[edge]!;
    if (source >= graph.order || target >= graph.order) {
      throw new RangeError("sparse graph contains an out-of-range edge endpoint");
    }
    if (!graph.loops && source === target) throw new RangeError("sparse graph marked loop-free contains a self-loop");
    if (!Number.isFinite(graph.edgeWeights[edge]!)) throw new RangeError("sparse graph edge weights must be finite");
    normalizeAttributes(graph.edgeAttributes[edge], `attributes for sparse edge ${edge}`);
    const first = graph.directed || source <= target ? source : target;
    const second = graph.directed || source <= target ? target : source;
    const key = `${first}:${second}`;
    if (duplicateEdges.has(key)) throw new RangeError(`sparse graph contains duplicate logical edge ${key}`);
    duplicateEdges.add(key);
  }
  validateAdjacency(graph.csr, graph, "CSR", false);
  validateAdjacency(graph.csc, graph, "CSC", true);
}

function normalizeSparseGraph(input: SparseGraph, options: MakeSparseGraphOptions): NormalizedGraph | SparseGraph {
  validateSparseGraph(input);
  const directed = resolveDirected(input.directed, options);
  const loops = resolveLoops(input.loops, options);
  if (directed === input.directed && loops === input.loops) return input;

  const edges: IndexedEdge[] = [];
  for (let edge = 0; edge < input.size; edge += 1) {
    const source = input.edgeSources[edge]!;
    const target = input.edgeTargets[edge]!;
    if (!loops && source === target) continue;
    const item = { source, target, weight: input.edgeWeights[edge]!, attributes: input.edgeAttributes[edge]! };
    edges.push(item);
    if (directed && !input.directed && source !== target) {
      edges.push({ source: target, target: source, weight: item.weight, attributes: item.attributes });
    }
  }

  return {
    nodeIds: [...input.nodeIds],
    nodeAttributes: [...input.nodeAttributes],
    edges,
    directed,
    loops,
    attributes: input.attributes,
  };
}

function forEachArc(edges: readonly IndexedEdge[], directed: boolean, callback: (source: number, target: number, edgeId: number) => void): void {
  for (let edgeId = 0; edgeId < edges.length; edgeId += 1) {
    const edge = edges[edgeId]!;
    callback(edge.source, edge.target, edgeId);
    if (!directed && edge.source !== edge.target) callback(edge.target, edge.source, edgeId);
  }
}

function buildAdjacency(order: number, edges: readonly IndexedEdge[], directed: boolean, incoming: boolean): SparseAdjacency {
  let entries = 0;
  for (const edge of edges) entries += !directed && edge.source !== edge.target ? 2 : 1;
  if (entries > MAX_UINT32) throw new RangeError("sparse adjacency exceeds Uint32 capacity");

  const offsets = new Uint32Array(order + 1);
  forEachArc(edges, directed, (source, target) => {
    const owner = incoming ? target : source;
    offsets[owner + 1] = offsets[owner + 1]! + 1;
  });
  for (let node = 0; node < order; node += 1) offsets[node + 1] = offsets[node + 1]! + offsets[node]!;

  const indices = new Uint32Array(entries);
  const weights = new Float64Array(entries);
  const edgeIds = new Uint32Array(entries);
  const cursors = offsets.slice(0, order);
  forEachArc(edges, directed, (source, target, edgeId) => {
    const owner = incoming ? target : source;
    const neighbor = incoming ? source : target;
    const position = cursors[owner]!;
    cursors[owner] = position + 1;
    indices[position] = neighbor;
    weights[position] = edges[edgeId]!.weight;
    edgeIds[position] = edgeId;
  });
  return { offsets, indices, weights, edgeIds };
}

function finalizeSparseGraph(input: NormalizedGraph, duplicateEdges: DuplicateEdgePolicy): SparseGraph {
  if (input.nodeIds.length > MAX_UINT32) throw new RangeError("sparse graph order exceeds Uint32 capacity");
  const edges = deduplicateEdges(input.edges, input.directed, duplicateEdges);
  if (edges.length > MAX_UINT32) throw new RangeError("sparse graph size exceeds Uint32 capacity");

  const edgeSources = new Uint32Array(edges.length);
  const edgeTargets = new Uint32Array(edges.length);
  const edgeWeights = new Float64Array(edges.length);
  const edgeAttributes: GraphAttributes[] = [];
  for (let edge = 0; edge < edges.length; edge += 1) {
    const item = edges[edge]!;
    edgeSources[edge] = item.source;
    edgeTargets[edge] = item.target;
    edgeWeights[edge] = item.weight;
    edgeAttributes.push(item.attributes);
  }

  return {
    kind: "sparse",
    order: input.nodeIds.length,
    size: edges.length,
    directed: input.directed,
    loops: input.loops,
    nodeIds: [...input.nodeIds],
    nodeAttributes: [...input.nodeAttributes],
    attributes: input.attributes,
    edgeSources,
    edgeTargets,
    edgeWeights,
    edgeAttributes,
    csr: buildAdjacency(input.nodeIds.length, edges, input.directed, false),
    csc: buildAdjacency(input.nodeIds.length, edges, input.directed, true),
  };
}

export function isSparseGraph<Id extends NodeId = NodeId>(input: unknown): input is SparseGraph<Id> {
  return typeof input === "object" && input !== null && "kind" in input && input.kind === "sparse";
}

/** Build an attribute-preserving sparse graph from modern graph data. */
export function createGraph<const Data extends GraphData<NodeId>>(
  input: Data,
  options: MakeSparseGraphOptions = {},
): SparseGraph<Data["nodes"][number]["id"]> {
  return makeSparseGraph(input, options);
}

/** Normalize legacy or modern graph input without allocating an n-by-n matrix. */
export function makeSparseGraph<const Data extends GraphData<NodeId>>(
  input: Data,
  options?: MakeSparseGraphOptions,
): SparseGraph<Data["nodes"][number]["id"]>;
export function makeSparseGraph<Id extends NodeId>(input: SparseGraph<Id>, options?: MakeSparseGraphOptions): SparseGraph<Id>;
export function makeSparseGraph(input: GraphInput, options?: MakeSparseGraphOptions): SparseGraph<number>;
export function makeSparseGraph(input: ModernGraphInput, options?: MakeSparseGraphOptions): SparseGraph;
export function makeSparseGraph(input: ModernGraphInput, options: MakeSparseGraphOptions = {}): SparseGraph {
  let normalized: NormalizedGraph | SparseGraph;
  if (isSparseGraph(input)) normalized = normalizeSparseGraph(input, options);
  else if (isLegacyDenseGraph(input)) normalized = normalizeDenseGraph(input, options);
  else if (isMatrixLike(input)) normalized = normalizeMatrix(input, options);
  else if (isGraphData(input)) normalized = normalizeGraphData(input, options);
  else normalized = normalizeLegacyEdgeList(input, options);

  if (isSparseGraph(normalized)) return normalized;
  return finalizeSparseGraph(normalized, options.duplicateEdges ?? "reject");
}

/**
 * Convert to the legacy zero-based edge-list boundary. Node and edge
 * attributes cannot be represented there; `graph.nodeIds[index]` records the
 * identity corresponding to each emitted numeric index.
 */
export function toLegacyEdgeList(input: ModernGraphInput, options: MakeSparseGraphOptions = {}): EdgeListInput {
  const graph = makeSparseGraph(input, options);
  const edges: EdgeTuple[] = [];
  for (let edge = 0; edge < graph.size; edge += 1) {
    edges.push([graph.edgeSources[edge]!, graph.edgeTargets[edge]!, graph.edgeWeights[edge]!]);
  }
  return { order: graph.order, indexBase: 0, directed: graph.directed, edges };
}
