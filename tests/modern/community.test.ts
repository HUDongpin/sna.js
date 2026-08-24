import { describe, expect, it } from "vitest";

import {
  girvanNewman,
  greedyModularity,
  infomap,
  kCliqueCommunities,
  labelPropagation,
  leiden,
  louvain,
  mapEquation,
  modularity,
  partitionQuality,
  validatePartition,
} from "../../src/community/index";
import type { GraphData, NodeId, PartitionResult } from "../../src/modern/types";

const twoTriangles: GraphData<string> = {
  directed: false,
  nodes: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id })),
  edges: [
    { source: "a", target: "b" },
    { source: "a", target: "c" },
    { source: "b", target: "c" },
    { source: "c", target: "d" },
    { source: "d", target: "e" },
    { source: "d", target: "f" },
    { source: "e", target: "f" },
  ],
};

function expectCanonicalPartition(result: PartitionResult): void {
  expect(result.nodes).toHaveLength(result.membership.length);
  expect(result.communities.flat()).toHaveLength(result.nodes.length);
  expect(new Set(result.communities.flat())).toEqual(new Set(result.nodes));
  for (let community = 0; community < result.communities.length; community += 1) {
    for (const node of result.communities[community]!) {
      expect(result.membership[result.nodes.indexOf(node)]).toBe(community);
    }
  }
}

function inducedCommunityIsConnected(graph: GraphData, community: readonly NodeId[]): boolean {
  if (community.length <= 1) return true;
  const allowed = new Set(community);
  const adjacency = new Map<NodeId, Set<NodeId>>();
  for (const node of community) adjacency.set(node, new Set());
  for (const edge of graph.edges) {
    if (!allowed.has(edge.source) || !allowed.has(edge.target)) continue;
    adjacency.get(edge.source)!.add(edge.target);
    adjacency.get(edge.target)!.add(edge.source);
  }
  const seen = new Set<NodeId>([community[0]!]);
  const queue = [community[0]!];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of adjacency.get(queue[cursor]!)!) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return seen.size === community.length;
}

describe("partition validation and quality", () => {
  it("validates identity-safe community arrays and membership results", () => {
    const graph: GraphData = {
      directed: false,
      nodes: [{ id: "a" }, { id: 7 }, { id: "isolate" }],
      edges: [{ source: "a", target: 7 }],
    };
    expect(validatePartition(graph, [["a", 7], ["isolate"]])).toBe(true);
    expect(validatePartition(graph, { nodes: [7, "isolate", "a"], membership: [4, 9, 4] })).toBe(true);
    expect(() => validatePartition(graph, [["a", 7]])).toThrow(/omits node/i);
    expect(() => validatePartition(graph, [["a", 7], [7, "isolate"]])).toThrow(/more than once/i);
    expect(() => validatePartition(graph, [["a", 7], ["missing"]])).toThrow(/unknown node/i);
    expect(() => validatePartition(graph, [["a", 7], []])).toThrow(/must not be empty/i);
    expect(() => validatePartition(graph, { nodes: ["a"], membership: [-1] })).toThrow(/non-negative integers/i);
  });

  it("matches the canonical two-triangle modularity, coverage, and performance", () => {
    const partition = [["a", "b", "c"], ["d", "e", "f"]];
    expect(modularity(twoTriangles, partition)).toBeCloseTo(5 / 14, 12);
    expect(partitionQuality(twoTriangles, partition)).toEqual({ coverage: 6 / 7, performance: 14 / 15 });
  });

  it("supports directed weighted modularity and rejects negative strengths", () => {
    const directed: GraphData = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [
        { source: "a", target: "b", weight: 2 },
        { source: "b", target: "a", weight: 1 },
      ],
    };
    expect(modularity(directed, [["a", "b"]])).toBeCloseTo(0, 14);
    expect(() => modularity({ ...directed, edges: [{ source: "a", target: "b", weight: -1 }] }, [["a"], ["b"]])).toThrow(
      /non-negative edge weights/i,
    );
  });
});

describe("disjoint community detection", () => {
  it("finds the canonical two-cluster split with greedy modularity", () => {
    const progress: number[] = [];
    const result = greedyModularity(twoTriangles, { onProgress: (completed) => progress.push(completed) });
    expect(result.communities).toEqual([["a", "b", "c"], ["d", "e", "f"]]);
    expect(result.quality.modularity).toBeCloseTo(5 / 14, 12);
    expect(result.meta).toMatchObject({ algorithm: "greedy-modularity", directed: false, exact: false });
    expect(progress.length).toBeGreaterThan(0);
    expectCanonicalPartition(result);
  });

  it("makes seeded Louvain reproducible and preserves the public result contract", () => {
    const first = louvain(twoTriangles, { seed: "repeatable", threshold: 1e-11 });
    const second = louvain(twoTriangles, { seed: "repeatable", threshold: 1e-11 });
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.communities).toEqual([["a", "b", "c"], ["d", "e", "f"]]);
    expect(first.quality.modularity).toBeCloseTo(5 / 14, 12);
    expect(first.meta).toMatchObject({ algorithm: "louvain", seed: "repeatable", exact: false });
    expectCanonicalPartition(first);
    expect(louvain(twoTriangles, { seed: "repeatable", tolerance: 1e-11 })).toEqual(first);
    expect(() => louvain(twoTriangles, { threshold: 1e-9, tolerance: 1e-8 })).toThrow(/must match/i);
  });

  it("runs distinct Leiden refinement for modularity and CPM and returns connected communities", () => {
    const modularityResult = leiden(twoTriangles, { seed: 17, objective: "modularity", beta: 0.02, iterations: 3 });
    const repeated = leiden(twoTriangles, { seed: 17, objective: "modularity", beta: 0.02, iterations: 3 });
    const cpmResult = leiden(twoTriangles, { seed: 17, objective: "cpm", resolution: 0.4, beta: 0.02, iterations: 3 });

    expect(repeated).toEqual(modularityResult);
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(modularityResult));
    expect(modularityResult.meta.algorithm).toBe("leiden-restricted");
    expect(modularityResult.meta.algorithm).not.toBe("louvain");
    expect(modularityResult.meta.warnings.join(" ")).toMatch(/refinement/i);
    expect(modularityResult.quality.modularity).toBeTypeOf("number");
    expect(cpmResult.quality.cpm).toBeTypeOf("number");
    expect(cpmResult.quality.modularity).toBeUndefined();
    for (const community of modularityResult.communities) expect(inducedCommunityIsConnected(twoTriangles, community)).toBe(true);
    for (const community of cpmResult.communities) expect(inducedCommunityIsConnected(twoTriangles, community)).toBe(true);
    expectCanonicalPartition(modularityResult);
    expectCanonicalPartition(cpmResult);
    expect(leiden(twoTriangles, { seed: 17, theta: 0.02, maxLevels: 3 })).toEqual(modularityResult);
    expect(() => leiden(twoTriangles, { beta: 0.01, theta: 0.02 })).toThrow(/must match/i);
    expect(() => leiden(twoTriangles, { iterations: 2, maxLevels: 3 })).toThrow(/must match/i);
  });

  it("optimizes the map equation directly on directed flow", () => {
    const directedCycles: GraphData<string> = {
      directed: true,
      nodes: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id })),
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "a" },
        { source: "d", target: "e" },
        { source: "e", target: "f" },
        { source: "f", target: "d" },
        { source: "c", target: "d", weight: 0.02 },
        { source: "f", target: "a", weight: 0.02 },
      ],
    };
    const singleton = directedCycles.nodes.map((node) => [node.id]);
    const progress: number[] = [];
    const result = infomap(directedCycles, { seed: "flow", tolerance: 1e-12, trials: 4, onProgress: (completed) => progress.push(completed) });
    const repeated = infomap(directedCycles, { seed: "flow", tolerance: 1e-12, trials: 4 });

    expect(repeated).toEqual(result);
    expect(JSON.stringify(repeated)).toBe(JSON.stringify(result));
    expect(result.meta).toMatchObject({ algorithm: "infomap-two-level-greedy", directed: true, seed: "flow" });
    expect(result.meta.algorithm).not.toBe("louvain");
    expect(result.quality.codeLength).toBeCloseTo(mapEquation(directedCycles, result), 12);
    expect(result.quality.codeLength!).toBeLessThan(mapEquation(directedCycles, singleton));
    expect(result.meta.warnings.join(" ")).toMatch(/Ran 4 independent seeded optimization trial/);
    expect(progress).toEqual([1, 2, 3, 4]);
    expectCanonicalPartition(result);
  });

  it("executes exactly the requested number of Infomap trials with a caller RNG", () => {
    let draws = 0;
    const result = infomap(twoTriangles, {
      trials: 5,
      rng: () => {
        draws += 1;
        return 0.25;
      },
    });
    expect(draws).toBe(5);
    expect(result.meta.seed).toBeUndefined();
    expect(result.meta.warnings.join(" ")).toMatch(/Ran 5 independent seeded optimization trial/);
  });

  it("returns a bounded Girvan-Newman hierarchy and rejects unbounded requests", () => {
    const path: GraphData<number> = {
      directed: false,
      nodes: [0, 1, 2, 3].map((id) => ({ id })),
      edges: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 2, target: 3 },
      ],
    };
    expect(() => girvanNewman(path, {})).toThrow(/requires maxCommunities or levels/i);
    const result = girvanNewman(path, { levels: 1 });
    expect(result.levels).toHaveLength(1);
    expect(result.levels[0]!.communities).toEqual([[0, 1], [2, 3]]);
    expect(result.levels[0]!.meta.algorithm).toBe("girvan-newman");
    expect(result.meta.exact).toBe(true);
  });

  it("keeps weighted Girvan-Newman shortest paths invariant under distance scaling", () => {
    const graph = (scale: number): GraphData<number> => ({
      directed: false,
      nodes: [0, 1, 2, 3].map((id) => ({ id })),
      edges: [
        { source: 0, target: 3, weight: 1.25 * scale },
        { source: 2, target: 3, weight: 2 * scale },
        { source: 0, target: 2, weight: 1.5 * scale },
        { source: 1, target: 3, weight: 1.25 * scale },
      ],
    });

    const unit = girvanNewman(graph(1), { levels: 1, useWeights: true });
    const tiny = girvanNewman(graph(1e-12), { levels: 1, useWeights: true });
    expect(unit.levels[0]!.communities).toEqual([[0, 2, 3], [1]]);
    expect(tiny.levels[0]!.communities).toEqual(unit.levels[0]!.communities);
    expect(tiny.meta.iterations).toBe(unit.meta.iterations);
  });

  it("adapts seeded label propagation to stable node identities", () => {
    const disconnected: GraphData<string> = {
      directed: false,
      nodes: ["a", "b", "c", "x", "y", "z"].map((id) => ({ id })),
      edges: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "b", target: "c" },
        { source: "x", target: "y" },
        { source: "x", target: "z" },
        { source: "y", target: "z" },
      ],
    };
    const first = labelPropagation(disconnected, { seed: 9 });
    const second = labelPropagation(disconnected, { seed: 9 });
    expect(second).toEqual(first);
    expect(first.communities).toEqual([["a", "b", "c"], ["x", "y", "z"]]);
    expect(first.meta).toMatchObject({ algorithm: "label-propagation", seed: 9, converged: true });
    expectCanonicalPartition(first);
  });

  it("treats zero-strength edges as no label-propagation vote", () => {
    const zeroStrengthPair: GraphData<string> = {
      directed: false,
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ source: "a", target: "b", weight: 0 }],
    };

    const result = labelPropagation(zeroStrengthPair, { seed: 9 });
    expect(result.communities).toEqual([["a"], ["b"]]);
    expect(result.membership).toEqual([0, 1]);
    expect(result.meta.converged).toBe(true);
  });

  it("checks cancellation in iterative algorithms", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => louvain(twoTriangles, { signal: controller.signal })).toThrow();
    expect(() => girvanNewman(twoTriangles, { levels: 1, signal: controller.signal })).toThrow();
    expect(() => labelPropagation(twoTriangles, { signal: controller.signal })).toThrow();
  });
});

describe("overlapping k-clique communities", () => {
  it("percolates adjacent triangles while retaining overlap memberships", () => {
    const graph: GraphData<number> = {
      directed: false,
      nodes: [0, 1, 2, 3, 4, 5, 6].map((id) => ({ id })),
      edges: [
        { source: 0, target: 1 },
        { source: 0, target: 2 },
        { source: 1, target: 2 },
        { source: 1, target: 3 },
        { source: 2, target: 3 },
        { source: 0, target: 4 },
        { source: 0, target: 5 },
        { source: 4, target: 5 },
      ],
    };
    const result = kCliqueCommunities(graph, 3);
    expect(result.nodes).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.communities).toEqual([[0, 1, 2, 3], [0, 4, 5]]);
    expect(result.memberships).toEqual([[0, 1], [0], [0], [0], [1], [1], []]);
    expect(result.meta).toMatchObject({ algorithm: "k-clique-percolation", exact: true });
  });

  it("enforces graph and enumeration bounds", () => {
    expect(() => kCliqueCommunities({ ...twoTriangles, directed: true }, 3)).toThrow(/undirected/i);
    expect(() => kCliqueCommunities(twoTriangles, 1)).toThrow(/integer >= 2/i);
    expect(() => kCliqueCommunities(twoTriangles, 3, { maxCliques: 1 })).toThrow(/maxCliques/i);
  });
});
