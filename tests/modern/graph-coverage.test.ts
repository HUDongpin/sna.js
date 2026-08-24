import { describe, expect, it } from "vitest";

import { createGraph, isSparseGraph, makeSparseGraph, toLegacyEdgeList } from "../../src/graph/index";
import type { DenseGraph, EdgeListInput, MatrixLike } from "../../src/core/types";
import type { GraphData, SparseAdjacency, SparseGraph } from "../../src/modern/types";

const twoEdgeDirected = (): SparseGraph =>
  createGraph({
    directed: true,
    attributes: { name: "validation fixture" },
    nodes: [
      { id: "a", attributes: { group: "one" } },
      { id: "b", attributes: { group: "two" } },
      { id: "c", attributes: { group: "two" } },
    ],
    edges: [
      { source: "a", target: "b", weight: 2, attributes: { kind: "ab" } },
      { source: "a", target: "c", weight: 3, attributes: { kind: "ac" } },
    ],
  });

const undirectedWithLoop = (): SparseGraph =>
  createGraph({
    directed: false,
    nodes: [{ id: 0 }, { id: 1 }],
    edges: [
      { source: 0, target: 0, weight: 4 },
      { source: 0, target: 1, weight: 5 },
    ],
  });

function cloneAdjacency(adjacency: SparseAdjacency): SparseAdjacency {
  return {
    offsets: adjacency.offsets.slice(),
    indices: adjacency.indices.slice(),
    weights: adjacency.weights.slice(),
    edgeIds: adjacency.edgeIds.slice(),
  };
}

function cloneGraph(graph: SparseGraph): SparseGraph {
  return {
    ...graph,
    nodeIds: [...graph.nodeIds],
    nodeAttributes: graph.nodeAttributes.map((attributes) => ({ ...attributes })),
    attributes: { ...graph.attributes },
    edgeSources: graph.edgeSources.slice(),
    edgeTargets: graph.edgeTargets.slice(),
    edgeWeights: graph.edgeWeights.slice(),
    edgeAttributes: graph.edgeAttributes.map((attributes) => ({ ...attributes })),
    csr: cloneAdjacency(graph.csr),
    csc: cloneAdjacency(graph.csc),
  };
}

function replace(graph: SparseGraph, key: keyof SparseGraph, value: unknown): void {
  Object.assign(graph, { [key]: value });
}

function replaceAdjacency(graph: SparseGraph, key: "csr" | "csc", value: Partial<SparseAdjacency>): void {
  Object.assign(graph, { [key]: { ...graph[key], ...value } });
}

function expectInvalid(
  mutate: (graph: SparseGraph) => void,
  message: RegExp,
  factory: () => SparseGraph = twoEdgeDirected,
): void {
  const graph = cloneGraph(factory());
  mutate(graph);
  expect(() => makeSparseGraph(graph)).toThrow(message);
}

describe("graph normalization branch coverage", () => {
  it("accepts every JSON-safe attribute scalar and defaults omitted edge weights", () => {
    const graph = createGraph({
      directed: false,
      attributes: { text: "ok", count: 1, enabled: true, absent: null },
      nodes: [
        { id: "left", attributes: { count: 0, enabled: false } },
        { id: 2 },
      ],
      edges: [{ source: "left", target: 2, attributes: { note: null } }],
    });

    expect(graph.attributes).toEqual({ text: "ok", count: 1, enabled: true, absent: null });
    expect(graph.nodeAttributes).toEqual([{ count: 0, enabled: false }, {}]);
    expect(graph.edgeAttributes).toEqual([{ note: null }]);
    expect(Array.from(graph.edgeWeights)).toEqual([1]);
  });

  it.each([
    ["missing direction", { nodes: [], edges: [] }, /directed must be a boolean/i],
    ["non-boolean direction", { directed: "yes", nodes: [], edges: [] }, /directed must be a boolean/i],
    ["non-finite numeric node id", { directed: true, nodes: [{ id: Number.NaN }], edges: [] }, /node id must be/i],
    ["object node id", { directed: true, nodes: [{ id: {} }], edges: [] }, /node id must be/i],
    ["invalid edge source id", { directed: true, nodes: [{ id: "a" }], edges: [{ source: {}, target: "a" }] }, /edge 0 source must be/i],
    ["invalid edge target id", { directed: true, nodes: [{ id: "a" }], edges: [{ source: "a", target: Number.POSITIVE_INFINITY }] }, /edge 0 target must be/i],
    ["primitive node attributes", { directed: true, nodes: [{ id: "a", attributes: 3 }], edges: [] }, /attributes for node a must be an object/i],
    ["null node attributes", { directed: true, nodes: [{ id: "a", attributes: null }], edges: [] }, /attributes for node a must be an object/i],
    ["array node attributes", { directed: true, nodes: [{ id: "a", attributes: [] }], edges: [] }, /attributes for node a must be an object/i],
    ["non-finite node attribute", { directed: true, nodes: [{ id: "a", attributes: { score: Number.NaN } }], edges: [] }, /numeric values must be finite/i],
    ["invalid graph attributes", { directed: true, attributes: [], nodes: [], edges: [] }, /graph attributes must be an object/i],
    [
      "invalid edge attributes",
      { directed: true, nodes: [{ id: "a" }, { id: "b" }], edges: [{ source: "a", target: "b", attributes: "bad" }] },
      /attributes for edge 0 must be an object/i,
    ],
  ])("rejects %s", (_label, input, message) => {
    expect(() => createGraph(input as unknown as GraphData)).toThrow(message as RegExp);
  });

  it("drops GraphData self-loops only when the explicit loop policy disables them", () => {
    const input: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { source: "a", target: "a", weight: 8 },
        { source: "a", target: "b", weight: 2 },
      ],
    };
    expect(Array.from(createGraph(input).edgeWeights)).toEqual([8, 2]);
    expect(toLegacyEdgeList(input, { loops: false }).edges).toEqual([[0, 1, 2]]);
    expect(createGraph(input, { diag: false }).loops).toBe(false);
  });

  it("applies directed, mode, loops, and diag precedence deterministically", () => {
    const data: GraphData = { directed: false, nodes: [{ id: 0 }, { id: 1 }], edges: [{ source: 0, target: 1 }] };
    expect(createGraph(data).directed).toBe(false);
    expect(createGraph(data, { mode: "digraph" }).directed).toBe(true);
    expect(createGraph(data, { mode: "digraph", directed: false }).directed).toBe(false);
    expect(createGraph(data, { diag: false }).loops).toBe(false);
    expect(createGraph(data, { diag: false, loops: true }).loops).toBe(true);
  });

  it("mirrors undirected GraphData edges when direction is overridden and matches staged sparse conversion", () => {
    const data: GraphData = {
      directed: false,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "a", weight: 7, attributes: { kind: "loop" } },
        { source: "b", target: "a", weight: 2, attributes: { kind: "ab" } },
        { source: "c", target: "b", weight: 3, attributes: { kind: "bc" } },
      ],
    };

    const direct = createGraph(data, { mode: "digraph" });
    const staged = makeSparseGraph(createGraph(data), { directed: true });
    expect(direct).toEqual(staged);
    expect(toLegacyEdgeList(direct).edges).toEqual([
      [0, 0, 7],
      [0, 1, 2],
      [1, 0, 2],
      [1, 2, 3],
      [2, 1, 3],
    ]);
    expect(direct.edgeAttributes).toEqual([
      { kind: "loop" },
      { kind: "ab" },
      { kind: "ab" },
      { kind: "bc" },
      { kind: "bc" },
    ]);
  });

  it("mirrors an explicitly undirected legacy edge list when direction is overridden", () => {
    const input = {
      directed: false,
      order: 3,
      edges: [
        [1, 0, 2],
        [2, 1, 3],
      ],
    } as const;

    const direct = makeSparseGraph(input, { directed: true });
    const staged = makeSparseGraph(makeSparseGraph(input), { directed: true });
    expect(direct).toEqual(staged);
    expect(toLegacyEdgeList(direct).edges).toEqual([
      [0, 1, 2],
      [1, 0, 2],
      [1, 2, 3],
      [2, 1, 3],
    ]);
  });

  it("canonicalizes the reverse directed-to-undirected override through the explicit duplicate policy", () => {
    const reciprocal: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { source: "a", target: "b", weight: 2, attributes: { selected: "first" } },
        { source: "b", target: "a", weight: 3, attributes: { selected: "last" } },
      ],
    };

    expect(() => createGraph(reciprocal, { mode: "graph" })).toThrow(/duplicate edge/i);
    const direct = createGraph(reciprocal, { mode: "graph", duplicateEdges: "sum" });
    const staged = makeSparseGraph(createGraph(reciprocal), { directed: false, duplicateEdges: "sum" });
    expect(direct).toEqual(staged);
    expect(toLegacyEdgeList(direct).edges).toEqual([[0, 1, 5]]);
    expect(direct.edgeAttributes).toEqual([{ selected: "first" }]);
  });

  it("distinguishes GraphData from tuple edge lists even without a nodes discriminator", () => {
    const objectEdges = {
      directed: true,
      edges: [{ source: "a", target: "a" }],
      nodes: [{ id: "a" }],
    } satisfies GraphData;
    expect(createGraph(objectEdges).nodeIds).toEqual(["a"]);

    const emptyTupleList: EdgeListInput = { edges: [], order: 2 };
    expect(makeSparseGraph(emptyTupleList).nodeIds).toEqual([0, 1]);
  });
});

describe("legacy edge-list normalization branch coverage", () => {
  it("infers order, honors both index-base sources, and lets options override input", () => {
    const inferred = makeSparseGraph({ indexBase: 1, directed: false, edges: [[1, 4, 7]] });
    expect(inferred.order).toBe(4);
    expect(Array.from(inferred.edgeSources)).toEqual([0]);
    expect(Array.from(inferred.edgeTargets)).toEqual([3]);

    const overridden = makeSparseGraph({ indexBase: 0, edges: [[1, 2]] }, { indexBase: 1, directed: false });
    expect(overridden.order).toBe(2);
    expect(Array.from(overridden.edgeSources)).toEqual([0]);
    expect(Array.from(overridden.edgeTargets)).toEqual([1]);
    expect(Array.from(overridden.edgeWeights)).toEqual([1]);
  });

  it("filters disabled loops and legacy non-finite missing ties", () => {
    const graph = makeSparseGraph(
      {
        order: 3,
        directed: true,
        edges: [
          [0, 0, 9],
          [0, 1, Number.NaN],
          [1, 2, Number.POSITIVE_INFINITY],
          [2, 0, 3],
        ],
      },
      { loops: false },
    );
    expect(graph.loops).toBe(false);
    expect(toLegacyEdgeList(graph).edges).toEqual([[2, 0, 3]]);
  });

  it.each([
    [{ order: -1, edges: [] }, /order must be a non-negative integer/i],
    [{ order: 1.5, edges: [] }, /order must be a non-negative integer/i],
    [{ order: 0x1_0000_0000, edges: [] }, /order exceeds Uint32 capacity/i],
    [{ edges: [[-1, 0]] }, /vertices must be non-negative integers/i],
    [{ edges: [[0.5, 1]] }, /vertices must be non-negative integers/i],
    [{ indexBase: 1, edges: [[0, 1]] }, /vertices must be non-negative integers/i],
  ])("rejects malformed edge-list input %#", (input, message) => {
    expect(() => makeSparseGraph(input as EdgeListInput)).toThrow(message);
  });
});

describe("matrix and legacy DenseGraph normalization branch coverage", () => {
  it("handles the full matrix-cell domain without inventing absent edges", () => {
    const matrix: MatrixLike = [
      [true, false, null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -2],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const graph = makeSparseGraph(matrix, { directed: true });
    expect(toLegacyEdgeList(graph).edges).toEqual([
      [0, 0, 1],
      [0, 7, -2],
    ]);
  });

  it("supports empty, loop-free, symmetric, one-sided, and all-zero undirected matrices", () => {
    expect(makeSparseGraph([], { directed: false }).order).toBe(0);

    const matrix = [
      [6, 2, 0, 0],
      [2, 7, 0, 0],
      [4, 0, 8, 0],
      [0, 0, 0, 9],
    ];
    const withLoops = makeSparseGraph(matrix, { mode: "graph", loops: true });
    expect(toLegacyEdgeList(withLoops).edges).toEqual([
      [0, 0, 6],
      [1, 1, 7],
      [2, 2, 8],
      [3, 3, 9],
      [0, 1, 2],
      [0, 2, 4],
    ]);
    const loopFree = makeSparseGraph(matrix, { directed: false, loops: false });
    expect(toLegacyEdgeList(loopFree).edges).toEqual([
      [0, 1, 2],
      [0, 2, 4],
    ]);
  });

  it("rejects non-square matrices and exercises every reciprocal merge policy", () => {
    expect(() => makeSparseGraph([[0, 1], [1]], { directed: false })).toThrow(/square/i);
    const asymmetric = [
      [0, 9],
      [3, 0],
    ];
    expect(Array.from(makeSparseGraph(asymmetric, { directed: false, duplicateEdges: "first" }).edgeWeights)).toEqual([9]);
    expect(Array.from(makeSparseGraph(asymmetric, { directed: false, duplicateEdges: "last" }).edgeWeights)).toEqual([3]);
    expect(Array.from(makeSparseGraph(asymmetric, { directed: false, duplicateEdges: "sum" }).edgeWeights)).toEqual([12]);
    expect(Array.from(makeSparseGraph(asymmetric, { directed: false, duplicateEdges: "max" }).edgeWeights)).toEqual([9]);
  });

  it("normalizes directed DenseGraph adjacency, loop policy, and invalid dense weights", () => {
    const dense: DenseGraph = {
      kind: "dense",
      order: 2,
      directed: true,
      loops: true,
      adjacency: new Uint8Array([1, 1, 2, 1]),
      weights: new Float64Array([4, 5, 6, Number.NaN]),
    };
    expect(toLegacyEdgeList(dense).edges).toEqual([
      [0, 0, 4],
      [0, 1, 5],
    ]);
    expect(toLegacyEdgeList(dense, { loops: false }).edges).toEqual([[0, 1, 5]]);
  });

  it("normalizes undirected DenseGraph loops and reciprocal values", () => {
    const dense: DenseGraph = {
      kind: "dense",
      order: 3,
      directed: false,
      loops: true,
      adjacency: new Uint8Array([
        1, 1, 0,
        1, 1, 1,
        1, 1, 0,
      ]),
      weights: new Float64Array([
        2, 4, 0,
        4, 3, 7,
        6, 8, 0,
      ]),
    };
    const graph = makeSparseGraph(dense, { duplicateEdges: "max" });
    expect(toLegacyEdgeList(graph).edges).toEqual([
      [0, 0, 2],
      [1, 1, 3],
      [0, 1, 4],
      [0, 2, 6],
      [1, 2, 8],
    ]);

    const directedOverride = makeSparseGraph(dense, { directed: true, loops: false });
    expect(toLegacyEdgeList(directedOverride).edges).toEqual([
      [0, 1, 4],
      [1, 0, 4],
      [1, 2, 7],
      [2, 0, 6],
      [2, 1, 8],
    ]);
  });

  it("rejects duplicate sums that overflow and retains the incumbent on a lower max candidate", () => {
    const duplicate: GraphData = {
      directed: true,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [
        { source: 0, target: 1, weight: 1e308, attributes: { chosen: "first" } },
        { source: 0, target: 1, weight: 1e308, attributes: { chosen: "second" } },
      ],
    };
    expect(() => createGraph(duplicate, { duplicateEdges: "sum" })).toThrow(/summed duplicate edge weight must remain finite/i);

    const lower = createGraph(
      {
        directed: true,
        nodes: [{ id: 0 }, { id: 1 }],
        edges: [
          { source: 0, target: 1, weight: 5, attributes: { chosen: "first" } },
          { source: 0, target: 1, weight: 4, attributes: { chosen: "second" } },
        ],
      },
      { duplicateEdges: "max" },
    );
    expect(Array.from(lower.edgeWeights)).toEqual([5]);
    expect(lower.edgeAttributes).toEqual([{ chosen: "first" }]);
  });
});

describe("SparseGraph validation and conversion branch coverage", () => {
  it("recognizes only the sparse graph discriminator", () => {
    expect(isSparseGraph(twoEdgeDirected())).toBe(true);
    expect(isSparseGraph(null)).toBe(false);
    expect(isSparseGraph(3)).toBe(false);
    expect(isSparseGraph({})).toBe(false);
    expect(isSparseGraph({ kind: "dense" })).toBe(false);
  });

  it.each([
    ["negative order", (graph: SparseGraph) => replace(graph, "order", -1), /order must fit/i],
    ["fractional order", (graph: SparseGraph) => replace(graph, "order", 1.5), /order must fit/i],
    ["oversized order", (graph: SparseGraph) => replace(graph, "order", 0x1_0000_0000), /order must fit/i],
    ["negative size", (graph: SparseGraph) => replace(graph, "size", -1), /size must fit/i],
    ["fractional size", (graph: SparseGraph) => replace(graph, "size", 1.5), /size must fit/i],
    ["oversized size", (graph: SparseGraph) => replace(graph, "size", 0x1_0000_0000), /size must fit/i],
    ["short node ids", (graph: SparseGraph) => replace(graph, "nodeIds", graph.nodeIds.slice(1)), /node arrays must match order/i],
    ["short node attributes", (graph: SparseGraph) => replace(graph, "nodeAttributes", graph.nodeAttributes.slice(1)), /node arrays must match order/i],
    ["short edge sources", (graph: SparseGraph) => replace(graph, "edgeSources", graph.edgeSources.slice(1)), /edge arrays must match size/i],
    ["short edge targets", (graph: SparseGraph) => replace(graph, "edgeTargets", graph.edgeTargets.slice(1)), /edge arrays must match size/i],
    ["short edge weights", (graph: SparseGraph) => replace(graph, "edgeWeights", graph.edgeWeights.slice(1)), /edge arrays must match size/i],
    ["short edge attributes", (graph: SparseGraph) => replace(graph, "edgeAttributes", graph.edgeAttributes.slice(1)), /edge arrays must match size/i],
  ])("rejects sparse metadata invariant: %s", (_label, mutate, message) => {
    expectInvalid(mutate as (graph: SparseGraph) => void, message as RegExp);
  });

  it.each([
    ["invalid graph attributes", (graph: SparseGraph) => replace(graph, "attributes", []), /sparse graph attributes must be an object/i],
    ["invalid node id", (graph: SparseGraph) => (graph.nodeIds as unknown as unknown[])[0] = Number.NaN, /sparse graph node id must be/i],
    ["duplicate node id", (graph: SparseGraph) => (graph.nodeIds as unknown as unknown[])[1] = "a", /duplicate node id/i],
    ["invalid node attributes", (graph: SparseGraph) => (graph.nodeAttributes as unknown as unknown[])[0] = [], /attributes for sparse node/i],
    ["out-of-range source", (graph: SparseGraph) => ((graph.edgeSources as Uint32Array)[0] = graph.order), /out-of-range edge endpoint/i],
    ["out-of-range target", (graph: SparseGraph) => ((graph.edgeTargets as Uint32Array)[0] = graph.order), /out-of-range edge endpoint/i],
    ["non-finite edge weight", (graph: SparseGraph) => ((graph.edgeWeights as Float64Array)[0] = Number.NaN), /edge weights must be finite/i],
    ["invalid edge attributes", (graph: SparseGraph) => (graph.edgeAttributes as unknown as unknown[])[0] = [], /attributes for sparse edge/i],
  ])("rejects sparse content invariant: %s", (_label, mutate, message) => {
    expectInvalid(mutate as (graph: SparseGraph) => void, message as RegExp);
  });

  it("rejects a self-loop when sparse metadata claims loops are disabled", () => {
    expectInvalid(
      (graph) => replace(graph, "loops", false),
      /loop-free contains a self-loop/i,
      () => createGraph({ directed: true, nodes: [{ id: "a" }], edges: [{ source: "a", target: "a" }] }),
    );
  });

  it.each([
    ["offset length", "csr", { offsets: new Uint32Array(3) }, /CSR offsets length/i],
    ["initial offset", "csr", { offsets: new Uint32Array([1, 2, 2, 2]) }, /CSR offsets must start at zero/i],
    ["weight-array length", "csr", { weights: new Float64Array(1) }, /CSR sparse arrays must have equal lengths/i],
    ["edge-id-array length", "csr", { edgeIds: new Uint32Array(1) }, /CSR sparse arrays must have equal lengths/i],
    ["final offset", "csr", { offsets: new Uint32Array([0, 1, 1, 1]) }, /CSR final offset/i],
    ["entry count", "csr", { indices: new Uint32Array(1), weights: new Float64Array(1), edgeIds: new Uint32Array(1), offsets: new Uint32Array([0, 1, 1, 1]) }, /CSR adjacency length does not match/i],
    ["non-monotonic offsets", "csr", { offsets: new Uint32Array([0, 2, 1, 2]) }, /CSR offsets must be monotonic/i],
    ["out-of-range neighbor", "csr", { indices: new Uint32Array([3, 2]) }, /CSR contains an out-of-range node index/i],
    ["out-of-range edge id", "csr", { edgeIds: new Uint32Array([2, 1]) }, /CSR contains an out-of-range edge id/i],
    ["non-finite adjacency weight", "csr", { weights: new Float64Array([Number.NaN, 3]) }, /CSR weights must be finite/i],
    ["wrong adjacency weight", "csr", { weights: new Float64Array([7, 3]) }, /CSR weight does not match/i],
    ["wrong outgoing orientation", "csr", { indices: new Uint32Array([0, 2]) }, /CSR arc does not match/i],
    ["wrong incoming orientation", "csc", { indices: new Uint32Array([1, 0]) }, /CSC arc does not match/i],
  ])("rejects sparse adjacency invariant: %s", (_label, side, patch, message) => {
    expectInvalid((graph) => replaceAdjacency(graph, side as "csr" | "csc", patch as Partial<SparseAdjacency>), message as RegExp);
  });

  it("rejects a logical edge with a bad CSR occurrence count", () => {
    expectInvalid((graph) => {
      replaceAdjacency(graph, "csr", {
        offsets: new Uint32Array([0, 2, 2, 2]),
        indices: new Uint32Array([1, 1]),
        weights: new Float64Array([2, 2]),
        edgeIds: new Uint32Array([0, 0]),
      });
    }, /logical edge occurrence count is invalid/i);
  });

  it("validates undirected double arcs and loop single arcs in both CSR and CSC", () => {
    const graph = undirectedWithLoop();
    expect(makeSparseGraph(graph)).toBe(graph);
    expect(Array.from(graph.csr.offsets)).toEqual([0, 2, 3]);
    expect(Array.from(graph.csc.offsets)).toEqual([0, 2, 3]);
    expect(Array.from(graph.csr.edgeIds)).toEqual([0, 1, 1]);
  });

  it("converts undirected sparse input to paired directed edges and preserves loop cardinality", () => {
    const graph = makeSparseGraph(undirectedWithLoop(), { directed: true });
    expect(graph.directed).toBe(true);
    expect(toLegacyEdgeList(graph).edges).toEqual([
      [0, 0, 4],
      [0, 1, 5],
      [1, 0, 5],
    ]);
  });

  it("converts directed sparse input to undirected and can remove loops during conversion", () => {
    const directed = createGraph({
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { source: "a", target: "a", weight: 2 },
        { source: "b", target: "a", weight: 3 },
      ],
    });
    const undirected = makeSparseGraph(directed, { mode: "graph", loops: false });
    expect(undirected.directed).toBe(false);
    expect(undirected.loops).toBe(false);
    expect(toLegacyEdgeList(undirected).edges).toEqual([[0, 1, 3]]);
  });
});
