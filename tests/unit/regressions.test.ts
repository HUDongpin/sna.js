// Regression tests for the correctness bugs found in the 2026-07 technical
// review (F-001, F-003, F-004, F-005, F-006, F-009). Expected values were
// produced by R sna 2.8 (R 4.4.2) unless noted otherwise.
import { describe, expect, it, vi } from "vitest";

import { betweenness, centralization, closeness, degree, evcent, gden, geodist, nties } from "../../src/index";

const closeTo = (actual: readonly number[], expected: readonly number[], digits = 10): void => {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i += 1) expect(actual[i]).toBeCloseTo(expected[i]!, digits);
};

describe("F-001 degree freeman", () => {
  const valued = [
    [0, 2],
    [3, 0],
  ];

  it("counts both endpoints for the default freeman cmode (valued, like R)", () => {
    expect(degree(valued, { mode: "digraph" })).toEqual([5, 5]);
  });

  it("matches R degree with ignoreEval", () => {
    expect(degree(valued, { mode: "digraph", ignoreEval: true })).toEqual([2, 2]);
  });

  it("keeps total as an alias of freeman", () => {
    expect(degree(valued, { mode: "digraph", cmode: "total" })).toEqual(degree(valued, { mode: "digraph", cmode: "freeman" }));
  });

  it("forces indegree for undirected data like R", () => {
    const asym = [
      [0, 1, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    expect(degree(asym, { mode: "graph" })).toEqual([0, 1, 0]);
  });

  it("counts self-loops once in freeman mode (nli.c degree_R)", () => {
    const loopy = [
      [2, 1],
      [0, 3],
    ];
    expect(degree(loopy, { mode: "digraph", diag: true })).toEqual([3, 4]);
  });

  it("normalizes centralization like R (out-star 0.5, symmetric star 1)", () => {
    const outStar = [
      [0, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const symStar = [
      [0, 1, 1, 1],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    ];
    expect(centralization(outStar, "degree", { mode: "digraph" })).toBeCloseTo(0.5, 10);
    expect(centralization(symStar, "degree", { mode: "digraph" })).toBeCloseTo(1, 10);
  });
});

describe("F-004 gden", () => {
  it("sums tie values by default like R", () => {
    expect(
      gden(
        [
          [0, 2],
          [0, 0],
        ],
        { mode: "digraph" },
      ),
    ).toBeCloseTo(1, 12);
  });

  it("removes missing ties from the denominator", () => {
    expect(
      gden(
        [
          [0, Number.NaN],
          [1, 0],
        ],
        { mode: "digraph" },
      ),
    ).toBeCloseTo(1, 12);
  });

  it("supports diag and valued loops like R", () => {
    expect(
      gden(
        [
          [2, 1],
          [0, 3],
        ],
        { mode: "digraph", diag: true },
      ),
    ).toBeCloseTo(1.5, 12);
  });

  it("returns NaN for n=0 and diagonal-free n=1", () => {
    expect(gden([], { mode: "digraph" })).toBeNaN();
    expect(gden([[0]], { mode: "digraph" })).toBeNaN();
    expect(gden([[1]], { mode: "digraph", diag: true })).toBe(1);
  });
});

describe("F-005 geodist", () => {
  const weighted = [
    [0, 2, 5],
    [2, 0, 2],
    [5, 2, 0],
  ];

  it("uses edge values when ignoreEval is false (R geodist_val_R)", () => {
    const result = geodist(weighted, { mode: "graph", ignoreEval: false });
    expect(result.distances[0]![2]).toBe(4);
    expect(result.counts[0]![2]).toBe(1);
  });

  it("keeps hop counting by default like R (ignore.eval=TRUE)", () => {
    const result = geodist(weighted, { mode: "graph" });
    expect(result.distances[0]![2]).toBe(1);
  });

  it("rejects negative edge values in weighted mode like R", () => {
    expect(() =>
      geodist(
        [
          [0, -1],
          [-1, 0],
        ],
        { mode: "graph", ignoreEval: false },
      ),
    ).toThrow(/negative/i);
  });
});

describe("F-006 graph-mode uses data as given", () => {
  const asym = [
    [0, 1, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  it("does not silently symmetrize matrix input (gden matches R 1/6)", () => {
    expect(gden(asym, { mode: "graph" })).toBeCloseTo(1 / 6, 12);
  });

  it("still supports explicit opt-in symmetrization", () => {
    expect(gden(asym, { mode: "graph", symmetrize: "weak" })).toBeCloseTo(2 / 6, 12);
  });

  it("symmetrizes for undirected closeness like R regardless of gmode", () => {
    const d5 = [
      [0, 1, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 0, 0, 1, 0],
      [0, 0, 0, 0, 1],
      [1, 1, 0, 0, 0],
    ];
    closeTo(closeness(d5, { mode: "graph", cmode: "undirected" }), [0.8, 0.8, 0.8, 2 / 3, 0.8]);
  });
});

describe("F-009 evcent convergence", () => {
  const p3 = [
    [0, 1, 0],
    [1, 0, 1],
    [0, 1, 0],
  ];

  it("falls back to the dense eigen solver when the power method oscillates", () => {
    closeTo(evcent(p3, { mode: "graph" }), [0.5, Math.SQRT1_2, 0.5], 8);
  });

  it("never reports numerical failure through console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      evcent(p3, { mode: "graph" });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("R-parity spot checks retained from the shipped build", () => {
  const p4 = [
    [0, 1, 0, 0],
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [0, 0, 1, 0],
  ];

  it("betweenness p4", () => {
    closeTo(betweenness(p4, { mode: "graph" }), [0, 2, 2, 0]);
  });

  it("closeness p4", () => {
    closeTo(closeness(p4, { mode: "graph" }), [0.5, 0.75, 0.75, 0.5]);
  });

  it("nties counts possible ties like R, not realized ties", () => {
    const g = [
      [0, 1, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    expect(nties(g, { mode: "digraph" })).toBe(6);
    expect(nties(g, { mode: "graph" })).toBe(3);
  });
});
