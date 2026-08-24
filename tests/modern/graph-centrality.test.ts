import { describe, expect, it } from "vitest";

import { ConvergenceError, harmonicCentrality, hits, pageRank } from "../../src/centrality/index";
import { createGraph, makeSparseGraph, toLegacyEdgeList } from "../../src/graph/index";
import type { GraphData } from "../../src/modern/types";

const directedData: GraphData = {
  directed: true,
  attributes: { title: "attributes survive", public: true },
  nodes: [
    { id: "a", attributes: { group: "left" } },
    { id: 7, attributes: { group: "right", score: 2 } },
    { id: "isolate" },
  ],
  edges: [{ source: "a", target: 7, weight: 2, attributes: { relation: "knows" } }],
};

describe("modern sparse graph normalization", () => {
  it("preserves stable mixed node ids and graph/node/edge attributes", () => {
    const graph = createGraph(directedData);
    expect(graph.kind).toBe("sparse");
    expect(graph.nodeIds).toEqual(["a", 7, "isolate"]);
    expect(graph.nodeAttributes).toEqual([{ group: "left" }, { group: "right", score: 2 }, {}]);
    expect(graph.attributes).toEqual({ title: "attributes survive", public: true });
    expect(graph.edgeAttributes).toEqual([{ relation: "knows" }]);
    expect(Array.from(graph.edgeSources)).toEqual([0]);
    expect(Array.from(graph.edgeTargets)).toEqual([1]);
    expect(Array.from(graph.edgeWeights)).toEqual([2]);
  });

  it("builds matching CSR and CSC without a dense n-squared allocation", () => {
    const graph = createGraph(directedData);
    expect(Array.from(graph.csr.offsets)).toEqual([0, 1, 1, 1]);
    expect(Array.from(graph.csr.indices)).toEqual([1]);
    expect(Array.from(graph.csc.offsets)).toEqual([0, 0, 1, 1]);
    expect(Array.from(graph.csc.indices)).toEqual([0]);

    const large = makeSparseGraph({ order: 100_000, directed: true, edges: [[0, 99_999]] });
    expect(large.order).toBe(100_000);
    expect(large.size).toBe(1);
    expect(large.csr.offsets.length).toBe(100_001);
    expect(large.csr.indices.length).toBe(1);
    expect(large.csc.indices.length).toBe(1);
  });

  it("stores an undirected logical edge once and exposes both sparse arcs", () => {
    const graph = createGraph({
      directed: false,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "b", target: "a", weight: 4 }],
    });
    expect(graph.size).toBe(1);
    expect(Array.from(graph.edgeSources)).toEqual([0]);
    expect(Array.from(graph.edgeTargets)).toEqual([1]);
    expect(Array.from(graph.csr.offsets)).toEqual([0, 1, 2]);
    expect(Array.from(graph.csr.indices)).toEqual([1, 0]);
    expect(Array.from(graph.csr.weights)).toEqual([4, 4]);
  });

  it("rejects edge endpoints that are not explicitly declared", () => {
    expect(() =>
      createGraph({
        directed: true,
        nodes: [{ id: "declared" }],
        edges: [{ source: "missing", target: "declared" }],
      }),
    ).toThrow(/source node is not declared/i);
    expect(() =>
      createGraph({
        directed: true,
        nodes: [{ id: "declared" }],
        edges: [{ source: "declared", target: "missing" }],
      }),
    ).toThrow(/target node is not declared/i);
  });

  it("rejects duplicate logical edges unless a deterministic policy is explicit", () => {
    const duplicate: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { source: "a", target: "b", weight: 2, attributes: { selected: "first" } },
        { source: "a", target: "b", weight: 3, attributes: { selected: "last" } },
      ],
    };
    expect(() => createGraph(duplicate)).toThrow(/duplicate edge/i);
    expect(Array.from(createGraph(duplicate, { duplicateEdges: "sum" }).edgeWeights)).toEqual([5]);
    expect(Array.from(createGraph(duplicate, { duplicateEdges: "first" }).edgeWeights)).toEqual([2]);
    expect(Array.from(createGraph(duplicate, { duplicateEdges: "last" }).edgeWeights)).toEqual([3]);
    const max = createGraph(duplicate, { duplicateEdges: "max" });
    expect(Array.from(max.edgeWeights)).toEqual([3]);
    expect(max.edgeAttributes).toEqual([{ selected: "last" }]);
  });

  it("treats reverse undirected edges as duplicates", () => {
    const data: GraphData = {
      directed: false,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { source: "a", target: "b", weight: 2 },
        { source: "b", target: "a", weight: 3 },
      ],
    };
    expect(() => createGraph(data)).toThrow(/duplicate edge/i);
    expect(Array.from(createGraph(data, { duplicateEdges: "sum" }).edgeWeights)).toEqual([5]);
  });

  it("accepts legacy matrices, edge lists, and sparse graphs", () => {
    const matrix = makeSparseGraph(
      [
        [0, 2, 0],
        [2, 0, 1],
        [0, 1, 0],
      ],
      { directed: false },
    );
    expect(matrix.nodeIds).toEqual([0, 1, 2]);
    expect(matrix.size).toBe(2);
    expect(makeSparseGraph(matrix)).toBe(matrix);

    const oneBased = makeSparseGraph({ order: 3, indexBase: 1, directed: true, edges: [[1, 3, 2]] });
    expect(oneBased.nodeIds).toEqual([0, 1, 2]);
    expect(Array.from(oneBased.edgeSources)).toEqual([0]);
    expect(Array.from(oneBased.edgeTargets)).toEqual([2]);
  });

  it("validates logical duplicates and CSR/CSC consistency on SparseGraph input", () => {
    const duplicate = createGraph({
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
      ],
    });
    (duplicate.edgeTargets as Uint32Array)[1] = 1;
    expect(() => makeSparseGraph(duplicate)).toThrow(/duplicate logical edge/i);

    const inconsistent = createGraph(directedData);
    (inconsistent.csr.weights as Float64Array)[0] = 3;
    expect(() => makeSparseGraph(inconsistent)).toThrow(/weight does not match/i);
  });

  it("makes asymmetric undirected matrices resolve ambiguity explicitly", () => {
    const asymmetric = [
      [0, 2],
      [3, 0],
    ];
    expect(() => makeSparseGraph(asymmetric, { directed: false })).toThrow(/duplicate edge/i);
    expect(Array.from(makeSparseGraph(asymmetric, { directed: false, duplicateEdges: "max" }).edgeWeights)).toEqual([3]);
  });

  it("converts to the lossy legacy zero-based edge-list boundary", () => {
    expect(toLegacyEdgeList(directedData)).toEqual({
      order: 3,
      indexBase: 0,
      directed: true,
      edges: [[0, 1, 2]],
    });
  });

  it("rejects duplicate node ids, non-finite weights, and non-scalar attributes", () => {
    expect(() => createGraph({ directed: true, nodes: [{ id: "a" }, { id: "a" }], edges: [] })).toThrow(/duplicate node/i);
    expect(() => createGraph({ directed: true, nodes: [{ id: "a" }, { id: "b" }], edges: [{ source: "a", target: "b", weight: Number.POSITIVE_INFINITY }] })).toThrow(
      /finite/i,
    );
    const invalid = { directed: true, nodes: [{ id: "a", attributes: { nested: { bad: true } } }], edges: [] };
    expect(() => createGraph(invalid as unknown as GraphData)).toThrow(/JSON-safe scalars/i);
  });
});

describe("PageRank", () => {
  it("handles dangling mass and preserves node identities", () => {
    const result = pageRank(
      {
        directed: true,
        nodes: [{ id: "a" }, { id: "b" }],
        edges: [{ source: "a", target: "b" }],
      },
      { tolerance: 1e-13, maxIterations: 500 },
    );
    expect(result.nodes).toEqual(["a", "b"]);
    expect(result.values[0]).toBeCloseTo(0.3508771929824561, 11);
    expect(result.values[1]).toBeCloseTo(0.6491228070175439, 11);
    expect(result.values[0]! + result.values[1]!).toBeCloseTo(1, 14);
    expect(result.meta).toMatchObject({
      algorithm: "pagerank",
      directed: true,
      weighted: true,
      valueSemantics: "strength",
      exact: false,
      approximate: true,
      converged: true,
      partial: false,
    });
  });

  it("supports identity-safe personalization and a separate dangling vector", () => {
    const input: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: 1 }],
      edges: [{ source: "a", target: 1 }],
    };
    const result = pageRank(input, {
      personalization: new Map<string | number, number>([
        ["a", 1],
        [1, 0],
      ]),
      dangling: [
        ["a", 0],
        [1, 1],
      ],
      tolerance: 1e-13,
      maxIterations: 500,
    });
    expect(result.values[0]).toBeCloseTo(0.15, 12);
    expect(result.values[1]).toBeCloseTo(0.85, 12);
  });

  it("uses strength by default and supports binary arcs explicitly", () => {
    const input: GraphData = {
      directed: true,
      nodes: [{ id: "source" }, { id: "light" }, { id: "heavy" }],
      edges: [
        { source: "source", target: "light", weight: 1 },
        { source: "source", target: "heavy", weight: 9 },
        { source: "light", target: "source", weight: 1 },
        { source: "heavy", target: "source", weight: 1 },
      ],
    };
    const weighted = pageRank(input, { tolerance: 1e-13, maxIterations: 500 });
    const binary = pageRank(input, { weighted: false, tolerance: 1e-13, maxIterations: 500 });
    expect(weighted.values[2]!).toBeGreaterThan(weighted.values[1]!);
    expect(binary.values[2]).toBeCloseTo(binary.values[1]!, 12);
    expect(binary.meta.valueSemantics).toBe("binary");
  });

  it("throws on non-convergence by default and returns a marked partial iterate when allowed", () => {
    const input: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b" }],
    };
    expect(() => pageRank(input, { maxIterations: 0 })).toThrow(ConvergenceError);
    const partial = pageRank(input, { maxIterations: 0, allowPartial: true });
    expect(partial.meta).toMatchObject({ converged: false, iterations: 0, partial: true });
    expect(partial.meta.warnings).toHaveLength(1);
    expect(partial.values).toEqual([0.5, 0.5]);
  });

  it("validates damping, distributions, and non-negative strengths", () => {
    const input: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b", weight: -1 }],
    };
    expect(() => pageRank(input)).toThrow(/non-negative edge strengths/i);
    expect(() => pageRank({ directed: true, nodes: [{ id: "a" }], edges: [] }, { damping: 1 })).toThrow(/damping/i);
    expect(() => pageRank({ directed: true, nodes: [{ id: "a" }], edges: [] }, { personalization: [0] })).toThrow(/positive finite sum/i);
    expect(() => pageRank({ directed: true, nodes: [{ id: "a" }], edges: [] }, { personalization: new Map([["missing", 1]]) })).toThrow(/unknown node/i);
  });
});

describe("HITS", () => {
  it("computes normalized hubs and authorities on a directed fan", () => {
    const result = hits(
      {
        directed: true,
        nodes: [{ id: "hub" }, { id: "left" }, { id: "right" }],
        edges: [
          { source: "hub", target: "left" },
          { source: "hub", target: "right" },
        ],
      },
      { tolerance: 1e-13 },
    );
    expect(result.nodes).toEqual(["hub", "left", "right"]);
    expect(result.hubs[0]).toBeCloseTo(1, 12);
    expect(result.hubs[1]).toBeCloseTo(0, 12);
    expect(result.hubs[2]).toBeCloseTo(0, 12);
    expect(result.authorities[0]).toBeCloseTo(0, 12);
    expect(result.authorities[1]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(result.authorities[2]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(result.meta.converged).toBe(true);
  });

  it("handles edgeless graphs and partial non-convergence", () => {
    const empty = hits({ directed: true, nodes: [{ id: "a" }, { id: "b" }], edges: [] });
    expect(empty.hubs).toEqual([0, 0]);
    expect(empty.authorities).toEqual([0, 0]);
    expect(empty.meta.converged).toBe(true);

    expect(() => hits(directedData, { maxIterations: 0 })).toThrow(ConvergenceError);
    expect(hits(directedData, { maxIterations: 0, allowPartial: true }).meta.partial).toBe(true);
  });
});

describe("harmonicCentrality", () => {
  const chain: GraphData = {
    directed: true,
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [
      { source: "a", target: "b", weight: 2 },
      { source: "b", target: "c", weight: 1 },
    ],
  };

  it("uses inverse strength as distance without materializing all-pairs distances", () => {
    const result = harmonicCentrality(chain);
    expect(result.nodes).toEqual(["a", "b", "c"]);
    expect(result.values[0]).toBeCloseTo(2 + 2 / 3, 12);
    expect(result.values[1]).toBeCloseTo(1, 12);
    expect(result.values[2]).toBe(0);
    expect(result.meta).toMatchObject({
      algorithm: "harmonic-centrality",
      weighted: true,
      valueSemantics: "strength",
      exact: true,
    });
  });

  it("supports binary distances, incoming direction, and normalization", () => {
    expect(harmonicCentrality(chain, { weighted: false }).values).toEqual([1.5, 1, 0]);
    expect(harmonicCentrality(chain, { weighted: false, direction: "in" }).values).toEqual([0, 1, 1.5]);
    expect(harmonicCentrality(chain, { weighted: false, normalized: true }).values).toEqual([0.75, 0.5, 0]);
  });

  it("rejects invalid direction values and non-finite weighted-distance arithmetic", () => {
    expect(() => harmonicCentrality(chain, { direction: "sideways" as never })).toThrow(
      new RangeError('harmonic centrality direction must be "out" or "in"'),
    );

    const tinyStrength: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b", weight: Number.MIN_VALUE }],
    };
    expect(() => harmonicCentrality(tinyStrength)).toThrow(/finite inverse-strength distances/i);

    const pathDistanceOverflow: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b", weight: 1e-308 },
        { source: "b", target: "c", weight: 1e-308 },
      ],
    };
    expect(() => harmonicCentrality(pathDistanceOverflow)).toThrow(/path distances must remain finite/i);
  });

  it("rejects reciprocal and accumulated harmonic scores that overflow", () => {
    const reciprocalOverflow: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b", weight: Number.MAX_VALUE }],
    };
    expect(() => harmonicCentrality(reciprocalOverflow)).toThrow(/reciprocal contribution must remain finite/i);

    const accumulatedOverflow: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      edges: [
        { source: "a", target: "b", weight: Number.MAX_VALUE / 2 },
        { source: "a", target: "c", weight: Number.MAX_VALUE / 2 },
        { source: "a", target: "d", weight: Number.MAX_VALUE / 2 },
      ],
    };
    expect(() => harmonicCentrality(accumulatedOverflow)).toThrow(/score must remain finite/i);
  });

  it("reports progress and honors AbortSignal", () => {
    const progress: Array<[number, number]> = [];
    harmonicCentrality(chain, { onProgress: (done, total) => progress.push([done, total]) });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);

    const preAborted = new AbortController();
    preAborted.abort();
    expect(() => harmonicCentrality(chain, { signal: preAborted.signal })).toThrow(/abort/i);

    const duringProgress = new AbortController();
    expect(() =>
      pageRank(chain, {
        signal: duringProgress.signal,
        onProgress: () => duringProgress.abort(),
      }),
    ).toThrow(/abort/i);
  });
});
