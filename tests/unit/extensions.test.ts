// Extensions beyond R sna 2.8: averagePathLength and labelPropagation.
// These were ported unchanged from the sna.js 0.0.x template (previously
// vendored by SENA), so the expectations below pin the exact numerical
// behavior downstream consumers already depend on. All values are computed
// by hand from the definitions.
import { describe, expect, it } from "vitest";

import { averagePathLength, labelPropagation } from "../../src/index";

describe("averagePathLength", () => {
  it("averages geodesics over ordered pairs on an undirected path", () => {
    // 0-1-2 path: ordered-pair distances 1,2,1,1,2,1 -> 8/6.
    const path = [
      [0, 1, 0],
      [1, 0, 1],
      [0, 1, 0],
    ];
    expect(averagePathLength(path, { mode: "graph", diag: false })).toBeCloseTo(4 / 3, 12);
  });

  it("respects direction for digraphs", () => {
    // 0->1->2 chain: finite ordered pairs (0,1)=1, (0,2)=2, (1,2)=1 -> 4/3.
    const chain = [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];
    expect(averagePathLength(chain, { mode: "digraph", diag: false })).toBeCloseTo(4 / 3, 12);
  });

  it("excludes unreachable pairs from numerator and denominator", () => {
    // Edge 0-1 plus isolate 2: only (0,1) and (1,0) are finite -> 1.
    const disconnected = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];
    expect(averagePathLength(disconnected, { mode: "graph" })).toBe(1);
  });

  it("counts unreachable pairs when infReplace maps them to a finite value", () => {
    const disconnected = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];
    // Pairs: (0,1)=(1,0)=1 and four replaced pairs at 5 -> 22/6.
    expect(averagePathLength(disconnected, { mode: "graph", infReplace: 5 })).toBeCloseTo(11 / 3, 12);
  });

  it("returns 0 when no finite pair exists", () => {
    expect(averagePathLength([[0]], { mode: "graph" })).toBe(0);
    expect(
      averagePathLength(
        [
          [0, 0],
          [0, 0],
        ],
        { mode: "graph" },
      ),
    ).toBe(0);
  });

  it("counts hops for valued ties by default, like geodist", () => {
    const valued = [
      [0, 2, 0],
      [2, 0, 3],
      [0, 3, 0],
    ];
    expect(averagePathLength(valued, { mode: "graph" })).toBeCloseTo(4 / 3, 12);
  });

  it("uses edge values as distances with ignoreEval false", () => {
    // Dijkstra: d(0,1)=2, d(1,2)=3, d(0,2)=min(10, 2+3)=5 -> (2+3+5)*2/6.
    const weighted = [
      [0, 2, 10],
      [2, 0, 3],
      [10, 3, 0],
    ];
    expect(averagePathLength(weighted, { mode: "graph", ignoreEval: false })).toBeCloseTo(10 / 3, 12);
  });

  it("rejects non-square matrices", () => {
    expect(() =>
      averagePathLength(
        [
          [0, 1, 0],
          [1, 0, 1],
        ],
        { mode: "graph" },
      ),
    ).toThrow(/square/i);
  });
});

describe("labelPropagation", () => {
  it("finds weighted communities across a weak bridge deterministically", () => {
    // Two weight-3 triangles {0,1,2} and {3,4,5} joined by a weight-1 bridge 2-3.
    const bridged = [
      [0, 3, 3, 0, 0, 0],
      [3, 0, 3, 0, 0, 0],
      [3, 3, 0, 1, 0, 0],
      [0, 0, 1, 0, 3, 3],
      [0, 0, 0, 3, 0, 3],
      [0, 0, 0, 3, 3, 0],
    ];
    const result = labelPropagation(bridged, { mode: "graph", diag: false });
    expect(result.method).toBe("label-propagation");
    expect(result.labels).toEqual([0, 0, 0, 1, 1, 1]);
    expect(result.sizes).toEqual([3, 3]);
    expect(result.count).toBe(2);
  });

  it("uses edge values by default and binary ties with ignoreEval", () => {
    // Weight-1 triangle {0,1,2} plus vertex 3 tied to 2 with weight 10:
    // the strong tie pulls 2 out of the triangle unless values are ignored.
    const pulled = [
      [0, 1, 1, 0],
      [1, 0, 1, 0],
      [1, 1, 0, 10],
      [0, 0, 10, 0],
    ];
    const weighted = labelPropagation(pulled, { mode: "graph" });
    expect(weighted.labels).toEqual([0, 0, 1, 1]);
    expect(weighted.count).toBe(2);

    const binary = labelPropagation(pulled, { mode: "graph", ignoreEval: true });
    expect(binary.labels).toEqual([0, 0, 0, 0]);
    expect(binary.count).toBe(1);
  });

  it("leaves isolates in their own communities", () => {
    const empty = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const result = labelPropagation(empty, { mode: "graph" });
    expect(result.labels).toEqual([0, 1, 2]);
    expect(result.sizes).toEqual([1, 1, 1]);
    expect(result.count).toBe(3);
  });

  it("symmetrizes tie strength for directed input", () => {
    // Single arc 0->1: the dyad still joins both vertices into one community.
    const arc = [
      [0, 1],
      [0, 0],
    ];
    const result = labelPropagation(arc, { mode: "digraph" });
    expect(result.labels).toEqual([0, 0]);
    expect(result.count).toBe(1);
  });

  it("stops at maxIterations", () => {
    const bridged = [
      [0, 3, 3, 0, 0, 0],
      [3, 0, 3, 0, 0, 0],
      [3, 3, 0, 1, 0, 0],
      [0, 0, 1, 0, 3, 3],
      [0, 0, 0, 3, 0, 3],
      [0, 0, 0, 3, 3, 0],
    ];
    const result = labelPropagation(bridged, { mode: "graph", maxIterations: 0 });
    expect(result.labels).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.count).toBe(6);
  });

  it("rejects non-square matrices", () => {
    expect(() =>
      labelPropagation(
        [
          [0, 1, 0],
          [1, 0, 1],
        ],
        { mode: "graph" },
      ),
    ).toThrow(/square/i);
  });
});
