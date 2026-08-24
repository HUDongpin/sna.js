import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { harmonicCentrality, hits, pageRank } from "../../src/centrality";
import {
  infomap,
  leiden,
  louvain,
  mapEquation,
  modularity,
  partitionQuality,
  validatePartition,
} from "../../src/community";
import type { GraphData } from "../../src/modern/types";
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
  type DegreeMode,
} from "../../src/statistics";

type NullableNumber = number | null;

interface VectorOracle {
  readonly values: readonly NullableNumber[];
}

interface PageRankOracle extends VectorOracle {
  readonly damping: number;
  readonly weighted: boolean;
  readonly personalization?: readonly number[];
  readonly dangling?: readonly number[];
  readonly igraphValues?: readonly number[];
  readonly igraphCompatibility?: string;
}

interface HitsOracle {
  readonly weighted: boolean;
  readonly hubs: readonly number[];
  readonly authorities: readonly number[];
  readonly igraphHubs: readonly number[];
  readonly igraphAuthorities: readonly number[];
}

interface HarmonicOracle extends VectorOracle {
  readonly direction: "out" | "in";
  readonly weighted: boolean;
}

interface MixingOracle {
  readonly degreeAssortativity: {
    readonly source: DegreeMode;
    readonly target: DegreeMode;
    readonly weighted: boolean;
    readonly value: NullableNumber;
  };
  readonly reverseDegreeAssortativity: {
    readonly source: DegreeMode;
    readonly target: DegreeMode;
    readonly weighted: boolean;
    readonly value: NullableNumber;
  } | null;
  readonly degreeMixing: {
    readonly labels: readonly number[];
    readonly values: readonly (readonly number[])[];
  };
  readonly categoricalAssortativity: NullableNumber;
  readonly numericAssortativity: NullableNumber;
  readonly attributeMixing: {
    readonly attribute: string;
    readonly labels: readonly (string | number)[];
    readonly values: readonly (readonly number[])[];
  };
}

interface StatisticsOracle {
  readonly triangles?: readonly number[];
  readonly clustering: {
    readonly unweighted: readonly number[];
    readonly weighted: readonly number[];
  };
  readonly averageClustering?: {
    readonly unweighted: number;
    readonly weighted: number;
    readonly unweightedNonZero: NullableNumber;
  };
  readonly mixing?: MixingOracle;
  readonly structuralHoles?: {
    readonly constraint: readonly NullableNumber[];
    readonly effectiveSize: readonly NullableNumber[];
    readonly weightedConstraint: readonly NullableNumber[];
    readonly weightedEffectiveSize: readonly NullableNumber[];
  };
}

interface LinkPredictionOracle {
  readonly pairs: readonly PredictionPair[];
  readonly commonNeighbors: readonly number[];
  readonly jaccardCoefficient: readonly number[];
  readonly adamicAdar: readonly number[];
  readonly resourceAllocation: readonly number[];
  readonly preferentialAttachment: readonly number[];
}

interface PartitionOracle {
  readonly communities: ReadonlyArray<ReadonlyArray<number>>;
  readonly modularity: number;
  readonly igraphModularity?: number;
  readonly igraphCompatibility?: string;
  readonly quality?: {
    readonly coverage: number;
    readonly performance: number;
  };
}

interface OracleCase {
  readonly name: string;
  readonly graph: GraphData<number>;
  readonly oracle: {
    readonly pageRank: PageRankOracle;
    readonly personalizedPageRank?: PageRankOracle;
    readonly hits?: HitsOracle;
    readonly harmonicCentrality: HarmonicOracle;
    readonly statistics: StatisticsOracle;
    readonly linkPrediction?: LinkPredictionOracle;
    readonly partition?: PartitionOracle;
  };
}

interface OracleFixture {
  readonly schemaVersion: number;
  readonly provenance: {
    readonly generator: string;
    readonly requirements: string;
    readonly python: string;
    readonly implementation: string;
    readonly libraries: Readonly<Record<string, string>>;
    readonly seed: number;
    readonly corpusSha256: string;
    readonly primaryOracle: string;
    readonly secondaryOracle: string;
    readonly references: readonly string[];
    readonly notes: readonly string[];
  };
  readonly cases: readonly OracleCase[];
}

const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/modern/oracles.json", import.meta.url), "utf8"),
) as OracleFixture;

function expectNumber(actual: NullableNumber | undefined, expected: NullableNumber, digits = 8): void {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).toBeTypeOf("number");
  expect(actual as number).toBeCloseTo(expected, digits);
}

function expectVector(
  actual: readonly NullableNumber[],
  expected: readonly NullableNumber[],
  digits = 8,
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => expectNumber(actual[index], value, digits));
}

function expectMatrix(
  actual: readonly (readonly number[])[],
  expected: readonly (readonly number[])[],
  digits = 8,
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((row, index) => expectVector(actual[index] ?? [], row, digits));
}

function predictionScores(result: ReturnType<typeof commonNeighbors>): number[] {
  return result.pairs.map((pair) => pair.score);
}

function fixtureCase(name: string): OracleCase {
  const result = fixture.cases.find((entry) => entry.name === name);
  if (result === undefined) throw new Error(`missing oracle case: ${name}`);
  return result;
}

describe("modern external-oracle fixture provenance", () => {
  it("pins exact external libraries and the required fixed graph corpus", () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.provenance).toMatchObject({
      generator: "scripts/generate-modern-oracles.py",
      requirements: "scripts/modern-oracle-requirements.txt",
      python: "3.13",
      implementation: "CPython",
      libraries: {
        networkx: "3.6.1",
        igraph: "1.0.0",
        numpy: "2.5.2",
        scipy: "1.18.1",
      },
      primaryOracle: "NetworkX 3.6.1",
      secondaryOracle: "python-igraph 1.0.0",
    });
    expect(fixture.provenance.corpusSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fixture.provenance.references).toHaveLength(3);

    const names = new Set(fixture.cases.map((entry) => entry.name));
    [
      "empty",
      "singleton",
      "path-5",
      "star-6",
      "cycle-6",
      "complete-5",
      "disconnected",
      "directed-scc-wcc",
      "weighted",
      "loops",
      "bipartite-3-4",
      "planted-partition-3x5",
      "zachary-karate",
    ].forEach((name) => expect(names.has(name), name).toBe(true));

    const loops = fixtureCase("loops");
    expect(loops.oracle.pageRank.igraphCompatibility).toMatch(/self-loop transition conventions/);
    expect(loops.oracle.partition?.igraphCompatibility).toMatch(/self-loop degree conventions/);
  });
});

describe("modern centrality against NetworkX 3.6.1 and igraph 1.0.0", () => {
  for (const entry of fixture.cases) {
    it(`matches PageRank and harmonic centrality on ${entry.name}`, () => {
      const pageRankOracle = entry.oracle.pageRank;
      const rank = pageRank(entry.graph, {
        damping: pageRankOracle.damping,
        weighted: pageRankOracle.weighted,
        tolerance: 1e-12,
        maxIterations: 2_000,
      });
      expect(rank.nodes).toEqual(entry.graph.nodes.map((node) => node.id));
      expectVector(rank.values, pageRankOracle.values, 8);
      expect(rank.values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
        entry.graph.nodes.length === 0 ? 0 : 1,
        10,
      );
      if (pageRankOracle.igraphValues !== undefined) {
        expectVector(rank.values, pageRankOracle.igraphValues, 7);
      }

      const harmonicOracle = entry.oracle.harmonicCentrality;
      const harmonic = harmonicCentrality(entry.graph, {
        direction: harmonicOracle.direction,
        weighted: harmonicOracle.weighted,
      });
      expectVector(harmonic.values, harmonicOracle.values, 9);
    });
  }

  it("matches non-uniform personalization and dangling redistribution", () => {
    const entry = fixtureCase("directed-scc-wcc");
    const oracle = entry.oracle.personalizedPageRank;
    if (oracle === undefined) throw new Error("personalized PageRank oracle missing");
    const result = pageRank(entry.graph, {
      damping: oracle.damping,
      weighted: oracle.weighted,
      personalization: oracle.personalization,
      dangling: oracle.dangling,
      tolerance: 1e-12,
      maxIterations: 2_000,
    });
    expectVector(result.values, oracle.values, 8);
  });

  it("matches unique-dominant-vector HITS in both external libraries", () => {
    const entry = fixtureCase("directed-hits");
    const oracle = entry.oracle.hits;
    if (oracle === undefined) throw new Error("HITS oracle missing");
    const result = hits(entry.graph, {
      weighted: oracle.weighted,
      tolerance: 1e-12,
      maxIterations: 2_000,
    });
    expectVector(result.hubs, oracle.hubs, 7);
    expectVector(result.authorities, oracle.authorities, 7);
    expectVector(result.hubs, oracle.igraphHubs, 7);
    expectVector(result.authorities, oracle.igraphAuthorities, 7);
    expect(Math.hypot(...result.hubs)).toBeCloseTo(1, 10);
    expect(Math.hypot(...result.authorities)).toBeCloseTo(1, 10);
  });
});

describe("modern statistics against NetworkX 3.6.1", () => {
  for (const entry of fixture.cases) {
    it(`matches clustering, mixing, and structural-hole oracles on ${entry.name}`, () => {
      const oracle = entry.oracle.statistics;
      if (oracle.triangles !== undefined) {
        expectVector(triangles(entry.graph).values, oracle.triangles, 10);
      }
      expectVector(clusteringCoefficient(entry.graph).values, oracle.clustering.unweighted, 9);
      expectVector(
        clusteringCoefficient(entry.graph, { weighted: true }).values,
        oracle.clustering.weighted,
        8,
      );

      if (oracle.averageClustering !== undefined) {
        expectNumber(averageClustering(entry.graph).value, oracle.averageClustering.unweighted, 9);
        expectNumber(
          averageClustering(entry.graph, { weighted: true }).value,
          oracle.averageClustering.weighted,
          8,
        );
        expectNumber(
          averageClustering(entry.graph, { countZeros: false }).value,
          oracle.averageClustering.unweightedNonZero,
          9,
        );
      }

      const mixing = oracle.mixing;
      if (mixing !== undefined) {
        const degreeOptions = mixing.degreeAssortativity;
        expectNumber(
          degreeAssortativity(entry.graph, degreeOptions).value,
          degreeOptions.value,
          8,
        );
        if (mixing.reverseDegreeAssortativity !== null) {
          expectNumber(
            degreeAssortativity(entry.graph, mixing.reverseDegreeAssortativity).value,
            mixing.reverseDegreeAssortativity.value,
            8,
          );
        }

        const degreeMatrix = degreeMixingMatrix(entry.graph, degreeOptions);
        expect(degreeMatrix.labels).toEqual(mixing.degreeMixing.labels);
        expectMatrix(degreeMatrix.values, mixing.degreeMixing.values, 10);

        expectNumber(
          categoricalAssortativity(entry.graph, "group").value,
          mixing.categoricalAssortativity,
          8,
        );
        expectNumber(
          numericAssortativity(entry.graph, "score").value,
          mixing.numericAssortativity,
          8,
        );
        const attributeMatrix = attributeMixingMatrix(
          entry.graph,
          mixing.attributeMixing.attribute,
        );
        expect(attributeMatrix.labels).toEqual(mixing.attributeMixing.labels);
        expectMatrix(attributeMatrix.values, mixing.attributeMixing.values, 10);
      }

      const structural = oracle.structuralHoles;
      if (structural !== undefined) {
        expectVector(constraint(entry.graph).values, structural.constraint, 8);
        expectVector(effectiveSize(entry.graph).values, structural.effectiveSize, 8);
        expectVector(
          constraint(entry.graph, { weighted: true }).values,
          structural.weightedConstraint,
          8,
        );
        expectVector(
          effectiveSize(entry.graph, { weighted: true }).values,
          structural.weightedEffectiveSize,
          8,
        );
      }
    });
  }
});

describe("modern link prediction against NetworkX 3.6.1", () => {
  for (const entry of fixture.cases.filter((candidate) => candidate.oracle.linkPrediction !== undefined)) {
    it(`matches all explicit-pair predictors on ${entry.name}`, () => {
      const oracle = entry.oracle.linkPrediction;
      if (oracle === undefined) throw new Error("link prediction oracle missing");
      const pairs = oracle.pairs;
      expectVector(predictionScores(commonNeighbors(entry.graph, pairs)), oracle.commonNeighbors, 10);
      expectVector(
        predictionScores(jaccardCoefficient(entry.graph, pairs)),
        oracle.jaccardCoefficient,
        10,
      );
      expectVector(predictionScores(adamicAdar(entry.graph, pairs)), oracle.adamicAdar, 9);
      expectVector(
        predictionScores(resourceAllocation(entry.graph, pairs)),
        oracle.resourceAllocation,
        10,
      );
      expectVector(
        predictionScores(preferentialAttachment(entry.graph, pairs)),
        oracle.preferentialAttachment,
        10,
      );
    });
  }
});

describe("partition quality against external oracles", () => {
  for (const entry of fixture.cases.filter((candidate) => candidate.oracle.partition !== undefined)) {
    it(`matches modularity and partition quality on ${entry.name}`, () => {
      const oracle = entry.oracle.partition;
      if (oracle === undefined) throw new Error("partition oracle missing");
      expect(validatePartition(entry.graph, oracle.communities)).toBe(true);
      const actualModularity = modularity(entry.graph, oracle.communities);
      expect(actualModularity).toBeCloseTo(oracle.modularity, 9);
      if (oracle.igraphModularity !== undefined) {
        expect(actualModularity).toBeCloseTo(oracle.igraphModularity, 8);
      }
      if (oracle.quality !== undefined) {
        const actualQuality = partitionQuality(entry.graph, oracle.communities);
        expect(actualQuality.coverage).toBeCloseTo(oracle.quality.coverage, 10);
        expect(actualQuality.performance).toBeCloseTo(oracle.quality.performance, 10);
      }
    });
  }
});

function expectConnectedCommunities(graph: GraphData<number>, communities: readonly (readonly number[])[]): void {
  const neighbors = new Map<number, Set<number>>(
    graph.nodes.map((node) => [node.id, new Set<number>()]),
  );
  for (const edge of graph.edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  for (const community of communities) {
    if (community.length <= 1) continue;
    const members = new Set(community);
    const visited = new Set<number>();
    const queue = [community[0]!];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const neighbor of neighbors.get(node) ?? []) {
        if (members.has(neighbor) && !visited.has(neighbor)) queue.push(neighbor);
      }
    }
    expect(visited.size).toBe(community.length);
  }
}

describe("seeded community algorithms use invariant, not membership, oracle gates", () => {
  const karate = fixtureCase("zachary-karate").graph;
  const planted = fixtureCase("planted-partition-3x5").graph;
  const seed = fixture.provenance.seed;

  it("repeats Louvain exactly and recomputes its modularity", () => {
    const first = louvain(karate, { seed, maxLevels: 20, maxPasses: 50 });
    const second = louvain(karate, { seed, maxLevels: 20, maxPasses: 50 });
    expect(validatePartition(karate, first)).toBe(true);
    expect(second.membership).toEqual(first.membership);
    expect(first.quality.modularity).toBeTypeOf("number");
    expect(modularity(karate, first)).toBeCloseTo(first.quality.modularity!, 10);
  });

  it("repeats restricted Leiden, recomputes quality, and keeps communities connected", () => {
    const first = leiden(karate, { seed, maxLevels: 20, maxPasses: 50 });
    const second = leiden(karate, { seed, maxLevels: 20, maxPasses: 50 });
    expect(validatePartition(karate, first)).toBe(true);
    expect(second.membership).toEqual(first.membership);
    expect(first.quality.modularity).toBeTypeOf("number");
    expect(modularity(karate, first)).toBeCloseTo(first.quality.modularity!, 10);
    expectConnectedCommunities(karate, first.communities as readonly (readonly number[])[]);
  });

  it("repeats two-level Infomap and recomputes map-equation code length", () => {
    const first = infomap(karate, { seed, maxPasses: 50, maxIterations: 2_000 });
    const second = infomap(karate, { seed, maxPasses: 50, maxIterations: 2_000 });
    expect(validatePartition(karate, first)).toBe(true);
    expect(second.membership).toEqual(first.membership);
    expect(first.quality.codeLength).toBeTypeOf("number");
    expect(mapEquation(karate, first)).toBeCloseTo(first.quality.codeLength!, 10);
  });

  it("keeps every randomized partition invariant on the planted-partition corpus", () => {
    const louvainResult = louvain(planted, { seed, maxLevels: 20, maxPasses: 50 });
    const leidenResult = leiden(planted, { seed, maxLevels: 20, maxPasses: 50 });
    const infomapResult = infomap(planted, { seed, trials: 3, maxPasses: 50, maxIterations: 2_000 });

    for (const result of [louvainResult, leidenResult, infomapResult]) {
      expect(validatePartition(planted, result)).toBe(true);
      expect(result.membership).toHaveLength(planted.nodes.length);
    }
    expect(louvain(planted, { seed, maxLevels: 20, maxPasses: 50 }).membership).toEqual(
      louvainResult.membership,
    );
    expect(leiden(planted, { seed, maxLevels: 20, maxPasses: 50 }).membership).toEqual(
      leidenResult.membership,
    );
    expect(infomap(planted, { seed, trials: 3, maxPasses: 50, maxIterations: 2_000 }).membership).toEqual(
      infomapResult.membership,
    );
    expect(modularity(planted, louvainResult)).toBeCloseTo(louvainResult.quality.modularity!, 10);
    expect(modularity(planted, leidenResult)).toBeCloseTo(leidenResult.quality.modularity!, 10);
    expectConnectedCommunities(planted, leidenResult.communities as readonly (readonly number[])[]);
    expect(mapEquation(planted, infomapResult)).toBeCloseTo(infomapResult.quality.codeLength!, 10);
  });
});
