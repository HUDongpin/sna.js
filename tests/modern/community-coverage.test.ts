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
import type { GraphData } from "../../src/modern/types";

const emptyUndirected: GraphData = { directed: false, nodes: [], edges: [] };

const singleton: GraphData<string> = {
  directed: false,
  nodes: [{ id: "only" }],
  edges: [],
};

const edgelessPair: GraphData<number> = {
  directed: false,
  nodes: [{ id: 0 }, { id: 1 }],
  edges: [],
};

const path: GraphData<number> = {
  directed: false,
  nodes: [0, 1, 2, 3].map((id) => ({ id })),
  edges: [
    { source: 0, target: 1 },
    { source: 1, target: 2 },
    { source: 2, target: 3 },
  ],
};

const weightedDiamond: GraphData<number> = {
  directed: false,
  nodes: [0, 1, 2, 3].map((id) => ({ id })),
  edges: [
    { source: 0, target: 1, weight: 1 },
    { source: 0, target: 2, weight: 1 },
    { source: 1, target: 3, weight: 1 },
    { source: 2, target: 3, weight: 1 },
    { source: 0, target: 0, weight: 0 },
  ],
};

const directedWithDangling: GraphData<string> = {
  directed: true,
  nodes: ["a", "b", "dangling"].map((id) => ({ id })),
  edges: [
    { source: "a", target: "b", weight: 2 },
    { source: "b", target: "a", weight: 1 },
  ],
};

describe("community edge cases and partition contracts", () => {
  it("defines empty, singleton, edgeless, loop, and directed partition quality", () => {
    expect(validatePartition(emptyUndirected, [])).toBe(true);
    expect(modularity(emptyUndirected, [])).toBe(0);
    expect(partitionQuality(emptyUndirected, [])).toEqual({ coverage: 0, performance: 1 });
    expect(mapEquation(emptyUndirected, [])).toBe(0);

    expect(modularity(singleton, [["only"]])).toBe(0);
    expect(mapEquation(singleton, [["only"]])).toBe(0);
    expect(partitionQuality(singleton, [["only"]])).toEqual({ coverage: 0, performance: 1 });

    const loop: GraphData<number> = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [{ source: 0, target: 0, weight: 2 }],
    };
    expect(modularity(loop, [[0], [1]])).toBe(0);
    expect(partitionQuality(loop, [[0], [1]])).toEqual({ coverage: 0, performance: 1 });

    const directedLoop: GraphData<number> = {
      directed: true,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [
        { source: 0, target: 0 },
        { source: 0, target: 1 },
      ],
    };
    expect(partitionQuality(directedLoop, [[0], [1]])).toEqual({ coverage: 0, performance: 0.5 });
  });

  it("rejects every malformed result-style partition shape", () => {
    expect(() => validatePartition(path, { nodes: [0, 1], membership: [0] })).toThrow(/identical lengths/i);
    expect(() => validatePartition(path, { nodes: [0, 1, 2, 99], membership: [0, 0, 1, 1] })).toThrow(/unknown node/i);
    expect(() => validatePartition(path, { nodes: [0, 1, 1, 3], membership: [0, 0, 1, 1] })).toThrow(/more than once/i);
    expect(() => validatePartition(path, { nodes: [0, 1, 2], membership: [0, 0, 1] })).toThrow(/omits node/i);
    expect(() => validatePartition(path, { nodes: [0, 1, 2, 3], membership: [0, 0.5, 1, 1] })).toThrow(
      /non-negative integers/i,
    );
  });

  it("validates shared numeric options instead of silently coercing them", () => {
    expect(() => modularity(path, [[0, 1], [2, 3]], { resolution: 0 })).toThrow(/resolution/i);
    expect(() => modularity(path, [[0, 1], [2, 3]], { resolution: Number.NaN })).toThrow(/resolution/i);

    expect(() => greedyModularity(path, { tolerance: -1 })).toThrow(/tolerance/i);
    expect(() => greedyModularity(path, { targetCommunities: -1 })).toThrow(/targetCommunities/i);
    expect(() => greedyModularity(path, { targetCommunities: 1.5 })).toThrow(/targetCommunities/i);
    expect(() => greedyModularity(path, { targetCommunities: 5 })).toThrow(/targetCommunities/i);

    expect(() => louvain(path, { threshold: -1 })).toThrow(/threshold/i);
    expect(() => louvain(path, { maxLevels: 0 })).toThrow(/maxLevels/i);
    expect(() => louvain(path, { maxPasses: 0 })).toThrow(/maxPasses/i);

    expect(() => leiden(path, { beta: 0 })).toThrow(/beta/i);
    expect(() => leiden(path, { tolerance: -1 })).toThrow(/tolerance/i);
    expect(() => leiden(path, { iterations: 0 })).toThrow(/iterations/i);
    expect(() => leiden(path, { maxPasses: 0 })).toThrow(/maxPasses/i);
    expect(() => leiden({ ...path, directed: true })).toThrow(/undirected/i);

    expect(() => infomap(path, { tolerance: 0 })).toThrow(/tolerance/i);
    expect(() => infomap(path, { trials: 0 })).toThrow(/trials/i);
    expect(() => infomap(path, { maxPasses: 0 })).toThrow(/maxPasses/i);
    expect(() => girvanNewman(path, { levels: 0 })).toThrow(/levels/i);
    expect(() => girvanNewman(path, { maxCommunities: 0 })).toThrow(/maxCommunities/i);
    expect(() => labelPropagation(path, { maxIterations: -1 })).toThrow(/maxIterations/i);
    expect(() => labelPropagation(path, { maxIterations: 1.5 })).toThrow(/maxIterations/i);
    expect(() => kCliqueCommunities(path, 3, { maxCliques: 0 })).toThrow(/maxCliques/i);
  });
});

describe("community heuristic control flow", () => {
  it("covers greedy no-merge and forced all-pairs modes with progress", () => {
    expect(greedyModularity(edgelessPair).communities).toEqual([[0], [1]]);

    const progress: Array<readonly [number, number]> = [];
    const forced = greedyModularity(edgelessPair, {
      targetCommunities: 1,
      onProgress: (completed, total) => progress.push([completed, total]),
    });
    expect(forced.communities).toEqual([[0, 1]]);
    expect(forced.meta.iterations).toBe(1);
    expect(progress).toEqual([[1, 1]]);
  });

  it("runs directed Louvain, custom RNG, aliases, and terminal one-block cases", () => {
    let draws = 0;
    const result = louvain(directedWithDangling, {
      rng: () => {
        draws += 1;
        return 0.25;
      },
      threshold: 0,
      tolerance: 0,
      maxLevels: 4,
      maxPasses: 4,
    });
    expect(result.meta.directed).toBe(true);
    expect(result.meta.seed).toBeUndefined();
    expect(draws).toBeGreaterThan(0);
    expect(result.quality.modularity).toBeCloseTo(modularity(directedWithDangling, result), 12);

    const oneBlock = louvain(
      {
        directed: false,
        nodes: [{ id: 0 }, { id: 1 }],
        edges: [{ source: 0, target: 1 }],
      },
      { seed: 3, maxLevels: 3 },
    );
    expect(oneBlock.communities).toEqual([[0, 1]]);
    expect(oneBlock.meta.converged).toBe(true);
    expect(louvain(singleton).communities).toEqual([["only"]]);
  });

  it("runs Leiden CPM, equal aliases, progress, custom RNG, and connected output", () => {
    const graph: GraphData<number> = {
      directed: false,
      nodes: [0, 1, 2, 3, 4].map((id) => ({ id })),
      edges: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 2, target: 3 },
        { source: 3, target: 4 },
        { source: 4, target: 0 },
        { source: 0, target: 2 },
      ],
    };
    let draws = 0;
    const progress: number[] = [];
    const result = leiden(graph, {
      objective: "cpm",
      resolution: 0.35,
      beta: 0.05,
      theta: 0.05,
      iterations: 4,
      maxLevels: 4,
      maxPasses: 5,
      rng: () => {
        draws += 1;
        return 0.2;
      },
      onProgress: (completed) => progress.push(completed),
    });
    expect(result.quality.cpm).toBeTypeOf("number");
    expect(result.meta.seed).toBeUndefined();
    expect(result.meta.iterations).toBeGreaterThan(0);
    expect(draws).toBeGreaterThan(0);
    expect(progress.length).toBeGreaterThan(0);
    expect(result.communities.flat()).toEqual(expect.arrayContaining([0, 1, 2, 3, 4]));
  });

  it("checks cancellation at each newly covered public heuristic boundary", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => greedyModularity(path, { signal: controller.signal })).toThrow();
    expect(() => leiden(path, { signal: controller.signal })).toThrow();
    expect(() => infomap(path, { signal: controller.signal })).toThrow();
    expect(() => kCliqueCommunities(path, 2, { signal: controller.signal })).toThrow();
  });
});

describe("Infomap flow and map-equation boundary cases", () => {
  it("handles directed dangling redistribution, teleportation, and zero-exit modules", () => {
    const partition = [["a", "b"], ["dangling"]];
    const withoutTeleportation = mapEquation(directedWithDangling, partition, { teleportation: 0 });
    const withTeleportation = mapEquation(directedWithDangling, partition, { teleportation: 0.2 });
    expect(withoutTeleportation).toBeGreaterThanOrEqual(0);
    expect(withTeleportation).toBeGreaterThanOrEqual(0);

    const result = infomap(directedWithDangling, {
      seed: "dangling",
      teleportation: 0.2,
      trials: 2,
      maxPasses: 1,
    });
    expect(result.quality.codeLength).toBeCloseTo(mapEquation(directedWithDangling, result, { teleportation: 0.2 }), 12);
    expect(result.meta.warnings.join(" ")).toMatch(/dangling-node redistribution/i);
  });

  it("covers empty directed flow and rejects invalid or non-convergent flow", () => {
    const emptyDirected: GraphData = { directed: true, nodes: [], edges: [] };
    expect(mapEquation(emptyDirected, [], { teleportation: 0.3 })).toBe(0);
    expect(infomap(emptyUndirected, { trials: 1 }).quality.codeLength).toBe(0);

    for (const teleportation of [-0.1, 1, Number.NaN]) {
      expect(() => mapEquation(directedWithDangling, [["a", "b", "dangling"]], { teleportation })).toThrow(/teleportation/i);
    }
    expect(() => mapEquation(directedWithDangling, [["a", "b", "dangling"]], { maxIterations: 0 })).toThrow(/maxIterations/i);

    const slow: GraphData<number> = {
      directed: true,
      nodes: [0, 1, 2].map((id) => ({ id })),
      edges: [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
      ],
    };
    expect(() => mapEquation(slow, [[0, 1, 2]], { tolerance: 1e-30, maxIterations: 1 })).toThrow(/did not converge/i);
  });

  it("reports undirected defaults and a custom-RNG run independently", () => {
    const defaultRun = infomap(path, { trials: 1, maxPasses: 1 });
    expect(defaultRun.meta.seed).toBe(0);
    expect(defaultRun.meta.warnings.join(" ")).toMatch(/undirected flow/i);

    let draws = 0;
    const custom = infomap(path, {
      trials: 2,
      rng: () => {
        draws += 1;
        return 0.75;
      },
    });
    expect(custom.meta.seed).toBeUndefined();
    expect(draws).toBe(2);
  });
});

describe("Girvan-Newman, label propagation, and clique bounds", () => {
  it("uses weighted shortest paths, tie handling, active-edge skipping, and progress", () => {
    const progress: number[] = [];
    const result = girvanNewman(weightedDiamond, {
      levels: 2,
      maxCommunities: 4,
      useWeights: true,
      onProgress: (completed) => progress.push(completed),
    });
    expect(result.levels.length).toBeGreaterThan(0);
    expect(result.meta).toMatchObject({ weighted: true, valueSemantics: "distance" });
    expect(result.levels[0]!.meta.valueSemantics).toBe("distance");
    expect(progress).toEqual(result.levels.map((_level, index) => index + 1));
  });

  it("handles disconnected and edgeless hierarchies and rejects invalid distances", () => {
    expect(girvanNewman(edgelessPair, { maxCommunities: 2 }).levels).toEqual([]);
    expect(girvanNewman(path, { maxCommunities: 3 }).levels.at(-1)?.communities.length).toBeGreaterThanOrEqual(3);

    const zeroDistance: GraphData<number> = {
      directed: false,
      nodes: [{ id: 0 }, { id: 1 }],
      edges: [{ source: 0, target: 1, weight: 0 }],
    };
    expect(() => girvanNewman(zeroDistance, { levels: 1, useWeights: true })).toThrow(/strictly positive/i);
    expect(() => girvanNewman({ ...path, directed: true }, { levels: 1 })).toThrow(/undirected/i);
  });

  it("covers label isolates, directed warnings, no-iteration partial state, progress, and RNG", () => {
    let draws = 0;
    const progress: number[] = [];
    const directed = labelPropagation(directedWithDangling, {
      maxIterations: 3,
      rng: () => {
        draws += 1;
        return 0;
      },
      onProgress: (completed) => progress.push(completed),
    });
    expect(directed.meta.seed).toBeUndefined();
    expect(directed.meta.warnings.join(" ")).toMatch(/weak graph/i);
    expect(directed.communities.flat()).toContain("dangling");
    expect(draws).toBeGreaterThan(0);
    expect(progress.length).toBeGreaterThan(0);

    const stopped = labelPropagation(path, { maxIterations: 0 });
    expect(stopped.meta).toMatchObject({ iterations: 0, converged: false });
    expect(labelPropagation(emptyUndirected).meta.converged).toBe(true);
  });

  it("returns an empty clique cover when no k-clique exists and ignores loops", () => {
    const graph: GraphData<number> = {
      directed: false,
      nodes: [0, 1, 2].map((id) => ({ id })),
      edges: [
        { source: 0, target: 0 },
        { source: 0, target: 1 },
        { source: 1, target: 2 },
      ],
    };
    const progress: number[] = [];
    const cover = kCliqueCommunities(graph, 3, { onProgress: (completed) => progress.push(completed) });
    expect(cover.communities).toEqual([]);
    expect(cover.memberships).toEqual([[], [], []]);
    expect(progress.length).toBeGreaterThan(0);
    expect(kCliqueCommunities(emptyUndirected, 2).communities).toEqual([]);
  });
});
