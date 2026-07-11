// Malformed-input behavior: clear errors instead of silent wrong numbers.
import { describe, expect, it } from "vitest";

import { betweenness, degree, gden, geodist, triadCensus } from "../../src/index";

describe("malformed input", () => {
  it("rejects non-square matrices", () => {
    expect(() => degree([[0, 1, 0], [1, 0, 1]], { mode: "digraph" })).toThrow(/square/i);
    expect(() => gden([[0, 1], [1, 0, 1]] as number[][], { mode: "digraph" })).toThrow(/square/i);
  });

  it("rejects out-of-range node selections", () => {
    expect(() => degree([[0, 1], [1, 0]], { mode: "digraph", nodes: [5] })).toThrow(/outside/i);
    expect(() => degree([[0, 1], [1, 0]], { mode: "digraph", nodes: [-1] })).toThrow(/outside/i);
  });

  it("rejects unknown cmode values", () => {
    expect(() => degree([[0, 1], [1, 0]], { mode: "digraph", cmode: "bogus" as never })).toThrow(/cmode/i);
  });

  it("rejects negative weights in weighted shortest paths without hanging", () => {
    const negative = [
      [0, -2],
      [-2, 0],
    ];
    expect(() => geodist(negative, { mode: "graph", ignoreEval: false })).toThrow(/negative/i);
    expect(() => betweenness(negative, { mode: "graph", ignoreEval: false })).toThrow(/negative/i);
  });

  it("rejects bad edge-list vertices", () => {
    expect(() => degree({ edges: [[-1, 0]] }, { mode: "digraph" })).toThrow(/non-negative/i);
  });

  it("handles empty and single-vertex graphs without crashing", () => {
    expect(degree([], { mode: "digraph" })).toEqual([]);
    expect(degree([[0]], { mode: "digraph" })).toEqual([0]);
    expect(gden([], { mode: "digraph" })).toBeNaN();
    expect(triadCensus([[0]], { mode: "digraph" })["003"]).toBe(0);
  });

  it("treats NaN cells as missing rather than as ties", () => {
    const withMissing = [
      [0, Number.NaN],
      [1, 0],
    ];
    expect(degree(withMissing, { mode: "digraph", cmode: "outdegree", ignoreEval: true })).toEqual([0, 1]);
  });
});
