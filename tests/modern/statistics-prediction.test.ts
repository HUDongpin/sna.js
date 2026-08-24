import { describe, expect, it } from "vitest";

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
import type { GraphData } from "../../src/modern/types";

const triangleWithTail = {
  directed: false,
  nodes: [
    { id: "a", attributes: { group: "A", score: 0 } },
    { id: "b", attributes: { group: "A", score: 1 } },
    { id: "c", attributes: { group: "B", score: 2 } },
    { id: "d", attributes: { group: "B", score: 3 } },
  ],
  edges: [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "c", target: "a" },
    { source: "c", target: "d" },
  ],
} satisfies GraphData;

const pathFour = {
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

describe("modern clustering statistics", () => {
  it("counts incident triangles and preserves stable node order", () => {
    const result = triangles(triangleWithTail);
    expect(result.nodes).toEqual(["a", "b", "c", "d"]);
    expect(result.values).toEqual([1, 1, 1, 0]);
    expect(result.meta).toMatchObject({ algorithm: "triangles", directed: false, weighted: false, exact: true });
  });

  it("matches NetworkX local and average unweighted clustering", () => {
    const local = clusteringCoefficient(triangleWithTail);
    expect(local.values[0]).toBe(1);
    expect(local.values[1]).toBe(1);
    expect(local.values[2]).toBeCloseTo(1 / 3, 12);
    expect(local.values[3]).toBe(0);

    expect(averageClustering(triangleWithTail).value).toBeCloseTo(7 / 12, 12);
    expect(averageClustering(triangleWithTail, { countZeros: false }).value).toBeCloseTo(7 / 9, 12);
  });

  it("uses NetworkX/Onnela max-normalized geometric weights", () => {
    const weightedTriangle = {
      directed: false,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b", weight: 1 },
        { source: "a", target: "c", weight: 1 },
        { source: "b", target: "c", weight: 8 },
      ],
    } satisfies GraphData;
    const result = clusteringCoefficient(weightedTriangle, { weighted: true });
    expect(result.values).toHaveLength(3);
    result.values.forEach((value) => expect(value).toBeCloseTo(0.25, 12));
    expect(result.meta.valueSemantics).toBe("strength");
  });

  it.each([1e-200, 1e200])("keeps Onnela clustering scale-invariant at weight %s", (weight) => {
    const weightedTriangle = {
      directed: false,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b", weight },
        { source: "a", target: "c", weight },
        { source: "b", target: "c", weight },
      ],
    } satisfies GraphData;

    expect(clusteringCoefficient(weightedTriangle, { weighted: true }).values).toEqual([1, 1, 1]);
  });

  it("implements Fagiolo directed clustering while triangles stays undirected-only", () => {
    const directedCycle = {
      directed: true,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      edges: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 2, target: 0 },
      ],
    } satisfies GraphData;
    expect(clusteringCoefficient(directedCycle).values).toEqual([0.5, 0.5, 0.5]);
    expect(() => triangles(directedCycle)).toThrow(/directed graphs are not supported/);
  });
});

describe("modern assortativity and mixing", () => {
  it("matches NetworkX degree assortativity and degree mixing on path_graph(4)", () => {
    expect(degreeAssortativity(pathFour).value).toBeCloseTo(-0.5, 12);
    const mixing = degreeMixingMatrix(pathFour);
    expect(mixing.labels).toEqual([1, 2]);
    expect(mixing.values[0]).toEqual([0, 1 / 3]);
    expect(mixing.values[1]).toEqual([1 / 3, 1 / 3]);
    expect(degreeMixingMatrix(pathFour, { normalized: false }).values).toEqual([
      [0, 2],
      [2, 2],
    ]);
  });

  it("supports directed source/target degree modes and x/y aliases", () => {
    const directed = {
      directed: true,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      edges: [
        { source: 0, target: 1 },
        { source: 0, target: 2 },
        { source: 1, target: 2 },
        { source: 2, target: 0 },
      ],
    } satisfies GraphData;
    expect(degreeAssortativity(directed).value).toBeCloseTo(0, 12);
    expect(degreeAssortativity(directed, { source: "in", target: "out" }).value).toBeCloseTo(1, 12);
    expect(degreeAssortativity(directed, { x: "in", y: "out" }).value).toBeCloseTo(1, 12);
  });

  it("matches NetworkX categorical and numeric endpoint correlations", () => {
    expect(categoricalAssortativity(pathFour, "group").value).toBeCloseTo(1 / 3, 12);
    expect(numericAssortativity(pathFour, "score").value).toBeCloseTo(5 / 11, 12);

    const categorical = attributeMixingMatrix(pathFour, "group");
    expect(categorical.labels).toEqual(["A", "B"]);
    expect(categorical.values[0]).toEqual([1 / 3, 1 / 6]);
    expect(categorical.values[1]).toEqual([1 / 6, 1 / 3]);
    expect(attributeMixingMatrix(pathFour, "group", { normalized: false }).values).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  it.each([1e-10, 1e-200, 1e200])("keeps numeric assortativity scale-invariant at attribute scale %s", (scale) => {
    const numericTriangle = (scale: number) =>
      ({
        directed: false,
        nodes: [
          { id: 0, attributes: { score: 0 } },
          { id: 1, attributes: { score: scale } },
          { id: 2, attributes: { score: 2 * scale } },
        ],
        edges: [
          { source: 0, target: 1 },
          { source: 0, target: 2 },
          { source: 1, target: 2 },
        ],
      }) satisfies GraphData;

    const reference = numericAssortativity(numericTriangle(1), "score");
    const scaled = numericAssortativity(numericTriangle(scale), "score");

    expect(reference.value).toBeCloseTo(-0.5, 12);
    expect(scaled.value).not.toBeNull();
    expect(scaled.value).toBeCloseTo(reference.value ?? Number.NaN, 12);
    expect(scaled.meta.warnings).toEqual([]);
  });

  it("returns JSON-safe null for an undefined constant-endpoint correlation", () => {
    const complete = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      edges: [
        { source: 0, target: 1 },
        { source: 0, target: 2 },
        { source: 1, target: 2 },
      ],
    } satisfies GraphData;
    const result = degreeAssortativity(complete);
    expect(result.value).toBeNull();
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("modern structural-hole statistics", () => {
  it("matches NetworkX/Burt values on a three-node path and uses null for an isolate", () => {
    const graph = {
      directed: false,
      nodes: [{ id: "left" }, { id: "broker" }, { id: "right" }, { id: "isolate" }],
      edges: [
        { source: "left", target: "broker" },
        { source: "broker", target: "right" },
      ],
    } satisfies GraphData;
    expect(effectiveSize(graph).values).toEqual([1, 2, 1, null]);
    expect(constraint(graph).values).toEqual([1, 0.5, 1, null]);
    expect(JSON.parse(JSON.stringify(effectiveSize(graph)))).toEqual(effectiveSize(graph));
  });

  it("matches Burt redundancy and constraint on a closed triad", () => {
    const closed = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }, { id: 2 }],
      edges: [
        { source: 0, target: 1 },
        { source: 0, target: 2 },
        { source: 1, target: 2 },
      ],
    } satisfies GraphData;
    expect(effectiveSize(closed).values).toEqual([1, 1, 1]);
    constraint(closed).values.forEach((value) => expect(value).toBeCloseTo(1.125, 12));
  });

  it("rejects negative weights before weighted or unweighted analysis", () => {
    const invalid = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [{ source: 0, target: 1, weight: -1 }],
    } satisfies GraphData;
    expect(() => clusteringCoefficient(invalid)).toThrow(/non-negative/);
    expect(() => constraint(invalid, { weighted: true })).toThrow(/non-negative/);
  });
});

describe("modern link prediction", () => {
  const pairs = [
    [0, 2],
    [0, 3],
  ] as const satisfies readonly PredictionPair[];

  it("matches NetworkX common-neighbor and Jaccard scores in input pair order", () => {
    expect(commonNeighbors(pathFour, pairs).pairs).toEqual([
      { source: 0, target: 2, score: 1 },
      { source: 0, target: 3, score: 0 },
    ]);
    expect(jaccardCoefficient(pathFour, pairs).pairs).toEqual([
      { source: 0, target: 2, score: 0.5 },
      { source: 0, target: 3, score: 0 },
    ]);
  });

  it("matches NetworkX Adamic-Adar, resource allocation, and preferential attachment", () => {
    const adamic = adamicAdar(pathFour, pairs).pairs;
    expect(adamic[0]?.score).toBeCloseTo(1 / Math.log(2), 12);
    expect(adamic[1]?.score).toBe(0);
    expect(resourceAllocation(pathFour, pairs).pairs).toEqual([
      { source: 0, target: 2, score: 0.5 },
      { source: 0, target: 3, score: 0 },
    ]);
    expect(preferentialAttachment(pathFour, pairs).pairs).toEqual([
      { source: 0, target: 2, score: 2 },
      { source: 0, target: 3, score: 1 },
    ]);
  });

  it("requires explicit valid pairs and an undirected simple graph", () => {
    expect(() => commonNeighbors(pathFour, undefined as unknown as readonly PredictionPair[])).toThrow(/pairs are required/);
    expect(() => commonNeighbors(pathFour, [[0, 99]])).toThrow(/not in the graph/);

    const directed = { directed: true, nodes: [{ id: 0 }, { id: 1 }], edges: [{ source: 0, target: 1 }] } satisfies GraphData;
    expect(() => jaccardCoefficient(directed, [[0, 1]])).toThrow(/undirected graph/);

    const loopy = { directed: false, nodes: [{ id: 0 }], edges: [{ source: 0, target: 0 }] } satisfies GraphData;
    expect(() => preferentialAttachment(loopy, [[0, 0]])).toThrow(/without self-loops/);
  });

  it("rejects negative weights and keeps output JSON-safe", () => {
    const invalid = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [{ source: 0, target: 1, weight: -0.5 }],
    } satisfies GraphData;
    expect(() => resourceAllocation(invalid, [[0, 1]])).toThrow(/non-negative/);
    const result = adamicAdar(pathFour, pairs);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});
