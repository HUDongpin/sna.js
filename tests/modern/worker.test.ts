import { describe, expect, it } from "vitest";

import type { GraphData, NodeScoreResult, PairScoreResult, PartitionResult } from "../../src/modern/types";
import { executeSnaTask, type SnaTaskMap } from "../../src/worker/index";

const cycle: GraphData = {
  directed: false,
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
  edges: [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "c", target: "d" },
    { source: "d", target: "a" },
  ],
};

describe("typed modern Worker protocol", () => {
  it("runs PageRank and HITS with inferred structured-clone-safe results", () => {
    const pageRank: NodeScoreResult = executeSnaTask({ fn: "pageRank", payload: { input: cycle } });
    expect(pageRank.values).toHaveLength(4);
    expect(pageRank.values.reduce((total, value) => total + value, 0)).toBeCloseTo(1, 12);
    const hits = executeSnaTask({ fn: "hits", payload: { input: cycle } });
    expect(hits.hubs).toHaveLength(4);
    expect(() => JSON.stringify(hits)).not.toThrow();
  });

  it.each(["louvain", "leiden", "infomap"] as const)("runs seeded %s", (fn) => {
    const request: {
      fn: typeof fn;
      payload: SnaTaskMap[typeof fn]["payload"];
      options: SnaTaskMap[typeof fn]["options"];
    } = { fn, payload: { input: cycle }, options: { seed: 17 } };
    const result: PartitionResult = executeSnaTask(request);
    expect(result.membership).toHaveLength(4);
    expect(new Set(result.membership).size).toBe(result.communities.length);
  });

  it("bounds Girvan-Newman and batches explicit prediction pairs", () => {
    const hierarchy = executeSnaTask({
      fn: "girvanNewman",
      payload: { input: cycle },
      options: { maxCommunities: 2 },
    });
    expect(hierarchy.levels.at(-1)?.communities.length).toBeGreaterThanOrEqual(2);

    const scores: PairScoreResult = executeSnaTask({
      fn: "linkPrediction",
      payload: { input: cycle, pairs: [["a", "c"]], method: "jaccardCoefficient" },
    });
    expect(scores.pairs).toEqual([{ source: "a", target: "c", score: 1 }]);
  });

  it("forwards progress and cancellation to modern routines", () => {
    const progress: number[] = [];
    executeSnaTask(
      { fn: "pageRank", payload: { input: cycle } },
      { onProgress: (completed) => progress.push(completed) },
    );
    expect(progress.length).toBeGreaterThan(0);

    const controller = new AbortController();
    controller.abort();
    expect(() => executeSnaTask({ fn: "louvain", payload: { input: cycle } }, { signal: controller.signal })).toThrow(/abort/i);

    const pairProgress: Array<[number, number]> = [];
    executeSnaTask(
      {
        fn: "linkPrediction",
        payload: { input: cycle, pairs: [["a", "c"], ["b", "d"]], method: "commonNeighbors" },
      },
      { onProgress: (completed, total) => pairProgress.push([completed, total]) },
    );
    expect(pairProgress).toEqual([[1, 2], [2, 2]]);

    const duringBatch = new AbortController();
    expect(() => executeSnaTask(
      {
        fn: "linkPrediction",
        payload: { input: cycle, pairs: [["a", "c"], ["b", "d"]], method: "jaccardCoefficient" },
      },
      {
        signal: duringBatch.signal,
        onProgress: (completed) => {
          if (completed === 1) duringBatch.abort();
        },
      },
    )).toThrow(/abort/i);
  });
});
