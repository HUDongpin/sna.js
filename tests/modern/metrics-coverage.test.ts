import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/modern/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/modern/graph")>();
  return {
    ...actual,
    makeSparseGraph(input: unknown, ...options: unknown[]) {
      if (typeof input === "object" && input !== null && "__coverageSparse" in input) {
        return (input as { __coverageSparse: unknown }).__coverageSparse;
      }
      return actual.makeSparseGraph(
        input as Parameters<typeof actual.makeSparseGraph>[0],
        ...(options as [Parameters<typeof actual.makeSparseGraph>[1]]),
      );
    },
  };
});

import { ConvergenceError, harmonicCentrality, hits, pageRank } from "../../src/centrality";
import { createGraph } from "../../src/graph";
import {
  adamicAdar,
  commonNeighbors,
  jaccardCoefficient,
  preferentialAttachment,
  resourceAllocation,
  type PredictionPair,
} from "../../src/prediction";
import {
  attributeMixingMatrix,
  averageClustering,
  categoricalAssortativity,
  clusteringCoefficient,
  constraint,
  degreeAssortativity,
  degreeMixingMatrix,
  effectiveSize,
  numericAssortativity,
  triangles,
} from "../../src/statistics";
import type { GraphData, ModernGraphInput, SparseAdjacency, SparseGraph } from "../../src/modern/types";

function probe(graph: SparseGraph): ModernGraphInput {
  return { __coverageSparse: graph } as unknown as ModernGraphInput;
}

function replaceAdjacency(
  graph: SparseGraph,
  csr: SparseAdjacency,
  csc: SparseAdjacency = csr,
): SparseGraph {
  return { ...graph, csr, csc };
}

const twoNodeArc = {
  directed: true,
  nodes: [{ id: "a" }, { id: "b" }],
  edges: [{ source: "a", target: "b" }],
} satisfies GraphData;

const undirectedPath = {
  directed: false,
  nodes: [
    { id: 0, attributes: { group: "A", score: 0 } },
    { id: 1, attributes: { group: "A", score: 1 } },
    { id: 2, attributes: { group: "B", score: 2 } },
    { id: 3, attributes: { group: "B", score: 3 } },
  ],
  edges: [
    { source: 0, target: 1 },
    { source: 1, target: 2 },
    { source: 2, target: 3 },
  ],
} satisfies GraphData;

describe("centrality branch coverage", () => {
  it("returns structured empty results for every centrality", () => {
    const empty = { directed: true, nodes: [], edges: [] } satisfies GraphData;
    expect(pageRank(empty)).toMatchObject({ nodes: [], values: [], meta: { converged: true, iterations: 0 } });
    expect(hits(empty)).toMatchObject({ nodes: [], hubs: [], authorities: [], meta: { converged: true, iterations: 0 } });
    expect(harmonicCentrality(empty)).toMatchObject({ nodes: [], values: [], meta: { converged: true, iterations: 0 } });
  });

  it("accepts vectors, maps, and pair distributions while preserving normalization", () => {
    const graph = {
      directed: true,
      nodes: [{ id: "a" }, { id: 1 }, { id: "sink" }],
      edges: [
        { source: "a", target: 1 },
        { source: 1, target: "sink" },
      ],
    } satisfies GraphData;

    const vector = pageRank(graph, {
      personalization: [3, 1, 0],
      dangling: new Map<string | number, number>([
        ["a", 0],
        [1, 0],
        ["sink", 4],
      ]),
      tolerance: 1e-13,
      maxIterations: 500,
    });
    expect(vector.values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 13);

    const pairs = pageRank(graph, {
      personalization: [
        ["a", 2],
        [1, 1],
        ["sink", 1],
      ],
      dangling: [1, 2, 1],
      tolerance: 1e-13,
      maxIterations: 500,
    });
    expect(pairs.nodes).toEqual(["a", 1, "sink"]);
    expect(pairs.values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 13);
  });

  it("rejects every invalid PageRank distribution form", () => {
    expect(() => pageRank(twoNodeArc, { personalization: [1] })).toThrow(/vector length/i);
    expect(() => pageRank(twoNodeArc, { personalization: [-1, 2] })).toThrow(/non-negative/i);
    expect(() => pageRank(twoNodeArc, { personalization: [Number.NaN, 1] })).toThrow(/finite/i);
    expect(() => pageRank(twoNodeArc, { dangling: [["a", 1], ["a", 1]] })).toThrow(/duplicate node/i);
    expect(() => pageRank(twoNodeArc, { dangling: [["missing", 1]] })).toThrow(/unknown node/i);
    expect(() => pageRank(twoNodeArc, { personalization: [["a"]] as unknown as readonly [string, number][] })).toThrow(/entries must be/i);
    expect(() => pageRank(twoNodeArc, { personalization: new Map([["a", 0]]) })).toThrow(/positive finite sum/i);
  });

  it("validates damping and iteration controls at both numeric boundaries", () => {
    expect(() => pageRank(twoNodeArc, { damping: -0.01 })).toThrow(/damping/i);
    expect(() => pageRank(twoNodeArc, { damping: Number.NaN })).toThrow(/damping/i);
    expect(() => pageRank(twoNodeArc, { tolerance: 0 })).toThrow(/tolerance/i);
    expect(() => pageRank(twoNodeArc, { tolerance: Number.POSITIVE_INFINITY })).toThrow(/tolerance/i);
    expect(() => pageRank(twoNodeArc, { maxIterations: -1 })).toThrow(/maxIterations/i);
    expect(() => hits(twoNodeArc, { maxIterations: 1.5 })).toThrow(/maxIterations/i);
  });

  it("handles zero-strength arcs, binary PageRank, progress, and convergence policy", () => {
    const graph = {
      directed: true,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [
        { source: 0, target: 1, weight: 0 },
        { source: 1, target: 0, weight: 4 },
      ],
    } satisfies GraphData;
    const progress: Array<[number, number]> = [];
    const weighted = pageRank(graph, {
      maxIterations: 2,
      allowPartial: true,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(weighted.meta).toMatchObject({ converged: false, partial: true, iterations: 2 });
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(() => pageRank(graph, { maxIterations: 0 })).toThrow(ConvergenceError);
    expect(pageRank(graph, { weighted: false, tolerance: 1e-13, maxIterations: 500 }).meta.valueSemantics).toBe("binary");
  });

  it("covers weighted and binary HITS, zero norms, progress, abort, and partial output", () => {
    const graph = {
      directed: true,
      nodes: [{ id: "hub" }, { id: "left" }, { id: "right" }],
      edges: [
        { source: "hub", target: "left", weight: 0 },
        { source: "hub", target: "right", weight: 5 },
      ],
    } satisfies GraphData;
    const weighted = hits(graph, { tolerance: 1e-13 });
    expect(weighted.hubs[0]).toBeCloseTo(1, 12);
    expect(weighted.authorities).toEqual([0, 0, 1]);

    const progress: number[] = [];
    const binary = hits(graph, { weighted: false, tolerance: 1e-13, onProgress: (done) => progress.push(done) });
    expect(binary.authorities[1]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(binary.authorities[2]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(progress.length).toBeGreaterThan(0);

    const aborted = new AbortController();
    expect(() =>
      hits(graph, {
        signal: aborted.signal,
        onProgress: () => aborted.abort(),
      }),
    ).toThrow(/abort/i);
    expect(() => hits(graph, { maxIterations: 0 })).toThrow(ConvergenceError);
    expect(hits(graph, { maxIterations: 0, allowPartial: true }).meta.warnings).toHaveLength(1);

    const noEdges = hits({ directed: true, nodes: [{ id: 0 }], edges: [] });
    expect(noEdges).toMatchObject({ hubs: [0], authorities: [0], meta: { converged: true } });
  });

  it("covers weighted heap updates, stale entries, zero strengths, incoming direction, and singleton normalization", () => {
    const graph = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      edges: [
        { source: "a", target: "b", weight: 1 },
        { source: "a", target: "c", weight: 10 },
        { source: "c", target: "b", weight: 10 },
        { source: "c", target: "d", weight: 0 },
        { source: "b", target: "d", weight: 2 },
      ],
    } satisfies GraphData;
    const outgoing = harmonicCentrality(graph);
    expect(outgoing.values[0]).toBeCloseTo(10 + 5 + 10 / 7, 12);
    expect(outgoing.values[3]).toBe(0);

    const incoming = harmonicCentrality(graph, { direction: "in", weighted: false, normalized: true });
    expect(incoming.values[0]).toBe(0);
    expect(incoming.values[3]).toBeCloseTo((1 + 1 + 1 / 2) / 3, 12);

    expect(harmonicCentrality({ directed: false, nodes: [{ id: "only" }], edges: [] }, { normalized: true }).values).toEqual([0]);
  });

  it("honors harmonic cancellation and rejects negative strengths for all centralities", () => {
    const duringProgress = new AbortController();
    expect(() =>
      harmonicCentrality(twoNodeArc, {
        signal: duringProgress.signal,
        onProgress: () => duringProgress.abort(),
      }),
    ).toThrow(/abort/i);

    const negative = {
      directed: true,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [{ source: 0, target: 1, weight: -1 }],
    } satisfies GraphData;
    expect(() => pageRank(negative)).toThrow(/non-negative edge strengths/i);
    expect(() => hits(negative)).toThrow(/non-negative edge strengths/i);
    expect(() => harmonicCentrality(negative)).toThrow(/non-negative edge strengths/i);
  });
});

describe("statistics branch coverage", () => {
  it("defines empty and singleton statistics without NaN or unstable labels", () => {
    const empty = { directed: false, nodes: [], edges: [] } satisfies GraphData;
    expect(triangles(empty).values).toEqual([]);
    expect(clusteringCoefficient(empty).values).toEqual([]);
    expect(averageClustering(empty)).toMatchObject({ value: null, meta: { warnings: [expect.stringMatching(/undefined/i)] } });
    expect(degreeAssortativity(empty).value).toBeNull();
    expect(degreeMixingMatrix(empty)).toMatchObject({ labels: [], values: [] });
    expect(categoricalAssortativity(empty, "group").value).toBeNull();
    expect(numericAssortativity(empty, "score").value).toBeNull();
    expect(attributeMixingMatrix(empty, "group")).toMatchObject({ labels: [], values: [] });
    expect(constraint(empty).values).toEqual([]);
    expect(effectiveSize(empty).values).toEqual([]);

    const singleton = {
      directed: false,
      nodes: [{ id: "only", attributes: { group: "one", score: 7 } }],
      edges: [],
    } satisfies GraphData;
    expect(averageClustering(singleton).value).toBe(0);
    expect(averageClustering(singleton, { countZeros: false }).value).toBeNull();
    expect(categoricalAssortativity(singleton, "group").value).toBe(0);
    expect(numericAssortativity(singleton, "score").value).toBeNull();
    expect(constraint(singleton)).toMatchObject({ values: [null], meta: { warnings: [expect.stringMatching(/1 isolated/i)] } });
    expect(effectiveSize(singleton)).toMatchObject({ values: [null], meta: { warnings: [expect.stringMatching(/1 isolated/i)] } });
  });

  it("ignores loops in neighbor statistics while degree mixing counts them", () => {
    const loopy = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      edges: [
        { source: 0, target: 0, weight: 2 },
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 2, target: 0 },
      ],
    } satisfies GraphData;
    expect(triangles(loopy).values).toEqual([1, 1, 1]);
    expect(clusteringCoefficient(loopy).values).toEqual([1, 1, 1]);
    expect(degreeMixingMatrix(loopy, { normalized: false }).labels).toContain(4);
  });

  it("covers directed weighted clustering including reciprocal arcs", () => {
    const directed = {
      directed: true,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      edges: [
        { source: 0, target: 1, weight: 2 },
        { source: 1, target: 0, weight: 1 },
        { source: 0, target: 2, weight: 3 },
        { source: 2, target: 1, weight: 4 },
        { source: 1, target: 2, weight: 5 },
      ],
    } satisfies GraphData;
    const binary = clusteringCoefficient(directed);
    const weighted = clusteringCoefficient(directed, { weighted: true });
    expect(binary.values.every((value) => value > 0)).toBe(true);
    expect(weighted.values.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(weighted.meta).toMatchObject({ directed: true, weighted: true, valueSemantics: "strength" });
  });

  it("excludes zero coefficients and reports an undefined all-zero average", () => {
    const noTriangles = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      edges: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
      ],
    } satisfies GraphData;
    expect(averageClustering(noTriangles, { countZeros: false })).toMatchObject({
      value: null,
      meta: { warnings: [expect.stringMatching(/no coefficients/i)] },
    });
  });

  it("covers directed degree modes, aliases, totals, weights, and invalid modes", () => {
    const directed = {
      directed: true,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
      edges: [
        { source: 0, target: 1, weight: 2 },
        { source: 0, target: 2, weight: 3 },
        { source: 1, target: 2, weight: 4 },
        { source: 2, target: 3, weight: 5 },
        { source: 3, target: 0, weight: 1 },
      ],
    } satisfies GraphData;
    expect(degreeAssortativity(directed, { source: "total", target: "total" }).value).not.toBeUndefined();
    expect(degreeAssortativity(directed, { x: "in", y: "out" }).value).not.toBeUndefined();
    const weighted = degreeAssortativity(directed, { source: "out", target: "in", weighted: true });
    expect(weighted.meta).toMatchObject({ weighted: true, valueSemantics: "strength" });
    expect(degreeMixingMatrix(directed, { source: "in", target: "total", weighted: true, normalized: false }).values.flat().reduce((a, b) => a + b, 0)).toBe(5);
    expect(() => degreeAssortativity(directed, { source: "bad" as "in" })).toThrow(/degree mode/i);
  });

  it("returns raw and normalized mixing matrices with stable mixed labels", () => {
    const mixed = {
      directed: false,
      nodes: [
        { id: 0, attributes: { group: 1 } },
        { id: 1, attributes: { group: "A" } },
        { id: 2, attributes: { group: 1 } },
      ],
      edges: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
      ],
    } satisfies GraphData;
    expect(attributeMixingMatrix(mixed, "group").labels).toEqual([1, "A"]);
    const raw = attributeMixingMatrix(mixed, "group", { normalized: false });
    expect(raw.values).toEqual([
      [0, 2],
      [2, 0],
    ]);
    expect(attributeMixingMatrix(mixed, "group").values.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 14);
  });

  it("rejects missing, empty, boolean, and non-numeric attributes", () => {
    const invalid = {
      directed: false,
      nodes: [
        { id: 0, attributes: { group: "A", score: 1 } },
        { id: 1, attributes: { group: true, score: "not-number" } },
      ],
      edges: [{ source: 0, target: 1 }],
    } satisfies GraphData;
    expect(() => categoricalAssortativity(invalid, "")).toThrow(/must not be empty/i);
    expect(() => categoricalAssortativity(invalid, "missing")).toThrow(/string or number/i);
    expect(() => categoricalAssortativity(invalid, "group")).toThrow(/string or number/i);
    expect(() => numericAssortativity(invalid, "")).toThrow(/must not be empty/i);
    expect(() => numericAssortativity(invalid, "missing")).toThrow(/finite number/i);
    expect(() => numericAssortativity(invalid, "score")).toThrow(/finite number/i);
    expect(() => attributeMixingMatrix(invalid, "missing")).toThrow(/string or number/i);
  });

  it("returns null and warnings for degenerate categorical and numeric attributes", () => {
    const constant = {
      directed: false,
      nodes: [
        { id: 0, attributes: { group: "same", score: 1 } },
        { id: 1, attributes: { group: "same", score: 1 } },
      ],
      edges: [{ source: 0, target: 1 }],
    } satisfies GraphData;
    expect(categoricalAssortativity(constant, "group")).toMatchObject({ value: null, meta: { warnings: [expect.any(String)] } });
    expect(numericAssortativity(constant, "score")).toMatchObject({ value: null, meta: { warnings: [expect.any(String)] } });
  });

  it("covers weighted and directed structural-hole formulas, zero scales, and no-warning results", () => {
    const directed = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b", weight: 2 },
        { source: "b", target: "a", weight: 1 },
        { source: "b", target: "c", weight: 3 },
        { source: "a", target: "c", weight: 0 },
      ],
    } satisfies GraphData;
    const weightedConstraint = constraint(directed, { weighted: true });
    const weightedSize = effectiveSize(directed, { weighted: true });
    expect(weightedConstraint.values.every((value) => value !== null && Number.isFinite(value))).toBe(true);
    expect(weightedSize.values.every((value) => value !== null && Number.isFinite(value))).toBe(true);
    expect(weightedConstraint.meta).toMatchObject({ directed: true, weighted: true, warnings: [] });
    expect(weightedSize.meta).toMatchObject({ directed: true, weighted: true, warnings: [] });

    const zero = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [{ source: 0, target: 1, weight: 0 }],
    } satisfies GraphData;
    expect(constraint(zero, { weighted: true }).values).toEqual([0, 0]);
    expect(effectiveSize(zero, { weighted: true }).values).toEqual([1, 1]);
  });

  it("enforces the statistics boundary if a sparse normalizer supplies malformed shapes", () => {
    const base = createGraph({ directed: false, nodes: [{ id: 0 }, { id: 1 }], edges: [] });
    const shortOffsets = replaceAdjacency(base, {
      ...base.csr,
      offsets: new Uint32Array([0, 0]),
    });
    expect(() => triangles(probe(shortOffsets))).toThrow(/malformed sparse graph offsets/i);

    const mismatchedArrays = replaceAdjacency(base, {
      offsets: new Uint32Array([0, 0, 1]),
      indices: new Uint32Array([1]),
      weights: new Float64Array(),
      edgeIds: new Uint32Array([0]),
    });
    expect(() => clusteringCoefficient(probe(mismatchedArrays))).toThrow(/malformed sparse graph index\/weight arrays/i);
  });

  it("uses safe defaults for sparse offset holes and undefined adjacency entries", () => {
    const base = createGraph({
      directed: false,
      nodes: [
        { id: 0, attributes: { group: "A", score: 0 } },
        { id: 1, attributes: { group: "B", score: 1 } },
      ],
      edges: [],
    });
    const holeOffsets = [] as unknown as Uint32Array;
    (holeOffsets as unknown as { length: number }).length = 3;
    const emptyIndices = new Uint32Array();
    const emptyWeights = new Float64Array();
    const emptyEdgeIds = new Uint32Array();
    const loose = replaceAdjacency(base, {
      offsets: holeOffsets,
      indices: emptyIndices,
      weights: emptyWeights,
      edgeIds: emptyEdgeIds,
    });
    const input = probe(loose);
    expect(triangles(input).values).toEqual([0, 0]);
    expect(clusteringCoefficient(input).values).toEqual([0, 0]);
    expect(degreeAssortativity(input).value).toBeNull();
    expect(degreeMixingMatrix(input).values).toEqual([[0]]);
    expect(numericAssortativity(input, "score").value).toBeNull();
    expect(attributeMixingMatrix(input, "group").values).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(constraint(input).values).toEqual([null, null]);
    expect(effectiveSize(input).values).toEqual([null, null]);

    const undefinedIndex = [undefined] as unknown as Uint32Array;
    const oneEntry = replaceAdjacency(
      base,
      {
        offsets: new Uint32Array([0, 1, 1]),
        indices: undefinedIndex,
        weights: new Float64Array([1]),
        edgeIds: new Uint32Array([0]),
      },
      {
        offsets: new Uint32Array([0, 1, 1]),
        indices: undefinedIndex,
        weights: new Float64Array([1]),
        edgeIds: new Uint32Array([0]),
      },
    );
    expect(clusteringCoefficient(probe(oneEntry)).values).toEqual([0, 0]);
    expect(degreeAssortativity(probe(oneEntry)).value).toBeNull();
    expect(attributeMixingMatrix(probe(oneEntry), "group").values.flat().reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("checks node-attribute shape and finite values at the statistics seam", () => {
    const base = createGraph({
      directed: false,
      nodes: [
        { id: 0, attributes: { group: "A", score: 0 } },
        { id: 1, attributes: { group: "B", score: 1 } },
      ],
      edges: [{ source: 0, target: 1 }],
    });
    const missingAttributes = { ...base, nodeAttributes: [base.nodeAttributes[0]!] } as SparseGraph;
    expect(() => categoricalAssortativity(probe(missingAttributes), "group")).toThrow(/node attributes are malformed/i);

    const nonFiniteAttributes = {
      ...base,
      nodeAttributes: [
        { group: Number.POSITIVE_INFINITY, score: Number.POSITIVE_INFINITY },
        { group: "B", score: 1 },
      ],
    } as unknown as SparseGraph;
    expect(() => categoricalAssortativity(probe(nonFiniteAttributes), "group")).toThrow(/must be finite/i);
    expect(() => numericAssortativity(probe(nonFiniteAttributes), "score")).toThrow(/finite number/i);
  });

  it("safely ignores out-of-range sparse neighbors in mixing and structural-hole fallbacks", () => {
    const base = createGraph({
      directed: false,
      nodes: [
        { id: 0, attributes: { group: "A", score: 0 } },
        { id: 1, attributes: { group: "B", score: 1 } },
      ],
      edges: [],
    });
    const outOfRange = replaceAdjacency(base, {
      offsets: new Uint32Array([0, 1, 2]),
      indices: new Uint32Array([99, 99]),
      weights: new Float64Array([1, 1]),
      edgeIds: new Uint32Array([0, 0]),
    });
    const input = probe(outOfRange);
    expect(attributeMixingMatrix(input, "group").values.flat().reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(degreeMixingMatrix(input).values.flat().reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(degreeAssortativity(input).value).toBeNull();
    expect(constraint(input).values).toEqual([1, 1]);
    expect(effectiveSize(input).values).toEqual([1, 1]);
  });
});

describe("link-prediction branch coverage", () => {
  const allScorers = [commonNeighbors, jaccardCoefficient, adamicAdar, resourceAllocation, preferentialAttachment] as const;

  it("preserves empty pair input and metadata for every scorer", () => {
    for (const scorer of allScorers) {
      const result = scorer(undirectedPath, []);
      expect(result).toMatchObject({ pairs: [], meta: { directed: false, weighted: false, valueSemantics: "binary", exact: true } });
    }
  });

  it("rejects omitted, malformed, short, and long pairs", () => {
    expect(() => commonNeighbors(undirectedPath, undefined as unknown as readonly PredictionPair[])).toThrow(/pairs are required/i);
    expect(() => commonNeighbors(undirectedPath, [null as unknown as PredictionPair])).toThrow(/exactly two/i);
    expect(() => commonNeighbors(undirectedPath, [[0] as unknown as PredictionPair])).toThrow(/exactly two/i);
    expect(() => commonNeighbors(undirectedPath, [[0, 1, 2] as unknown as PredictionPair])).toThrow(/exactly two/i);
  });

  it("distinguishes unknown source and target identities", () => {
    expect(() => commonNeighbors(undirectedPath, [[99, 0]])).toThrow(/source node 99/i);
    expect(() => commonNeighbors(undirectedPath, [[0, 99]])).toThrow(/target node 99/i);
  });

  it("rejects directed, negative-strength, and self-loop graphs for every family", () => {
    const directed = { directed: true, nodes: [{ id: 0 }, { id: 1 }], edges: [{ source: 0, target: 1 }] } satisfies GraphData;
    const negative = { directed: false, nodes: [{ id: 0 }, { id: 1 }], edges: [{ source: 0, target: 1, weight: -1 }] } satisfies GraphData;
    const loopy = { directed: false, nodes: [{ id: 0 }], edges: [{ source: 0, target: 0 }] } satisfies GraphData;
    for (const scorer of allScorers) {
      expect(() => scorer(directed, [[0, 1]])).toThrow(/undirected graph/i);
      expect(() => scorer(negative, [[0, 1]])).toThrow(/non-negative/i);
      expect(() => scorer(loopy, [[0, 0]])).toThrow(/without self-loops/i);
    }
  });

  it("covers isolated endpoints, reversed degree ordering, self-pairs, and existing edges", () => {
    const graph = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      edges: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 1, target: 3 },
      ],
    } satisfies GraphData;
    const pairs = [
      [0, 2],
      [2, 0],
      [0, 4],
      [4, 4],
      [0, 1],
    ] as const;
    expect(commonNeighbors(graph, pairs).pairs.map(({ score }) => score)).toEqual([1, 1, 0, 0, 0]);
    expect(jaccardCoefficient(graph, pairs).pairs.map(({ score }) => score)).toEqual([1, 1, 0, 0, 0]);
    expect(resourceAllocation(graph, pairs).pairs[0]?.score).toBeCloseTo(1 / 3, 12);
    expect(adamicAdar(graph, pairs).pairs[0]?.score).toBeCloseTo(1 / Math.log(3), 12);
    expect(preferentialAttachment(graph, pairs).pairs.map(({ score }) => score)).toEqual([1, 1, 0, 0, 3]);
  });

  it("rejects the mathematically undefined Adamic-Adar self-pair leaf case", () => {
    const edge = { directed: false, nodes: [{ id: 0 }, { id: 1 }], edges: [{ source: 0, target: 1 }] } satisfies GraphData;
    expect(() => adamicAdar(edge, [[0, 0]])).toThrow(/degree greater than one/i);
    expect(resourceAllocation(edge, [[0, 0]]).pairs[0]?.score).toBe(1);
  });

  it("returns exact values from all five formulas on a shared-neighbor graph", () => {
    const pair = [[0, 2]] as const;
    expect(commonNeighbors(undirectedPath, pair).pairs[0]).toEqual({ source: 0, target: 2, score: 1 });
    expect(jaccardCoefficient(undirectedPath, pair).pairs[0]?.score).toBeCloseTo(0.5, 12);
    expect(adamicAdar(undirectedPath, pair).pairs[0]?.score).toBeCloseTo(1 / Math.log(2), 12);
    expect(resourceAllocation(undirectedPath, pair).pairs[0]?.score).toBeCloseTo(0.5, 12);
    expect(preferentialAttachment(undirectedPath, pair).pairs[0]?.score).toBe(2);
  });

  it("uses safe defaults for sparse offset holes and loop-like adjacency entries", () => {
    const base = createGraph({ directed: false, nodes: [{ id: 0 }], edges: [] });
    const holeOffsets = [] as unknown as Uint32Array;
    (holeOffsets as unknown as { length: number }).length = 2;
    const withHoles = replaceAdjacency(base, {
      offsets: holeOffsets,
      indices: new Uint32Array(),
      weights: new Float64Array(),
      edgeIds: new Uint32Array(),
    });
    expect(jaccardCoefficient(probe(withHoles), [[0, 0]]).pairs[0]?.score).toBe(0);

    const undefinedIndex = replaceAdjacency(base, {
      offsets: new Uint32Array([0, 1]),
      indices: [undefined] as unknown as Uint32Array,
      weights: new Float64Array([1]),
      edgeIds: new Uint32Array([0]),
    });
    expect(commonNeighbors(probe(undefinedIndex), [[0, 0]]).pairs[0]?.score).toBe(0);

    const sameNodeIndex = replaceAdjacency(base, {
      offsets: new Uint32Array([0, 1]),
      indices: new Uint32Array([0]),
      weights: new Float64Array([1]),
      edgeIds: new Uint32Array([0]),
    });
    expect(preferentialAttachment(probe(sameNodeIndex), [[0, 0]]).pairs[0]?.score).toBe(0);
  });

  it("guards undefined common-neighbor degrees supplied across the sparse seam", () => {
    const base = createGraph({ directed: false, nodes: [{ id: 0 }, { id: 1 }], edges: [] });
    const outOfRange = replaceAdjacency(base, {
      offsets: new Uint32Array([0, 1, 2]),
      indices: new Uint32Array([99, 99]),
      weights: new Float64Array([1, 1]),
      edgeIds: new Uint32Array([0, 0]),
    });
    expect(() => adamicAdar(probe(outOfRange), [[0, 1]])).toThrow(/degree greater than one/i);
    expect(() => resourceAllocation(probe(outOfRange), [[0, 1]])).toThrow(/positive degree/i);
  });

  it("rejects non-finite and negative scores at the shared prediction boundary", () => {
    const nonFinite = vi.spyOn(Math, "log").mockReturnValue(Number.NaN);
    try {
      expect(() => adamicAdar(undirectedPath, [[0, 2]])).toThrow(/score.+not finite and non-negative/i);
    } finally {
      nonFinite.mockRestore();
    }

    const negative = vi.spyOn(Math, "log").mockReturnValue(-1);
    try {
      expect(() => adamicAdar(undirectedPath, [[0, 2]])).toThrow(/score.+not finite and non-negative/i);
    } finally {
      negative.mockRestore();
    }
  });
});
