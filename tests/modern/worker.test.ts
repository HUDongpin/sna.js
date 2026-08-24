import { describe, expect, it } from "vitest";

import type { GraphData, NodeScoreResult, PairScoreResult, PartitionResult } from "../../src/modern/types";
import {
  createSnaWorker,
  executeSnaTask,
  type SnaTaskMap,
  type SnaWorkerFunction,
  type SnaWorkerRequest,
} from "../../src/worker/index";

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

function assertCloneSafeWorkerOptionTypes(): void {
  const seeded: SnaTaskMap["louvain"]["options"] = { seed: "clone-safe" };
  void seeded;
  // @ts-expect-error rng callbacks cannot be structured-cloned into a Worker.
  const louvainRng: SnaTaskMap["louvain"]["options"] = { rng: () => 0.5 };
  // @ts-expect-error rng callbacks cannot be structured-cloned into a Worker.
  const leidenRng: SnaTaskMap["leiden"]["options"] = { rng: () => 0.5 };
  // @ts-expect-error rng callbacks cannot be structured-cloned into a Worker.
  const infomapRng: SnaTaskMap["infomap"]["options"] = { rng: () => 0.5 };
  void louvainRng;
  void leidenRng;
  void infomapRng;

  // The compatibility overload remains available for every pre-0.5 task.
  const client = createSnaWorker(() => null as never);
  const legacyDegree: Promise<number[]> = client.run<number[]>("degree", { input: [] }, { mode: "graph" });
  void legacyDegree;
  // @ts-expect-error modern task overloads must not fall through to the legacy generic overload.
  client.run("louvain", { input: cycle }, { rng: () => 0.5 });
  // @ts-expect-error executeSnaTask likewise accepts only clone-safe modern options.
  executeSnaTask({ fn: "infomap", payload: { input: cycle }, options: { rng: () => 0.5 } });
}

void assertCloneSafeWorkerOptionTypes;

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

  it.each(["louvain", "leiden", "infomap"] as const)("rejects non-clone-safe %s rng options before execution", (fn) => {
    const executeUnchecked = executeSnaTask as unknown as (
      request: Pick<SnaWorkerRequest, "fn" | "payload" | "options">,
    ) => unknown;
    expect(() => executeUnchecked({ fn, payload: { input: cycle }, options: { rng: () => 0.5 } })).toThrow(
      /do not accept rng callbacks.*structured-clone-safe seed/i,
    );
  });

  it("rejects other function-valued random-community options and invalid seeds", () => {
    const executeUnchecked = executeSnaTask as unknown as (
      request: Pick<SnaWorkerRequest, "fn" | "payload" | "options">,
    ) => unknown;
    expect(() => executeUnchecked({
      fn: "louvain",
      payload: { input: cycle },
      options: { customCallback: () => 0.5 },
    })).toThrow(/customCallback.*structured-clone-safe/i);
    expect(() => executeUnchecked({
      fn: "leiden",
      payload: { input: cycle },
      options: { seed: { value: 17 } },
    })).toThrow(/seed must be a finite number or string/i);
    expect(() => executeUnchecked({
      fn: "infomap",
      payload: { input: cycle },
      options: { seed: Number.POSITIVE_INFINITY },
    })).toThrow(/seed must be a finite number or string/i);
  });

  it("rejects non-clone-safe random-community options before posting to a Worker", () => {
    let spawned = false;
    const client = createSnaWorker(() => {
      spawned = true;
      throw new Error("Worker factory must not run for invalid options");
    });
    const runUnchecked = client.run.bind(client) as unknown as (
      fn: SnaWorkerFunction,
      payload: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;

    expect(() => runUnchecked("louvain", { input: cycle }, { rng: () => 0.5 })).toThrow(/structured-clone-safe seed/i);
    expect(spawned).toBe(false);
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
