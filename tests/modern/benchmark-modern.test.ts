import { describe, expect, it } from "vitest";

// @ts-expect-error The executable benchmark is intentionally plain ESM.
import { generateBenchmarkInput, parseBenchmarkArgs, partitionCommunitiesAreConnected } from "../../scripts/benchmark-modern.mjs";
import { makeSparseGraph } from "../../src/graph/index";

describe("modern sparse benchmark harness", () => {
  it("selects the exact default, quick, and large release profiles", () => {
    expect(parseBenchmarkArgs([])).toMatchObject({ profile: "default", nodes: 10_000, edges: 100_000 });
    expect(parseBenchmarkArgs(["--quick"])).toMatchObject({ profile: "quick", nodes: 80, edges: 320 });
    expect(parseBenchmarkArgs(["--large"])).toMatchObject({ profile: "large", nodes: 50_000, edges: 1_000_000 });
    expect(() => parseBenchmarkArgs(["--quick", "--large"])).toThrow(/mutually exclusive/i);
  });

  it("supports deterministic graph overrides and every per-stage timeout", () => {
    const parsed = parseBenchmarkArgs([
      "--quick",
      "--nodes=30",
      "--edges",
      "80",
      "--seed",
      "fixture-seed",
      "--timeout-ms=1000",
      "--timeout-input-ms=101",
      "--timeout-build-ms=102",
      "--timeout-pagerank-ms=103",
      "--timeout-assortativity-ms=104",
      "--timeout-louvain-ms=105",
      "--timeout-leiden-ms=106",
      "--timeout-infomap-ms=107",
      "--output",
      "receipt.json",
      "--pretty",
      "--verbose",
    ]);
    expect(parsed).toMatchObject({
      nodes: 30,
      edges: 80,
      seed: "fixture-seed",
      output: "receipt.json",
      pretty: true,
      verbose: true,
      stageTimeoutMs: {
        inputGeneration: 101,
        graphBuild: 102,
        pageRank: 103,
        degreeAssortativity: 104,
        louvain: 105,
        leiden: 106,
        infomap: 107,
      },
    });
  });

  it.each([
    [["--unknown"], /unknown option/i],
    [["--nodes"], /requires a value/i],
    [["--nodes=0"], /positive safe integer/i],
    [["--quick", "--nodes=10", "--edges=8"], /at least nodes - 1/i],
    [["--quick", "--nodes=4", "--edges=7"], /possible undirected simple edges/i],
    [["--timeout-ms=0"], /positive safe integer/i],
  ])("rejects invalid benchmark arguments %#", (args, message) => {
    expect(() => parseBenchmarkArgs(args)).toThrow(message);
  });

  it("generates an exact, connected, deterministic O(n + m) input without loops or parallel edges", () => {
    const configuration = { nodes: 40, edges: 120, seed: "deterministic-fixture" };
    const first = generateBenchmarkInput(configuration);
    const second = generateBenchmarkInput(configuration);
    const other = generateBenchmarkInput({ ...configuration, seed: "other-seed" });

    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(second.sha256).toBe(first.sha256);
    expect(second.input.edges).toEqual(first.input.edges);
    expect(other.sha256).not.toBe(first.sha256);
    expect(first.input).toMatchObject({ order: 40, indexBase: 0, directed: false });
    expect(first.input.edges).toHaveLength(120);

    const keys = new Set<string>();
    for (const [source, target, weight] of first.input.edges) {
      expect(source).toBeLessThan(target);
      expect(weight).toBeGreaterThanOrEqual(0.1);
      expect(weight).toBeLessThanOrEqual(1);
      expect(Number.isFinite(weight)).toBe(true);
      keys.add(`${source}:${target}`);
    }
    expect(keys.size).toBe(120);

    const graph = makeSparseGraph(first.input, { loops: false });
    const oneCommunity = {
      nodes: graph.nodeIds,
      membership: Array.from({ length: graph.order }, () => 0),
      communities: [graph.nodeIds],
    };
    expect(partitionCommunitiesAreConnected(graph, oneCommunity)).toBe(true);
    expect(graph.csr.indices).toHaveLength(240);
    expect("matrix" in first.input).toBe(false);
  });

  it("detects disconnected and malformed community memberships in linear sparse storage", () => {
    const graph = makeSparseGraph({ order: 4, directed: false, edges: [[0, 1], [1, 2], [2, 3]] }, { loops: false });
    expect(
      partitionCommunitiesAreConnected(graph, {
        nodes: graph.nodeIds,
        membership: [0, 1, 1, 0],
        communities: [[0, 3], [1, 2]],
      }),
    ).toBe(false);
    expect(
      partitionCommunitiesAreConnected(graph, {
        nodes: graph.nodeIds,
        membership: [0, 1, 1],
        communities: [[0], [1, 2]],
      }),
    ).toBe(false);
    expect(
      partitionCommunitiesAreConnected(graph, {
        nodes: graph.nodeIds,
        membership: [0, 1, 1, 3],
        communities: [[0], [1, 2], [3]],
      }),
    ).toBe(false);
  });
});
