// Cancellation, progress, and resource-guard behavior (review F-012).
import { describe, expect, it } from "vitest";

import { betweenness, geodist, qaptest, setMaxGraphOrder, triadCensus } from "../../src/index";
import { executeSnaTask } from "../../src/worker/index";

const p4 = [
  [0, 1, 0, 0],
  [1, 0, 1, 0],
  [0, 1, 0, 1],
  [0, 0, 1, 0],
];

describe("AbortSignal support", () => {
  it("throws AbortError for a pre-aborted signal", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => betweenness(p4, { mode: "graph", signal: controller.signal })).toThrow(/abort/i);
    expect(() => geodist(p4, { signal: controller.signal })).toThrow(/abort/i);
    expect(() => triadCensus(p4, { mode: "digraph", signal: controller.signal })).toThrow(/abort/i);
  });

  it("stops a permutation test aborted from its progress callback", () => {
    const controller = new AbortController();
    let calls = 0;
    expect(() =>
      qaptest([p4, p4], (stack) => (stack as number[][][])[0]![0]![1]!, {
        reps: 500,
        seed: 7,
        signal: controller.signal,
        onProgress: (done) => {
          calls = done;
          if (done >= 10) controller.abort();
        },
      }),
    ).toThrow(/abort/i);
    expect(calls).toBeGreaterThanOrEqual(10);
    expect(calls).toBeLessThan(500);
  });

  it("preserves a custom abort reason", () => {
    const controller = new AbortController();
    controller.abort(new Error("deadline exceeded"));
    expect(() => geodist(p4, { signal: controller.signal })).toThrow("deadline exceeded");
  });
});

describe("progress callbacks", () => {
  it("reports one step per source vertex in geodist and betweenness", () => {
    const seen: Array<[number, number]> = [];
    geodist(p4, { onProgress: (done, total) => seen.push([done, total]) });
    expect(seen).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
    seen.length = 0;
    betweenness(p4, { mode: "graph", onProgress: (done, total) => seen.push([done, total]) });
    expect(seen.at(-1)).toEqual([4, 4]);
  });
});

describe("graph order guard", () => {
  it("rejects graphs above the configured maximum with an actionable error", () => {
    expect(() => geodist({ order: 100_000, edges: [[0, 1]] })).toThrow(/setMaxGraphOrder/);
  });

  it("can be raised deliberately", () => {
    const previous = setMaxGraphOrder(6000);
    try {
      expect(() => geodist({ order: 5500, edges: [[0, 1]] })).not.toThrow();
    } finally {
      setMaxGraphOrder(previous);
    }
  });
});

describe("worker protocol", () => {
  it("round-trips analysis tasks", () => {
    expect(executeSnaTask({ fn: "betweenness", payload: { input: p4 }, options: { mode: "graph" } })).toEqual([0, 2, 2, 0]);
    const census = executeSnaTask({ fn: "triadCensus", payload: { input: p4 }, options: { mode: "graph" } }) as Record<string, number>;
    expect(census["1"]).toBe(2);
  });

  it("supports named statistics for permutation tests", () => {
    const result = executeSnaTask({
      fn: "qaptest",
      payload: { input: [p4, p4], statistic: "gcor" },
      options: { reps: 25, seed: 42 },
    }) as { testValue: number; reps: number };
    expect(result.testValue).toBeCloseTo(1, 12);
    expect(result.reps).toBe(25);
  });

  it("rejects unknown functions and statistics with clear errors", () => {
    expect(() => executeSnaTask({ fn: "eval" as never, payload: {} })).toThrow(/unknown sna worker function/);
    expect(() => executeSnaTask({ fn: "qaptest", payload: { input: [p4, p4], statistic: "bogus" } })).toThrow(/unknown qaptest statistic/);
  });

  it("forwards progress and abort", () => {
    const seen: number[] = [];
    executeSnaTask({ fn: "geodist", payload: { input: p4 } }, { onProgress: (done) => seen.push(done) });
    expect(seen).toEqual([1, 2, 3, 4]);
    const controller = new AbortController();
    controller.abort();
    expect(() => executeSnaTask({ fn: "geodist", payload: { input: p4 } }, { signal: controller.signal })).toThrow(/abort/i);
  });
});

describe("heap-based weighted paths (invariant)", () => {
  it("matches BFS distances when all weights are 1", () => {
    // Deterministic sparse digraph, unit weights: Dijkstra == BFS.
    const n = 40;
    const matrix = Array.from({ length: n }, (_u, i) => Array.from({ length: n }, (_v, j) => ((i * 7919 + j * 104729) % 13 === 0 && i !== j ? 1 : 0)));
    const bfs = geodist(matrix, { mode: "digraph" }).distances;
    const dijkstra = geodist(matrix, { mode: "digraph", ignoreEval: false }).distances;
    expect(dijkstra).toEqual(bfs);
  });
});
