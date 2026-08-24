/**
 * Modern community-detection algorithms.
 *
 * The legacy R-parity labelPropagation implementation remains in
 * `src/algorithms/community.ts`.  This module works on the modern sparse graph
 * boundary and deliberately returns JSON-safe, node-id-preserving results.
 */
import { checkAborted } from "../core/cancellation";
import type { CancellationOptions } from "../core/cancellation";
import { createSeededRng, resolveRandomSource, shuffled } from "../core/random";
import type { RandomOptions, RandomSource } from "../core/random";
import { makeSparseGraph } from "../modern/graph";
import type {
  AnalysisMeta,
  CommunityCoverResult,
  ModernGraphInput,
  NodeId,
  PartitionResult,
  SparseGraph,
} from "../modern/types";

const DEFAULT_TOLERANCE = 1e-10;
const PATH_DISTANCE_RELATIVE_TOLERANCE = 16 * Number.EPSILON;

export type PartitionInput =
  | ReadonlyArray<ReadonlyArray<NodeId>>
  | Pick<PartitionResult, "nodes" | "membership">;

export interface ModularityOptions {
  readonly resolution?: number;
}

export interface PartitionQuality {
  readonly coverage: number;
  readonly performance: number;
}

export interface GreedyModularityOptions extends CancellationOptions, ModularityOptions {
  /** Force merges until this many communities remain. */
  readonly targetCommunities?: number;
  readonly tolerance?: number;
}

export interface LouvainOptions extends CancellationOptions, RandomOptions, ModularityOptions {
  /** Minimum accepted modularity gain. Defaults to 1e-10. */
  readonly threshold?: number;
  /** @deprecated Use `threshold`; retained as a v0.5 compatibility alias. */
  readonly tolerance?: number;
  readonly maxLevels?: number;
  readonly maxPasses?: number;
}

export type LeidenObjective = "modularity" | "cpm";

export interface LeidenOptions extends CancellationOptions, RandomOptions, ModularityOptions {
  readonly objective?: LeidenObjective;
  /** Randomness used for positive-gain refinement merges. Defaults to 0.01. */
  readonly beta?: number;
  /** Number of outer Leiden iterations. Defaults to 2. */
  readonly iterations?: number;
  /** @deprecated Use `beta`; retained as a v0.5 compatibility alias. */
  readonly theta?: number;
  readonly tolerance?: number;
  /** @deprecated Use `iterations`; retained as a v0.5 compatibility alias. */
  readonly maxLevels?: number;
  readonly maxPasses?: number;
}

export interface InfomapOptions extends CancellationOptions, RandomOptions {
  /** Recorded teleportation probability for directed graphs. Defaults to 0.15. */
  readonly teleportation?: number;
  /** Independent seeded optimization attempts. Defaults to 10. */
  readonly trials?: number;
  readonly tolerance?: number;
  readonly maxIterations?: number;
  readonly maxPasses?: number;
}

export interface GirvanNewmanOptions extends CancellationOptions {
  /** Stop once a yielded level has at least this many communities. */
  readonly maxCommunities?: number;
  /** Maximum number of split levels to yield. */
  readonly levels?: number;
  /** Treat positive edge weights as path distances. Defaults to false. */
  readonly useWeights?: boolean;
}

export interface HierarchicalCommunityResult {
  readonly levels: PartitionResult[];
  readonly meta: AnalysisMeta;
}

export interface LabelPropagationOptions extends CancellationOptions, RandomOptions {
  readonly maxIterations?: number;
}

export interface KCliqueOptions extends CancellationOptions {
  /** Guard against exponential maximal-clique enumeration. Defaults to 10,000. */
  readonly maxCliques?: number;
}

interface IndexedEdge {
  readonly source: number;
  readonly target: number;
  readonly weight: number;
}

interface WeightedView {
  readonly graph: SparseGraph;
  readonly nodeIds: readonly NodeId[];
  readonly order: number;
  readonly directed: boolean;
  readonly edges: readonly IndexedEdge[];
  /** Weak/undirected weighted neighborhood, excluding loops. */
  readonly neighbors: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly outgoing: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly incoming: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly weighted: boolean;
}

type IndexCommunities = number[][];
type QualityFunction = (communities: IndexCommunities) => number;

interface CanonicalIndexPartition {
  readonly communities: IndexCommunities;
  readonly membership: number[];
}

interface LocalMoveOptions extends CancellationOptions {
  readonly maxPasses: number;
  readonly tolerance: number;
  readonly preserveConnectivity: boolean;
  readonly rng: RandomSource;
}

interface LocalMoveResult {
  readonly groups: IndexCommunities;
  readonly quality: number;
  readonly moved: boolean;
  readonly passes: number;
}

interface LocalQualitySpec {
  readonly objective: LeidenObjective;
  readonly resolution: number;
}

interface LocalGroup {
  readonly members: Set<number>;
  min: number;
  nodeCount: number;
  degree: number;
  outgoing: number;
  incoming: number;
}

interface LocalMoveState {
  readonly directed: boolean;
  readonly membership: Int32Array;
  readonly groups: Map<number, LocalGroup>;
  readonly crossWeights: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly blockNodeCounts: readonly number[];
  readonly blockDegrees: Float64Array;
  readonly blockOutgoing: Float64Array;
  readonly blockIncoming: Float64Array;
  readonly totalWeight: number;
  readonly spec: LocalQualitySpec;
  nextGroupId: number;
  quality: number;
}

interface LocalMoveCandidate {
  readonly target: number;
  readonly quality: number;
}

/**
 * Validate that `partition` covers every graph node exactly once. Empty
 * communities, unknown nodes, duplicates, and omissions throw RangeError.
 */
export function validatePartition(input: ModernGraphInput, partition: PartitionInput): true {
  const view = weightedView(makeSparseGraph(input));
  normalizePartition(view, partition);
  return true;
}

/** Weighted Newman-Girvan modularity for directed or undirected graphs. */
export function modularity(input: ModernGraphInput, partition: PartitionInput, options: ModularityOptions = {}): number {
  const view = weightedView(makeSparseGraph(input));
  const resolution = positiveResolution(options.resolution);
  return modularityOf(view, normalizePartition(view, partition).communities, resolution);
}

/** NetworkX-compatible unweighted coverage and performance. */
export function partitionQuality(input: ModernGraphInput, partition: PartitionInput): PartitionQuality {
  const view = weightedView(makeSparseGraph(input));
  const canonical = normalizePartition(view, partition);
  const membership = canonical.membership;
  let intra = 0;
  let structuralEdges = 0;

  for (const edge of view.edges) {
    if (edge.source === edge.target) continue;
    structuralEdges += 1;
    if (membership[edge.source] === membership[edge.target]) intra += 1;
  }

  let possibleInter = 0;
  for (let left = 0; left < canonical.communities.length; left += 1) {
    for (let right = left + 1; right < canonical.communities.length; right += 1) {
      possibleInter += canonical.communities[left]!.length * canonical.communities[right]!.length;
    }
  }
  if (view.directed) possibleInter *= 2;

  const interEdges = structuralEdges - intra;
  const interNonEdges = possibleInter - interEdges;
  const totalPairs = view.directed ? view.order * (view.order - 1) : (view.order * (view.order - 1)) / 2;

  return {
    coverage: structuralEdges === 0 ? 0 : intra / structuralEdges,
    performance: totalPairs === 0 ? 1 : (intra + interNonEdges) / totalPairs,
  };
}

/**
 * Clauset-Newman-Moore style agglomerative greedy modularity. This is a
 * deliberately straightforward implementation: it evaluates every adjacent
 * community merge against the exact weighted modularity objective.
 */
export function greedyModularity(input: ModernGraphInput, options: GreedyModularityOptions = {}): PartitionResult {
  const view = weightedView(makeSparseGraph(input));
  requireUndirected(view, "greedyModularity");
  const resolution = positiveResolution(options.resolution);
  const tolerance = nonNegativeFinite(options.tolerance ?? DEFAULT_TOLERANCE, "tolerance");
  const target = options.targetCommunities ?? 0;
  if (!Number.isInteger(target) || target < 0 || target > view.order) {
    throw new RangeError("targetCommunities must be an integer in [0, graph order]");
  }

  let communities = singletonPartition(view.order);
  let quality = modularityOf(view, communities, resolution);
  let merges = 0;

  while (communities.length > Math.max(1, target)) {
    checkAborted(options.signal);
    const pairs = target > 0 ? allCommunityPairs(communities.length) : adjacentCommunityPairs(view, communities);
    let best: { readonly left: number; readonly right: number; readonly quality: number } | undefined;

    for (const [left, right] of pairs) {
      const candidate = mergeCommunities(communities, left, right);
      const candidateQuality = modularityOf(view, candidate, resolution);
      if (
        best === undefined ||
        candidateQuality > best.quality + tolerance ||
        (Math.abs(candidateQuality - best.quality) <= tolerance && (left < best.left || (left === best.left && right < best.right)))
      ) {
        best = { left, right, quality: candidateQuality };
      }
    }

    if (best === undefined) break;
    const forced = target > 0 && communities.length > target;
    if (!forced && best.quality <= quality + tolerance) break;
    communities = mergeCommunities(communities, best.left, best.right);
    quality = best.quality;
    merges += 1;
    options.onProgress?.(merges, Math.max(1, view.order - Math.max(1, target)));
  }

  return partitionResult(view, communities, { modularity: quality }, analysisMeta("greedy-modularity", view, {
    exact: false,
    approximate: true,
    iterations: merges,
    warnings: ["Greedy modularity is a heuristic and does not guarantee the globally optimal partition."],
  }));
}

/** Seeded multi-level Louvain (local moving followed by graph aggregation). */
export function louvain(input: ModernGraphInput, options: LouvainOptions = {}): PartitionResult {
  const view = weightedView(makeSparseGraph(input));
  const resolution = positiveResolution(options.resolution);
  const tolerance = aliasedNonNegativeFinite(options.threshold, options.tolerance, DEFAULT_TOLERANCE, "threshold", "tolerance");
  const maxLevels = positiveInteger(options.maxLevels ?? 100, "maxLevels");
  const maxPasses = positiveInteger(options.maxPasses ?? 100, "maxPasses");
  const rng = deterministicRng(options);
  const qualityFunction = (communities: IndexCommunities): number => modularityOf(view, communities, resolution);

  let blocks = singletonPartition(view.order);
  let quality = qualityFunction(blocks);
  let levels = 0;
  let totalPasses = 0;
  let converged = blocks.length <= 1;

  while (levels < maxLevels && blocks.length > 1) {
    checkAborted(options.signal);
    const initialGroups = singletonPartition(blocks.length);
    const moved = localMoveBlocks(view, blocks, initialGroups, qualityFunction, {
      objective: "modularity",
      resolution,
    }, {
      maxPasses,
      tolerance,
      preserveConnectivity: false,
      rng,
      signal: options.signal,
    });
    totalPasses += moved.passes;
    const aggregated = groupsToOriginalCommunities(blocks, moved.groups);
    const canonical = canonicalizeIndexCommunities(view.order, aggregated).communities;
    const nextQuality = qualityFunction(canonical);
    if (sameCommunities(canonical, blocks) || nextQuality <= quality + tolerance) {
      converged = true;
      break;
    }
    blocks = canonical;
    quality = nextQuality;
    levels += 1;
    options.onProgress?.(levels, maxLevels);
    if (blocks.length <= 1) converged = true;
  }

  return partitionResult(view, blocks, { modularity: quality }, analysisMeta("louvain", view, {
    exact: false,
    seed: reportedSeed(options),
    iterations: totalPasses,
    converged,
    approximate: true,
    warnings: ["Louvain optimizes modularity heuristically; different seeds can reach different local optima."],
  }));
}

/**
 * Restricted Leiden implementation for undirected graphs.
 *
 * It implements the three distinguishing phases from Traag, Waltman & van
 * Eck: local moving, refinement constrained within the unrefined parent
 * communities, and aggregation using the refined communities. Refinement
 * only admits positive-gain adjacent merges and local moves are constrained
 * not to disconnect their source community. Consequently every returned
 * community is connected. It does not implement the paper's full
 * gamma-density admissibility test, so metadata names this implementation
 * `leiden-restricted` and does not claim the stronger subset-optimality proof.
 */
export function leiden(input: ModernGraphInput, options: LeidenOptions = {}): PartitionResult {
  const view = weightedView(makeSparseGraph(input));
  requireUndirected(view, "leiden");
  const resolution = positiveResolution(options.resolution);
  const objective = options.objective ?? "modularity";
  const beta = aliasedPositiveFinite(options.beta, options.theta, 0.01, "beta", "theta");
  const tolerance = nonNegativeFinite(options.tolerance ?? DEFAULT_TOLERANCE, "tolerance");
  const maxLevels = aliasedPositiveInteger(options.iterations, options.maxLevels, 2, "iterations", "maxLevels");
  const maxPasses = positiveInteger(options.maxPasses ?? 100, "maxPasses");
  const rng = deterministicRng(options);
  const qualityFunction: QualityFunction = objective === "cpm"
    ? (communities) => cpmOf(view, communities, resolution)
    : (communities) => modularityOf(view, communities, resolution);

  let blocks = singletonPartition(view.order);
  let initialGroups = singletonPartition(blocks.length);
  let finalPartition = blocks;
  let quality = qualityFunction(finalPartition);
  let levels = 0;
  let totalPasses = 0;
  let converged = blocks.length <= 1;

  while (levels < maxLevels) {
    checkAborted(options.signal);
    const previousQuality = qualityFunction(groupsToOriginalCommunities(blocks, initialGroups));
    const moved = localMoveBlocks(view, blocks, initialGroups, qualityFunction, {
      objective,
      resolution,
    }, {
      maxPasses,
      tolerance,
      preserveConnectivity: true,
      rng,
      signal: options.signal,
    });
    totalPasses += moved.passes;
    const parent = canonicalizeIndexCommunities(view.order, groupsToOriginalCommunities(blocks, moved.groups)).communities;
    const refinedGroups = refineLeiden(
      view,
      blocks,
      moved.groups,
      qualityFunction,
      { objective, resolution },
      rng,
      beta,
      tolerance,
      options.signal,
    );
    const refined = canonicalizeIndexCommunities(view.order, groupsToOriginalCommunities(blocks, refinedGroups)).communities;
    const connectedRefined = splitDisconnectedCommunities(view, refined);
    const nextQuality = qualityFunction(parent);

    // Leiden's reported partition is the unrefined partition P. The refined
    // partition is used to build the next aggregate graph.
    finalPartition = parent;
    quality = nextQuality;
    levels += 1;
    options.onProgress?.(levels, maxLevels);

    if (connectedRefined.length === blocks.length || nextQuality <= previousQuality + tolerance) {
      converged = true;
      break;
    }

    blocks = connectedRefined;
    initialGroups = parentGroupsForRefinement(blocks, parent);
    if (blocks.length <= 1) {
      converged = true;
      break;
    }
  }

  const qualityName = objective === "cpm" ? "cpm" : "modularity";
  return partitionResult(view, finalPartition, { [qualityName]: quality }, analysisMeta("leiden-restricted", view, {
    exact: false,
    seed: reportedSeed(options),
    iterations: levels,
    converged,
    approximate: true,
    warnings: [
      "This implementation includes Leiden local-moving, constrained refinement, and aggregation phases and guarantees connected returned communities.",
      "It omits the full gamma-density admissibility proof and therefore does not claim Leiden subset-optimality.",
      `Completed ${levels} outer Leiden iteration(s) and ${totalPasses} local-moving pass(es).`,
    ],
  }));
}

/** Evaluate the two-level map equation, in bits per random-walk step. */
export function mapEquation(input: ModernGraphInput, partition: PartitionInput, options: Pick<InfomapOptions, "teleportation" | "tolerance" | "maxIterations"> = {}): number {
  const view = weightedView(makeSparseGraph(input));
  const canonical = normalizePartition(view, partition);
  const flow = stationaryFlow(view, options);
  return mapEquationOf(view, canonical.communities, flow);
}

/**
 * Seeded two-level Infomap optimizer. This implementation minimizes the map
 * equation directly using greedy node moves. It is not hierarchical Infomap
 * and does not expose Markov-time, multilayer, or unrecorded-teleportation
 * variants; those limits are present in result metadata.
 */
export function infomap(input: ModernGraphInput, options: InfomapOptions = {}): PartitionResult {
  const view = weightedView(makeSparseGraph(input));
  const tolerance = positiveFinite(options.tolerance ?? DEFAULT_TOLERANCE, "tolerance");
  const maxPasses = positiveInteger(options.maxPasses ?? 100, "maxPasses");
  const trials = positiveInteger(options.trials ?? 10, "trials");
  const flow = stationaryFlow(view, options);
  const objective = (communities: IndexCommunities): number => mapEquationOf(view, communities, flow);
  const randomSources = infomapTrialRandomSources(options, trials);
  let best: InfomapTrialResult | undefined;
  let selectedTrial = 0;
  let totalPasses = 0;
  let allConverged = true;

  for (let trial = 0; trial < trials; trial += 1) {
    checkAborted(options.signal);
    const candidate = optimizeInfomapTrial(view, flow, objective, randomSources[trial]!, tolerance, maxPasses, options.signal);
    totalPasses += candidate.passes;
    allConverged = allConverged && candidate.converged;
    if (
      best === undefined ||
      candidate.score < best.score - tolerance ||
      (Math.abs(candidate.score - best.score) <= tolerance && compareCommunities(candidate.communities, best.communities) < 0)
    ) {
      best = candidate;
      selectedTrial = trial;
    }
    options.onProgress?.(trial + 1, trials);
  }

  // trials is positive, so an optimizer result is always present.
  const selected = best!;

  return partitionResult(view, selected.communities, { codeLength: selected.score }, analysisMeta("infomap-two-level-greedy", view, {
    exact: false,
    seed: reportedSeed(options),
    iterations: totalPasses,
    converged: allConverged,
    approximate: true,
    warnings: [
      "This is a two-level greedy map-equation optimizer, not hierarchical Infomap.",
      view.directed ? "Directed flow uses recorded teleportation and uniform dangling-node redistribution." : "Undirected flow uses the weighted random-walk stationary distribution.",
      `Ran ${trials} independent seeded optimization trial(s), selected trial ${selectedTrial + 1}, and completed ${totalPasses} total node-moving pass(es).`,
    ],
  }));
}

/**
 * Bounded Girvan-Newman divisive hierarchy. At least one of
 * `maxCommunities` or `levels` is mandatory to prevent accidental unbounded
 * edge-betweenness recomputation.
 */
export function girvanNewman(input: ModernGraphInput, options: GirvanNewmanOptions): HierarchicalCommunityResult {
  const view = weightedView(makeSparseGraph(input));
  requireUndirected(view, "girvanNewman");
  if (options.maxCommunities === undefined && options.levels === undefined) {
    throw new RangeError("girvanNewman requires maxCommunities or levels");
  }
  const maxCommunities = options.maxCommunities === undefined
    ? Number.POSITIVE_INFINITY
    : positiveInteger(options.maxCommunities, "maxCommunities");
  const maxLevels = options.levels === undefined ? Number.POSITIVE_INFINITY : positiveInteger(options.levels, "levels");
  if (options.useWeights) {
    for (const edge of view.edges) {
      if (edge.source !== edge.target && edge.weight <= 0) {
        throw new RangeError("weighted Girvan-Newman requires strictly positive distance weights");
      }
    }
  }

  const active = Array.from({ length: view.edges.length }, () => true);
  let previous = undirectedComponents(view, active);
  const levels: PartitionResult[] = [];
  let removals = 0;

  while (levels.length < maxLevels && previous.length < maxCommunities) {
    checkAborted(options.signal);
    const scores = edgeBetweenness(view, active, options.useWeights === true, options.signal);
    let bestEdge = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let edge = 0; edge < scores.length; edge += 1) {
      if (!active[edge]) continue;
      const score = scores[edge]!;
      if (score > bestScore + DEFAULT_TOLERANCE || (Math.abs(score - bestScore) <= DEFAULT_TOLERANCE && edge < bestEdge)) {
        bestScore = score;
        bestEdge = edge;
      }
    }
    if (bestEdge < 0) break;
    active[bestEdge] = false;
    removals += 1;

    const current = undirectedComponents(view, active);
    if (current.length > previous.length) {
      const quality = modularityOf(view, current, 1);
      levels.push(partitionResult(view, current, { modularity: quality }, analysisMeta("girvan-newman", view, {
        exact: true,
        iterations: removals,
        weighted: options.useWeights === true,
        valueSemantics: options.useWeights === true ? "distance" : "binary",
      })));
      previous = current;
      options.onProgress?.(levels.length, Number.isFinite(maxLevels) ? maxLevels : Math.max(1, view.order - 1));
    }
  }

  return {
    levels,
    meta: analysisMeta("girvan-newman", view, {
      exact: true,
      iterations: removals,
      weighted: options.useWeights === true,
      valueSemantics: options.useWeights === true ? "distance" : "binary",
      warnings: ["Girvan-Newman recomputes exact edge betweenness after every removal and is intended for small graphs."],
    }),
  };
}

/** Seeded asynchronous weighted label propagation on the weak graph. */
export function labelPropagation(input: ModernGraphInput, options: LabelPropagationOptions = {}): PartitionResult {
  const view = weightedView(makeSparseGraph(input));
  const maxIterations = nonNegativeInteger(options.maxIterations ?? 100, "maxIterations");
  const rng = deterministicRng(options);
  const labels = Array.from({ length: view.order }, (_unused, node) => node);
  let iterations = 0;
  let converged = view.order === 0;

  while (iterations < maxIterations) {
    checkAborted(options.signal);
    let changed = false;
    const order = shuffled(Array.from({ length: view.order }, (_unused, node) => node), rng);
    for (const node of order) {
      const strengths = new Map<number, number>();
      for (const [neighbor, weight] of view.neighbors[node]!) {
        if (weight === 0) continue;
        const label = labels[neighbor]!;
        strengths.set(label, (strengths.get(label) ?? 0) + weight);
      }
      if (strengths.size === 0) continue;
      let bestWeight = Number.NEGATIVE_INFINITY;
      const bestLabels: number[] = [];
      for (const [label, weight] of strengths) {
        if (weight > bestWeight + DEFAULT_TOLERANCE) {
          bestWeight = weight;
          bestLabels.length = 0;
          bestLabels.push(label);
        } else if (Math.abs(weight - bestWeight) <= DEFAULT_TOLERANCE) {
          bestLabels.push(label);
        }
      }
      bestLabels.sort((left, right) => left - right);
      const selected = bestLabels[Math.floor(rng() * bestLabels.length)]!;
      if (selected !== labels[node]) {
        labels[node] = selected;
        changed = true;
      }
    }
    iterations += 1;
    options.onProgress?.(iterations, Math.max(1, maxIterations));
    if (!changed) {
      converged = true;
      break;
    }
  }

  const byLabel = new Map<number, number[]>();
  for (let node = 0; node < labels.length; node += 1) {
    const label = labels[node]!;
    const community = byLabel.get(label) ?? [];
    community.push(node);
    byLabel.set(label, community);
  }
  const communities = [...byLabel.values()];
  return partitionResult(view, communities, { modularity: modularityOf(view, communities, 1) }, analysisMeta("label-propagation", view, {
    exact: false,
    seed: reportedSeed(options),
    iterations,
    converged,
    approximate: true,
    warnings: view.directed ? ["Directed input is analyzed as a weak graph with inbound and outbound strengths summed."] : [],
  }));
}

/** Overlapping k-clique percolation communities for undirected graphs. */
export function kCliqueCommunities(input: ModernGraphInput, k: number, options: KCliqueOptions = {}): CommunityCoverResult {
  const view = weightedView(makeSparseGraph(input));
  requireUndirected(view, "kCliqueCommunities");
  if (!Number.isInteger(k) || k < 2) throw new RangeError("k must be an integer >= 2");
  const maxCliques = positiveInteger(options.maxCliques ?? 10_000, "maxCliques");
  const cliques = maximalCliques(view, k, maxCliques, options);
  const cliqueAdjacency = Array.from({ length: cliques.length }, () => new Set<number>());

  for (let left = 0; left < cliques.length; left += 1) {
    checkAborted(options.signal);
    for (let right = left + 1; right < cliques.length; right += 1) {
      if (intersectionSize(cliques[left]!, cliques[right]!) < k - 1) continue;
      cliqueAdjacency[left]!.add(right);
      cliqueAdjacency[right]!.add(left);
    }
  }

  const seen = new Uint8Array(cliques.length);
  const communities: number[][] = [];
  for (let start = 0; start < cliques.length; start += 1) {
    if (seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    const nodes = new Set<number>();
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const clique = queue[cursor]!;
      for (const node of cliques[clique]!) nodes.add(node);
      for (const next of cliqueAdjacency[clique]!) {
        if (seen[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    communities.push([...nodes].sort((left, right) => left - right));
  }

  return communityCoverResult(view, communities, analysisMeta("k-clique-percolation", view, {
    exact: true,
    iterations: cliques.length,
    weighted: false,
    valueSemantics: "binary",
    warnings: ["Maximal-clique enumeration is exponential; maxCliques bounds the search."],
  }));
}

function weightedView(graph: SparseGraph): WeightedView {
  const order = graph.nodeIds.length;
  const edges: IndexedEdge[] = [];
  const neighbors = Array.from({ length: order }, () => new Map<number, number>());
  const outgoing = Array.from({ length: order }, () => new Map<number, number>());
  const incoming = Array.from({ length: order }, () => new Map<number, number>());
  let weighted = false;

  for (let source = 0; source < order; source += 1) {
    const start = graph.csr.offsets[source]!;
    const end = graph.csr.offsets[source + 1]!;
    for (let cursor = start; cursor < end; cursor += 1) {
      const target = graph.csr.indices[cursor]!;
      const weight = graph.csr.weights[cursor]!;
      if (!Number.isFinite(weight) || weight < 0) {
        throw new RangeError("community algorithms require finite non-negative edge weights");
      }
      if (weight !== 1) weighted = true;
      if (!graph.directed && source > target) continue;
      edges.push({ source, target, weight });

      if (graph.directed) {
        addMapWeight(outgoing[source]!, target, weight);
        addMapWeight(incoming[target]!, source, weight);
        if (source !== target) {
          addMapWeight(neighbors[source]!, target, weight);
          addMapWeight(neighbors[target]!, source, weight);
        }
      } else if (source === target) {
        // An undirected loop contributes twice to degree/random-walk strength.
        addMapWeight(outgoing[source]!, target, 2 * weight);
        addMapWeight(incoming[source]!, target, 2 * weight);
      } else {
        addMapWeight(outgoing[source]!, target, weight);
        addMapWeight(outgoing[target]!, source, weight);
        addMapWeight(incoming[source]!, target, weight);
        addMapWeight(incoming[target]!, source, weight);
        addMapWeight(neighbors[source]!, target, weight);
        addMapWeight(neighbors[target]!, source, weight);
      }
    }
  }

  return {
    graph,
    nodeIds: graph.nodeIds,
    order,
    directed: graph.directed,
    edges,
    neighbors,
    outgoing,
    incoming,
    weighted,
  };
}

function addMapWeight(map: Map<number, number>, key: number, weight: number): void {
  map.set(key, (map.get(key) ?? 0) + weight);
}

function normalizePartition(view: WeightedView, partition: PartitionInput): CanonicalIndexPartition {
  if (isCommunityList(partition)) {
    const indexByNode = new Map<NodeId, number>();
    view.nodeIds.forEach((node, index) => indexByNode.set(node, index));
    const communities: number[][] = [];
    const seen = new Uint8Array(view.order);

    for (const community of partition) {
      if (community.length === 0) throw new RangeError("partition communities must not be empty");
      const indexed: number[] = [];
      for (const node of community) {
        const index = indexByNode.get(node);
        if (index === undefined) throw new RangeError(`partition contains unknown node ${String(node)}`);
        if (seen[index]) throw new RangeError(`partition contains node ${String(node)} more than once`);
        seen[index] = 1;
        indexed.push(index);
      }
      communities.push(indexed);
    }
    for (let node = 0; node < seen.length; node += 1) {
      if (!seen[node]) throw new RangeError(`partition omits node ${String(view.nodeIds[node])}`);
    }
    return canonicalizeIndexCommunities(view.order, communities);
  }

  if (partition.nodes.length !== partition.membership.length) {
    throw new RangeError("partition nodes and membership must have identical lengths");
  }
  const indexByNode = new Map<NodeId, number>();
  view.nodeIds.forEach((node, index) => indexByNode.set(node, index));
  const seen = new Uint8Array(view.order);
  const byLabel = new Map<number, number[]>();

  for (let position = 0; position < partition.nodes.length; position += 1) {
    const nodeId = partition.nodes[position]!;
    const node = indexByNode.get(nodeId);
    if (node === undefined) throw new RangeError(`partition contains unknown node ${String(nodeId)}`);
    if (seen[node]) throw new RangeError(`partition contains node ${String(nodeId)} more than once`);
    seen[node] = 1;
    const label = partition.membership[position]!;
    if (!Number.isInteger(label) || label < 0) throw new RangeError("partition membership labels must be non-negative integers");
    const community = byLabel.get(label) ?? [];
    community.push(node);
    byLabel.set(label, community);
  }
  for (let node = 0; node < seen.length; node += 1) {
    if (!seen[node]) throw new RangeError(`partition omits node ${String(view.nodeIds[node])}`);
  }
  return canonicalizeIndexCommunities(view.order, [...byLabel.values()]);
}

function isCommunityList(partition: PartitionInput): partition is ReadonlyArray<ReadonlyArray<NodeId>> {
  return Array.isArray(partition);
}

function canonicalizeIndexCommunities(order: number, input: ReadonlyArray<ReadonlyArray<number>>): CanonicalIndexPartition {
  const communities = input
    .filter((community) => community.length > 0)
    .map((community) => [...new Set(community)].sort((left, right) => left - right))
    .sort(compareNumberArrays);
  const membership = Array.from({ length: order }, () => -1);
  communities.forEach((community, label) => {
    for (const node of community) {
      if (!Number.isInteger(node) || node < 0 || node >= order) throw new RangeError("internal partition node is out of range");
      if (membership[node] !== -1) throw new RangeError("internal partition contains a node more than once");
      membership[node] = label;
    }
  });
  if (membership.some((label) => label < 0)) throw new RangeError("internal partition does not cover every node");
  return { communities, membership };
}

function canonicalizeBlockGroups(blockCount: number, input: ReadonlyArray<ReadonlyArray<number>>): CanonicalIndexPartition {
  return canonicalizeIndexCommunities(blockCount, input);
}

function compareNumberArrays(left: readonly number[], right: readonly number[]): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function compareCommunities(left: IndexCommunities, right: IndexCommunities): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    const difference = compareNumberArrays(left[index]!, right[index]!);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function sameCommunities(left: IndexCommunities, right: IndexCommunities): boolean {
  return compareCommunities(left, right) === 0;
}

function singletonPartition(order: number): IndexCommunities {
  return Array.from({ length: order }, (_unused, node) => [node]);
}

function modularityOf(view: WeightedView, communitiesInput: IndexCommunities, resolution: number): number {
  const canonical = canonicalizeIndexCommunities(view.order, communitiesInput);
  const membership = canonical.membership;
  let totalWeight = 0;
  const internal = Array.from({ length: canonical.communities.length }, () => 0);

  if (view.directed) {
    const outgoing = Array.from({ length: view.order }, () => 0);
    const incoming = Array.from({ length: view.order }, () => 0);
    for (const edge of view.edges) {
      totalWeight += edge.weight;
      outgoing[edge.source] = outgoing[edge.source]! + edge.weight;
      incoming[edge.target] = incoming[edge.target]! + edge.weight;
      if (membership[edge.source] === membership[edge.target]) {
        const label = membership[edge.source]!;
        internal[label] = internal[label]! + edge.weight;
      }
    }
    if (totalWeight === 0) return 0;
    const outByCommunity = Array.from({ length: canonical.communities.length }, () => 0);
    const inByCommunity = Array.from({ length: canonical.communities.length }, () => 0);
    for (let node = 0; node < view.order; node += 1) {
      const label = membership[node]!;
      outByCommunity[label] = outByCommunity[label]! + outgoing[node]!;
      inByCommunity[label] = inByCommunity[label]! + incoming[node]!;
    }
    let quality = 0;
    for (let label = 0; label < canonical.communities.length; label += 1) {
      quality += internal[label]! / totalWeight - resolution * outByCommunity[label]! * inByCommunity[label]! / (totalWeight * totalWeight);
    }
    return quality;
  }

  const degree = Array.from({ length: view.order }, () => 0);
  for (const edge of view.edges) {
    totalWeight += edge.weight;
    if (edge.source === edge.target) degree[edge.source] = degree[edge.source]! + 2 * edge.weight;
    else {
      degree[edge.source] = degree[edge.source]! + edge.weight;
      degree[edge.target] = degree[edge.target]! + edge.weight;
    }
    if (membership[edge.source] === membership[edge.target]) {
      const label = membership[edge.source]!;
      internal[label] = internal[label]! + edge.weight;
    }
  }
  if (totalWeight === 0) return 0;
  const degreeByCommunity = Array.from({ length: canonical.communities.length }, () => 0);
  for (let node = 0; node < view.order; node += 1) {
    const label = membership[node]!;
    degreeByCommunity[label] = degreeByCommunity[label]! + degree[node]!;
  }
  let quality = 0;
  for (let label = 0; label < canonical.communities.length; label += 1) {
    quality += internal[label]! / totalWeight - resolution * (degreeByCommunity[label]! / (2 * totalWeight)) ** 2;
  }
  return quality;
}

function cpmOf(view: WeightedView, communitiesInput: IndexCommunities, resolution: number): number {
  requireUndirected(view, "CPM");
  const canonical = canonicalizeIndexCommunities(view.order, communitiesInput);
  let internalWeight = 0;
  for (const edge of view.edges) {
    if (canonical.membership[edge.source] === canonical.membership[edge.target]) internalWeight += edge.weight;
  }
  let penalty = 0;
  for (const community of canonical.communities) penalty += (community.length * (community.length - 1)) / 2;
  return internalWeight - resolution * penalty;
}

function adjacentCommunityPairs(view: WeightedView, communities: IndexCommunities): Array<readonly [number, number]> {
  const canonical = canonicalizeIndexCommunities(view.order, communities);
  const pairs = new Set<string>();
  for (const edge of view.edges) {
    const leftLabel = canonical.membership[edge.source]!;
    const rightLabel = canonical.membership[edge.target]!;
    if (leftLabel === rightLabel) continue;
    const left = Math.min(leftLabel, rightLabel);
    const right = Math.max(leftLabel, rightLabel);
    pairs.add(`${left}:${right}`);
  }
  return [...pairs]
    .map((pair): readonly [number, number] => {
      const separator = pair.indexOf(":");
      return [Number(pair.slice(0, separator)), Number(pair.slice(separator + 1))];
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function allCommunityPairs(count: number): Array<readonly [number, number]> {
  const pairs: Array<readonly [number, number]> = [];
  for (let left = 0; left < count; left += 1) {
    for (let right = left + 1; right < count; right += 1) pairs.push([left, right]);
  }
  return pairs;
}

function mergeCommunities(communities: IndexCommunities, left: number, right: number): IndexCommunities {
  const merged: number[][] = [];
  for (let label = 0; label < communities.length; label += 1) {
    if (label === left) merged.push([...communities[left]!, ...communities[right]!]);
    else if (label !== right) merged.push([...communities[label]!]);
  }
  const order = communities.reduce((sum, community) => sum + community.length, 0);
  return canonicalizeIndexCommunities(order, merged).communities;
}

function groupsToOriginalCommunities(blocks: IndexCommunities, groups: IndexCommunities): IndexCommunities {
  return groups.map((group) => group.flatMap((block) => blocks[block] ?? []));
}

function localMoveBlocks(
  view: WeightedView,
  blocks: IndexCommunities,
  initialGroups: IndexCommunities,
  qualityFunction: QualityFunction,
  qualitySpec: LocalQualitySpec,
  options: LocalMoveOptions,
): LocalMoveResult {
  const initial = canonicalizeBlockGroups(blocks.length, initialGroups).communities;
  const state = createLocalMoveState(
    view,
    blocks,
    initial,
    qualitySpec,
    qualityFunction(groupsToOriginalCommunities(blocks, initial)),
  );
  let everMoved = false;
  let passes = 0;

  while (passes < options.maxPasses) {
    checkAborted(options.signal);
    let movedThisPass = false;
    const order = shuffled(Array.from({ length: blocks.length }, (_unused, block) => block), options.rng);
    for (let position = 0; position < order.length; position += 1) {
      if ((position & 0x3ff) === 0) checkAborted(options.signal);
      const block = order[position]!;
      const current = state.membership[block]!;
      const currentGroup = state.groups.get(current)!;
      const candidates = candidateLocalGroups(state, block);
      if (currentGroup.members.size > 1) candidates.add(-1);
      if (
        options.preserveConnectivity &&
        currentGroup.members.size > 1 &&
        !localGroupConnectedAfterRemoval(state, current, block)
      ) {
        continue;
      }

      let best: LocalMoveCandidate | undefined;
      for (const candidate of [...candidates].sort((left, right) => compareLocalGroupTargets(state, left, right))) {
        if (candidate === current) continue;
        const proposedQuality = localMoveQuality(state, block, candidate);
        if (proposedQuality > (best?.quality ?? state.quality) + options.tolerance) {
          best = { target: candidate, quality: proposedQuality };
        }
      }
      if (best !== undefined) {
        applyLocalMove(state, block, best);
        movedThisPass = true;
        everMoved = true;
      }
    }
    passes += 1;
    if (!movedThisPass) break;
  }
  const groups = localStateGroups(state);
  // Recompute once to prevent accumulated delta-rounding error from leaking
  // into public quality metadata. Candidate selection remains sparse/local.
  const quality = qualityFunction(groupsToOriginalCommunities(blocks, groups));
  return { groups, quality, moved: everMoved, passes };
}

function createLocalMoveState(
  view: WeightedView,
  blocks: IndexCommunities,
  initialGroups: IndexCommunities,
  spec: LocalQualitySpec,
  quality: number,
): LocalMoveState {
  const blockByNode = new Int32Array(view.order);
  blockByNode.fill(-1);
  blocks.forEach((nodes, blockIndex) => {
    for (const node of nodes) blockByNode[node] = blockIndex;
  });

  const crossWeights = Array.from({ length: blocks.length }, () => new Map<number, number>());
  const blockNodeCounts = blocks.map((block) => block.length);
  const blockDegrees = new Float64Array(blocks.length);
  const blockOutgoing = new Float64Array(blocks.length);
  const blockIncoming = new Float64Array(blocks.length);
  let totalWeight = 0;

  for (const edge of view.edges) {
    const sourceBlock = blockByNode[edge.source]!;
    const targetBlock = blockByNode[edge.target]!;
    totalWeight += edge.weight;
    if (view.directed) {
      blockOutgoing[sourceBlock] = blockOutgoing[sourceBlock]! + edge.weight;
      blockIncoming[targetBlock] = blockIncoming[targetBlock]! + edge.weight;
    } else if (edge.source === edge.target) {
      blockDegrees[sourceBlock] = blockDegrees[sourceBlock]! + 2 * edge.weight;
    } else {
      blockDegrees[sourceBlock] = blockDegrees[sourceBlock]! + edge.weight;
      blockDegrees[targetBlock] = blockDegrees[targetBlock]! + edge.weight;
    }
    if (sourceBlock !== targetBlock) {
      addMapWeight(crossWeights[sourceBlock]!, targetBlock, edge.weight);
      addMapWeight(crossWeights[targetBlock]!, sourceBlock, edge.weight);
    }
  }

  const membership = new Int32Array(blocks.length);
  membership.fill(-1);
  const groups = new Map<number, LocalGroup>();
  initialGroups.forEach((members, id) => {
    const group: LocalGroup = {
      members: new Set(members),
      min: members[0]!,
      nodeCount: 0,
      degree: 0,
      outgoing: 0,
      incoming: 0,
    };
    for (const block of members) {
      membership[block] = id;
      group.nodeCount += blockNodeCounts[block]!;
      group.degree += blockDegrees[block]!;
      group.outgoing += blockOutgoing[block]!;
      group.incoming += blockIncoming[block]!;
    }
    groups.set(id, group);
  });

  return {
    directed: view.directed,
    membership,
    groups,
    crossWeights,
    blockNodeCounts,
    blockDegrees,
    blockOutgoing,
    blockIncoming,
    totalWeight,
    spec,
    nextGroupId: initialGroups.length,
    quality,
  };
}

function candidateLocalGroups(state: LocalMoveState, block: number): Set<number> {
  const candidates = new Set<number>([state.membership[block]!]);
  for (const neighbor of state.crossWeights[block]!.keys()) candidates.add(state.membership[neighbor]!);
  return candidates;
}

function compareLocalGroupTargets(state: LocalMoveState, left: number, right: number): number {
  if (left === -1) return right === -1 ? 0 : -1;
  if (right === -1) return 1;
  return state.groups.get(left)!.min - state.groups.get(right)!.min;
}

function localMoveQuality(state: LocalMoveState, block: number, target: number): number {
  const source = state.membership[block]!;
  if (source === target) return state.quality;
  const sourceGroup = state.groups.get(source)!;
  const targetGroup = target < 0 ? undefined : state.groups.get(target)!;
  let sourceCross = 0;
  let targetCross = 0;
  for (const [neighbor, weight] of state.crossWeights[block]!) {
    const neighborGroup = state.membership[neighbor]!;
    if (neighborGroup === source) sourceCross += weight;
    else if (neighborGroup === target) targetCross += weight;
  }
  const internalDelta = targetCross - sourceCross;
  const blockNodes = state.blockNodeCounts[block]!;
  let delta: number;

  if (state.spec.objective === "cpm") {
    const sourceBefore = chooseTwo(sourceGroup.nodeCount);
    const targetBefore = chooseTwo(targetGroup?.nodeCount ?? 0);
    const sourceAfter = chooseTwo(sourceGroup.nodeCount - blockNodes);
    const targetAfter = chooseTwo((targetGroup?.nodeCount ?? 0) + blockNodes);
    delta = internalDelta - state.spec.resolution * (sourceAfter + targetAfter - sourceBefore - targetBefore);
  } else if (state.totalWeight === 0) {
    delta = 0;
  } else if (state.directed) {
    const blockOutgoing = state.blockOutgoing[block]!;
    const blockIncoming = state.blockIncoming[block]!;
    const sourceBefore = sourceGroup.outgoing * sourceGroup.incoming;
    const targetBefore = (targetGroup?.outgoing ?? 0) * (targetGroup?.incoming ?? 0);
    const sourceAfter = (sourceGroup.outgoing - blockOutgoing) * (sourceGroup.incoming - blockIncoming);
    const targetAfter = ((targetGroup?.outgoing ?? 0) + blockOutgoing) * ((targetGroup?.incoming ?? 0) + blockIncoming);
    delta = internalDelta / state.totalWeight -
      state.spec.resolution * (sourceAfter + targetAfter - sourceBefore - targetBefore) /
        (state.totalWeight * state.totalWeight);
  } else {
    const blockDegree = state.blockDegrees[block]!;
    const denominator = 2 * state.totalWeight;
    const sourceBefore = (sourceGroup.degree / denominator) ** 2;
    const targetBefore = ((targetGroup?.degree ?? 0) / denominator) ** 2;
    const sourceAfter = ((sourceGroup.degree - blockDegree) / denominator) ** 2;
    const targetAfter = (((targetGroup?.degree ?? 0) + blockDegree) / denominator) ** 2;
    delta = internalDelta / state.totalWeight -
      state.spec.resolution * (sourceAfter + targetAfter - sourceBefore - targetBefore);
  }
  return state.quality + delta;
}

function applyLocalMove(state: LocalMoveState, block: number, candidate: LocalMoveCandidate): void {
  const source = state.membership[block]!;
  const sourceGroup = state.groups.get(source)!;
  sourceGroup.members.delete(block);
  sourceGroup.nodeCount -= state.blockNodeCounts[block]!;
  sourceGroup.degree -= state.blockDegrees[block]!;
  sourceGroup.outgoing -= state.blockOutgoing[block]!;
  sourceGroup.incoming -= state.blockIncoming[block]!;
  if (sourceGroup.members.size === 0) state.groups.delete(source);
  else if (sourceGroup.min === block) sourceGroup.min = minimumSetValue(sourceGroup.members);

  const target = candidate.target < 0 ? state.nextGroupId++ : candidate.target;
  let targetGroup = state.groups.get(target);
  if (targetGroup === undefined) {
    targetGroup = { members: new Set(), min: block, nodeCount: 0, degree: 0, outgoing: 0, incoming: 0 };
    state.groups.set(target, targetGroup);
  }
  targetGroup.members.add(block);
  targetGroup.min = Math.min(targetGroup.min, block);
  targetGroup.nodeCount += state.blockNodeCounts[block]!;
  targetGroup.degree += state.blockDegrees[block]!;
  targetGroup.outgoing += state.blockOutgoing[block]!;
  targetGroup.incoming += state.blockIncoming[block]!;
  state.membership[block] = target;
  state.quality = candidate.quality;
}

function localGroupConnectedAfterRemoval(state: LocalMoveState, groupId: number, removedBlock: number): boolean {
  const group = state.groups.get(groupId)!;
  if (group.members.size <= 2) return true;
  let start = -1;
  for (const block of group.members) {
    if (block !== removedBlock) {
      start = block;
      break;
    }
  }
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const neighbor of state.crossWeights[queue[cursor]!]!.keys()) {
      if (neighbor === removedBlock || state.membership[neighbor] !== groupId || seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return seen.size === group.members.size - 1;
}

function localStateGroups(state: LocalMoveState): IndexCommunities {
  return [...state.groups.values()]
    .map((group) => [...group.members].sort((left, right) => left - right))
    .sort(compareNumberArrays);
}

function minimumSetValue(values: ReadonlySet<number>): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const value of values) minimum = Math.min(minimum, value);
  return minimum;
}

function chooseTwo(value: number): number {
  return (value * (value - 1)) / 2;
}

interface InfomapTrialResult {
  readonly communities: IndexCommunities;
  readonly score: number;
  readonly passes: number;
  readonly converged: boolean;
}

interface InfomapGroup {
  readonly members: Set<number>;
  min: number;
  visit: number;
  linkExit: number;
  teleportMass: number;
}

interface InfomapMoveState {
  readonly view: WeightedView;
  readonly flow: StationaryFlow;
  readonly membership: Int32Array;
  readonly groups: Map<number, InfomapGroup>;
  readonly outgoingFlow: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly incomingFlow: ReadonlyArray<ReadonlyMap<number, number>>;
  readonly nodeTeleportMass: Float64Array;
  nextGroupId: number;
  totalExit: number;
  quality: number;
}

interface InfomapMoveCandidate {
  readonly target: number;
  readonly quality: number;
  readonly totalExit: number;
  readonly sourceLinkExit: number;
  readonly targetLinkExit: number;
}

function optimizeInfomapTrial(
  view: WeightedView,
  flow: StationaryFlow,
  objective: QualityFunction,
  rng: RandomSource,
  tolerance: number,
  maxPasses: number,
  signal: AbortSignal | undefined,
): InfomapTrialResult {
  const communities = singletonPartition(view.order);
  const state = createInfomapMoveState(view, flow, objective(communities));
  let passes = 0;
  let converged = false;

  while (passes < maxPasses) {
    checkAborted(signal);
    let moved = false;
    const order = shuffled(Array.from({ length: view.order }, (_unused, node) => node), rng);
    for (let position = 0; position < order.length; position += 1) {
      if ((position & 0x3ff) === 0) checkAborted(signal);
      const node = order[position]!;
      const current = state.membership[node]!;
      const candidates = candidateInfomapGroups(state, node);
      if (state.groups.get(current)!.members.size > 1) candidates.add(-1);

      let best: InfomapMoveCandidate | undefined;
      for (const candidate of [...candidates].sort((left, right) => compareInfomapTargets(state, left, right))) {
        if (candidate === current) continue;
        const proposed = infomapMoveQuality(state, node, candidate);
        if (proposed.quality < (best?.quality ?? state.quality) - tolerance) {
          best = proposed;
        }
      }
      if (best !== undefined) {
        applyInfomapMove(state, node, best);
        moved = true;
      }
    }
    passes += 1;
    if (!moved) {
      converged = true;
      break;
    }
  }

  const finalCommunities = infomapStateGroups(state);
  return {
    communities: finalCommunities,
    score: objective(finalCommunities),
    passes,
    converged,
  };
}

function createInfomapMoveState(view: WeightedView, flow: StationaryFlow, quality: number): InfomapMoveState {
  const outgoingFlow = Array.from({ length: view.order }, () => new Map<number, number>());
  const incomingFlow = Array.from({ length: view.order }, () => new Map<number, number>());
  const nodeTeleportMass = new Float64Array(view.order);

  for (let source = 0; source < view.order; source += 1) {
    const visit = flow.visits[source]!;
    const strength = flow.outStrength[source]!;
    if (strength > 0) {
      const scale = (1 - flow.teleportation) * visit / strength;
      for (const [target, weight] of view.outgoing[source]!) {
        const value = scale * weight;
        addMapWeight(outgoingFlow[source]!, target, value);
        addMapWeight(incomingFlow[target]!, source, value);
      }
    }
    if (view.directed) {
      nodeTeleportMass[source] = flow.teleportation * visit + (strength === 0 ? (1 - flow.teleportation) * visit : 0);
    }
  }

  const membership = new Int32Array(view.order);
  const groups = new Map<number, InfomapGroup>();
  let totalExit = 0;
  for (let node = 0; node < view.order; node += 1) {
    membership[node] = node;
    let linkExit = 0;
    for (const [target, value] of outgoingFlow[node]!) {
      if (target !== node) linkExit += value;
    }
    const group: InfomapGroup = {
      members: new Set([node]),
      min: node,
      visit: flow.visits[node]!,
      linkExit,
      teleportMass: nodeTeleportMass[node]!,
    };
    totalExit += infomapGroupExit(view.order, group.members.size, group.linkExit, group.teleportMass);
    groups.set(node, group);
  }
  return {
    view,
    flow,
    membership,
    groups,
    outgoingFlow,
    incomingFlow,
    nodeTeleportMass,
    nextGroupId: view.order,
    totalExit,
    quality,
  };
}

function candidateInfomapGroups(state: InfomapMoveState, node: number): Set<number> {
  const candidates = new Set<number>([state.membership[node]!]);
  for (const neighbor of state.view.neighbors[node]!.keys()) candidates.add(state.membership[neighbor]!);
  return candidates;
}

function compareInfomapTargets(state: InfomapMoveState, left: number, right: number): number {
  if (left === -1) return right === -1 ? 0 : -1;
  if (right === -1) return 1;
  return state.groups.get(left)!.min - state.groups.get(right)!.min;
}

function infomapMoveQuality(state: InfomapMoveState, node: number, target: number): InfomapMoveCandidate {
  const source = state.membership[node]!;
  const sourceGroup = state.groups.get(source)!;
  const targetGroup = target < 0 ? undefined : state.groups.get(target)!;
  let outgoingTotal = 0;
  let outgoingToSource = 0;
  let outgoingToTarget = 0;
  let selfFlow = 0;
  for (const [neighbor, value] of state.outgoingFlow[node]!) {
    outgoingTotal += value;
    if (state.membership[neighbor] === source) outgoingToSource += value;
    if (state.membership[neighbor] === target) outgoingToTarget += value;
    if (neighbor === node) selfFlow += value;
  }
  let incomingFromSource = 0;
  let incomingFromTarget = 0;
  for (const [neighbor, value] of state.incomingFlow[node]!) {
    if (neighbor !== node && state.membership[neighbor] === source) incomingFromSource += value;
    if (neighbor !== node && state.membership[neighbor] === target) incomingFromTarget += value;
  }

  const sourceLinkExit = normalizeInfomapZero(
    sourceGroup.linkExit - (outgoingTotal - outgoingToSource) + incomingFromSource,
  );
  const targetLinkExit = normalizeInfomapZero(
    (targetGroup?.linkExit ?? 0) + (outgoingTotal - outgoingToTarget - selfFlow) - incomingFromTarget,
  );
  const nodeVisit = state.flow.visits[node]!;
  const nodeTeleportMass = state.nodeTeleportMass[node]!;
  const sourceExitBefore = infomapGroupExit(
    state.view.order,
    sourceGroup.members.size,
    sourceGroup.linkExit,
    sourceGroup.teleportMass,
  );
  const targetExitBefore = targetGroup === undefined
    ? 0
    : infomapGroupExit(state.view.order, targetGroup.members.size, targetGroup.linkExit, targetGroup.teleportMass);
  const sourceExitAfter = infomapGroupExit(
    state.view.order,
    sourceGroup.members.size - 1,
    sourceLinkExit,
    sourceGroup.teleportMass - nodeTeleportMass,
  );
  const targetExitAfter = infomapGroupExit(
    state.view.order,
    (targetGroup?.members.size ?? 0) + 1,
    targetLinkExit,
    (targetGroup?.teleportMass ?? 0) + nodeTeleportMass,
  );
  const totalExit = normalizeInfomapZero(
    state.totalExit - sourceExitBefore - targetExitBefore + sourceExitAfter + targetExitAfter,
  );
  const sourceVisitAfter = sourceGroup.visit - nodeVisit;
  const targetVisitBefore = targetGroup?.visit ?? 0;
  const targetVisitAfter = targetVisitBefore + nodeVisit;
  const quality = state.quality - xLog2X(state.totalExit) + xLog2X(totalExit) -
    infomapModuleTerm(sourceExitBefore, sourceGroup.visit) -
    infomapModuleTerm(targetExitBefore, targetVisitBefore) +
    infomapModuleTerm(sourceExitAfter, sourceVisitAfter) +
    infomapModuleTerm(targetExitAfter, targetVisitAfter);

  return { target, quality, totalExit, sourceLinkExit, targetLinkExit };
}

function applyInfomapMove(state: InfomapMoveState, node: number, candidate: InfomapMoveCandidate): void {
  const source = state.membership[node]!;
  const sourceGroup = state.groups.get(source)!;
  const nodeVisit = state.flow.visits[node]!;
  const nodeTeleportMass = state.nodeTeleportMass[node]!;
  sourceGroup.members.delete(node);
  sourceGroup.visit -= nodeVisit;
  sourceGroup.linkExit = candidate.sourceLinkExit;
  sourceGroup.teleportMass -= nodeTeleportMass;
  if (sourceGroup.members.size === 0) state.groups.delete(source);
  else if (sourceGroup.min === node) sourceGroup.min = minimumSetValue(sourceGroup.members);

  const target = candidate.target < 0 ? state.nextGroupId++ : candidate.target;
  let targetGroup = state.groups.get(target);
  if (targetGroup === undefined) {
    targetGroup = { members: new Set(), min: node, visit: 0, linkExit: 0, teleportMass: 0 };
    state.groups.set(target, targetGroup);
  }
  targetGroup.members.add(node);
  targetGroup.min = Math.min(targetGroup.min, node);
  targetGroup.visit += nodeVisit;
  targetGroup.linkExit = candidate.targetLinkExit;
  targetGroup.teleportMass += nodeTeleportMass;
  state.membership[node] = target;
  state.totalExit = candidate.totalExit;
  state.quality = candidate.quality;
}

function infomapStateGroups(state: InfomapMoveState): IndexCommunities {
  return [...state.groups.values()]
    .map((group) => [...group.members].sort((left, right) => left - right))
    .sort(compareNumberArrays);
}

function infomapGroupExit(order: number, size: number, linkExit: number, teleportMass: number): number {
  if (order === 0 || size === 0) return 0;
  return normalizeInfomapZero(linkExit + (1 - size / order) * teleportMass);
}

function infomapModuleTerm(exit: number, visit: number): number {
  return xLog2X(exit + visit) - 2 * xLog2X(exit);
}

function xLog2X(value: number): number {
  return value <= 0 ? 0 : value * Math.log2(value);
}

function normalizeInfomapZero(value: number): number {
  return Math.abs(value) <= 1e-15 ? 0 : value;
}

function infomapTrialRandomSources(options: InfomapOptions, trials: number): RandomSource[] {
  if (options.rng !== undefined) {
    const source = resolveRandomSource({ rng: options.rng });
    return Array.from({ length: trials }, (_unused, trial) => {
      const draw = Math.floor(source() * 0x1_0000_0000);
      return createSeededRng(`infomap:rng:${draw}:${trial}`);
    });
  }
  const seed = options.seed ?? 0;
  return Array.from({ length: trials }, (_unused, trial) => createSeededRng(`infomap:${typeof seed}:${String(seed)}:${trial}`));
}

function refineLeiden(
  view: WeightedView,
  blocks: IndexCommunities,
  parentGroups: IndexCommunities,
  qualityFunction: QualityFunction,
  qualitySpec: LocalQualitySpec,
  rng: RandomSource,
  theta: number,
  tolerance: number,
  signal: AbortSignal | undefined,
): IndexCommunities {
  const refined = singletonPartition(blocks.length);
  const state = createLocalMoveState(
    view,
    blocks,
    refined,
    qualitySpec,
    qualityFunction(groupsToOriginalCommunities(blocks, refined)),
  );
  const canonicalParents = canonicalizeBlockGroups(blocks.length, parentGroups).communities;

  for (const parent of canonicalParents) {
    const parentSet = new Set(parent);
    for (const block of shuffled(parent, rng)) {
      checkAborted(signal);
      const current = state.membership[block]!;
      // Leiden refinement only moves nodes that are still singleton refined communities.
      if (state.groups.get(current)!.members.size !== 1) continue;

      const candidates = candidateLocalGroups(state, block);
      const positive: Array<{ readonly group: number; readonly quality: number; readonly gain: number }> = [];
      for (const candidate of [...candidates].sort((left, right) => compareLocalGroupTargets(state, left, right))) {
        if (candidate === current) continue;
        if (![...state.groups.get(candidate)!.members].every((member) => parentSet.has(member))) continue;
        const proposedQuality = localMoveQuality(state, block, candidate);
        const gain = proposedQuality - state.quality;
        if (gain > tolerance) positive.push({ group: candidate, quality: proposedQuality, gain });
      }
      if (positive.length === 0) continue;

      const maxGain = Math.max(...positive.map((candidate) => candidate.gain));
      const weights = positive.map((candidate) => Math.exp((candidate.gain - maxGain) / theta));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let draw = rng() * total;
      let selected = positive[positive.length - 1]!;
      for (let index = 0; index < positive.length; index += 1) {
        draw -= weights[index]!;
        if (draw <= 0) {
          selected = positive[index]!;
          break;
        }
      }
      applyLocalMove(state, block, { target: selected.group, quality: selected.quality });
    }
  }
  return localStateGroups(state);
}

function splitDisconnectedCommunities(view: WeightedView, communities: IndexCommunities): IndexCommunities {
  const split: number[][] = [];
  for (const community of communities) {
    const allowed = new Set(community);
    const seen = new Set<number>();
    for (const start of community) {
      if (seen.has(start)) continue;
      const component: number[] = [];
      const queue = [start];
      seen.add(start);
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const node = queue[cursor]!;
        component.push(node);
        for (const neighbor of view.neighbors[node]!.keys()) {
          if (!allowed.has(neighbor) || seen.has(neighbor)) continue;
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
      split.push(component);
    }
  }
  return canonicalizeIndexCommunities(view.order, split).communities;
}

function parentGroupsForRefinement(blocks: IndexCommunities, parents: IndexCommunities): IndexCommunities {
  const order = blocks.reduce((sum, block) => sum + block.length, 0);
  const parent = canonicalizeIndexCommunities(order, parents);
  const groups = new Map<number, number[]>();
  blocks.forEach((block, blockIndex) => {
    const label = parent.membership[block[0]!]!;
    if (!block.every((node) => parent.membership[node] === label)) {
      throw new Error("internal Leiden refinement block crosses an unrefined community");
    }
    const group = groups.get(label) ?? [];
    group.push(blockIndex);
    groups.set(label, group);
  });
  return canonicalizeBlockGroups(blocks.length, [...groups.values()]).communities;
}

interface StationaryFlow {
  readonly visits: readonly number[];
  readonly teleportation: number;
  readonly outStrength: readonly number[];
}

function stationaryFlow(
  view: WeightedView,
  options: Pick<InfomapOptions, "teleportation" | "tolerance" | "maxIterations">,
): StationaryFlow {
  if (!view.directed) {
    const strengths = view.outgoing.map((row) => sumMapValues(row));
    const total = strengths.reduce((sum, value) => sum + value, 0);
    const visits = total === 0
      ? Array.from({ length: view.order }, () => (view.order === 0 ? 0 : 1 / view.order))
      : strengths.map((value) => value / total);
    return { visits, teleportation: 0, outStrength: strengths };
  }

  const teleportation = options.teleportation ?? 0.15;
  if (!Number.isFinite(teleportation) || teleportation < 0 || teleportation >= 1) {
    throw new RangeError("teleportation must be finite and in [0, 1)");
  }
  const tolerance = positiveFinite(options.tolerance ?? 1e-12, "tolerance");
  const maxIterations = positiveInteger(options.maxIterations ?? 1_000, "maxIterations");
  const n = view.order;
  if (n === 0) return { visits: [], teleportation, outStrength: [] };
  const outStrength = view.outgoing.map((row) => sumMapValues(row));
  let visits = Array.from({ length: n }, () => 1 / n);
  let converged = false;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const next = Array.from({ length: n }, () => teleportation / n);
    let dangling = 0;
    for (let source = 0; source < n; source += 1) {
      const strength = outStrength[source]!;
      if (strength === 0) {
        dangling += visits[source]!;
        continue;
      }
      const scale = (1 - teleportation) * visits[source]! / strength;
      for (const [target, weight] of view.outgoing[source]!) next[target] = next[target]! + scale * weight;
    }
    const danglingShare = (1 - teleportation) * dangling / n;
    let difference = 0;
    for (let node = 0; node < n; node += 1) {
      next[node] = next[node]! + danglingShare;
      difference += Math.abs(next[node]! - visits[node]!);
    }
    visits = next;
    if (difference <= tolerance) {
      converged = true;
      break;
    }
  }
  if (!converged) throw new Error(`Infomap stationary flow did not converge within ${maxIterations} iterations`);
  return { visits, teleportation, outStrength };
}

function mapEquationOf(view: WeightedView, communitiesInput: IndexCommunities, flow: StationaryFlow): number {
  const canonical = canonicalizeIndexCommunities(view.order, communitiesInput);
  if (view.order === 0) return 0;
  const exits = Array.from({ length: canonical.communities.length }, () => 0);

  for (let label = 0; label < canonical.communities.length; label += 1) {
    const community = canonical.communities[label]!;
    const size = community.length;
    for (const source of community) {
      const sourceVisit = flow.visits[source]!;
      const outStrength = flow.outStrength[source]!;
      if (outStrength > 0) {
        const linkScale = (1 - flow.teleportation) * sourceVisit / outStrength;
        for (const [target, weight] of view.outgoing[source]!) {
          if (canonical.membership[target] !== label) exits[label] = exits[label]! + linkScale * weight;
        }
      } else if (view.directed) {
        exits[label] = exits[label]! + (1 - flow.teleportation) * sourceVisit * (1 - size / view.order);
      }
      if (view.directed && flow.teleportation > 0) {
        exits[label] = exits[label]! + flow.teleportation * sourceVisit * (1 - size / view.order);
      }
    }
  }

  const totalExit = exits.reduce((sum, value) => sum + value, 0);
  let codeLength = weightedEntropy(exits, totalExit);
  for (let label = 0; label < canonical.communities.length; label += 1) {
    const weights = [exits[label]!, ...canonical.communities[label]!.map((node) => flow.visits[node]!)];
    const total = weights.reduce((sum, value) => sum + value, 0);
    codeLength += weightedEntropy(weights, total);
  }
  return codeLength;
}

function weightedEntropy(weights: readonly number[], total: number): number {
  if (total <= 0) return 0;
  let value = total * Math.log2(total);
  for (const weight of weights) {
    if (weight > 0) value -= weight * Math.log2(weight);
  }
  return value;
}

function sumMapValues(map: ReadonlyMap<number, number>): number {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

function undirectedComponents(view: WeightedView, active: readonly boolean[]): IndexCommunities {
  const adjacency = Array.from({ length: view.order }, () => [] as number[]);
  view.edges.forEach((edge, edgeIndex) => {
    if (!active[edgeIndex] || edge.source === edge.target) return;
    adjacency[edge.source]!.push(edge.target);
    adjacency[edge.target]!.push(edge.source);
  });
  const seen = new Uint8Array(view.order);
  const communities: number[][] = [];
  for (let start = 0; start < view.order; start += 1) {
    if (seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    const component: number[] = [];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor]!;
      component.push(node);
      for (const next of adjacency[node]!) {
        if (seen[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    communities.push(component);
  }
  return canonicalizeIndexCommunities(view.order, communities).communities;
}

interface IncidentEdge {
  readonly neighbor: number;
  readonly edge: number;
  readonly distance: number;
}

function edgeBetweenness(
  view: WeightedView,
  active: readonly boolean[],
  weighted: boolean,
  signal: AbortSignal | undefined,
): number[] {
  const incident = Array.from({ length: view.order }, () => [] as IncidentEdge[]);
  view.edges.forEach((edge, edgeIndex) => {
    if (!active[edgeIndex] || edge.source === edge.target) return;
    const distance = weighted ? edge.weight : 1;
    incident[edge.source]!.push({ neighbor: edge.target, edge: edgeIndex, distance });
    incident[edge.target]!.push({ neighbor: edge.source, edge: edgeIndex, distance });
  });
  const scores = Array.from({ length: view.edges.length }, () => 0);

  for (let source = 0; source < view.order; source += 1) {
    checkAborted(signal);
    const stack: number[] = [];
    const predecessors = Array.from({ length: view.order }, () => [] as IncidentEdge[]);
    const sigma = Array.from({ length: view.order }, () => 0);
    const distance = Array.from({ length: view.order }, () => Number.POSITIVE_INFINITY);
    sigma[source] = 1;
    distance[source] = 0;

    if (weighted) {
      const settled = new Uint8Array(view.order);
      for (let step = 0; step < view.order; step += 1) {
        let vertex = -1;
        let best = Number.POSITIVE_INFINITY;
        for (let candidate = 0; candidate < view.order; candidate += 1) {
          if (!settled[candidate] && distance[candidate]! < best) {
            best = distance[candidate]!;
            vertex = candidate;
          }
        }
        if (vertex < 0) break;
        settled[vertex] = 1;
        stack.push(vertex);
        for (const edge of incident[vertex]!) {
          const alternate = distance[vertex]! + edge.distance;
          const comparison = comparePathDistances(alternate, distance[edge.neighbor]!);
          if (comparison < 0) {
            distance[edge.neighbor] = alternate;
            sigma[edge.neighbor] = sigma[vertex]!;
            predecessors[edge.neighbor] = [{ neighbor: vertex, edge: edge.edge, distance: edge.distance }];
          } else if (comparison === 0 && Number.isFinite(alternate)) {
            sigma[edge.neighbor] = sigma[edge.neighbor]! + sigma[vertex]!;
            predecessors[edge.neighbor]!.push({ neighbor: vertex, edge: edge.edge, distance: edge.distance });
          }
        }
      }
    } else {
      const queue = [source];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const vertex = queue[cursor]!;
        stack.push(vertex);
        for (const edge of incident[vertex]!) {
          if (!Number.isFinite(distance[edge.neighbor]!)) {
            distance[edge.neighbor] = distance[vertex]! + 1;
            queue.push(edge.neighbor);
          }
          if (distance[edge.neighbor] === distance[vertex]! + 1) {
            sigma[edge.neighbor] = sigma[edge.neighbor]! + sigma[vertex]!;
            predecessors[edge.neighbor]!.push({ neighbor: vertex, edge: edge.edge, distance: 1 });
          }
        }
      }
    }

    const dependency = Array.from({ length: view.order }, () => 0);
    while (stack.length > 0) {
      const vertex = stack.pop()!;
      for (const predecessor of predecessors[vertex]!) {
        if (sigma[vertex] === 0) continue;
        const contribution = (sigma[predecessor.neighbor]! / sigma[vertex]!) * (1 + dependency[vertex]!);
        scores[predecessor.edge] = scores[predecessor.edge]! + contribution;
        dependency[predecessor.neighbor] = dependency[predecessor.neighbor]! + contribution;
      }
    }
  }
  return scores.map((score) => score / 2);
}

function comparePathDistances(left: number, right: number): number {
  if (left === right) return 0;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return left < right ? -1 : 1;
  const scale = Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
  const tolerance = PATH_DISTANCE_RELATIVE_TOLERANCE * scale;
  if (Math.abs(left - right) <= tolerance) return 0;
  return left < right ? -1 : 1;
}

function maximalCliques(
  view: WeightedView,
  minimumSize: number,
  maxCliques: number,
  options: KCliqueOptions,
): number[][] {
  const adjacency = Array.from({ length: view.order }, () => new Set<number>());
  for (const edge of view.edges) {
    if (edge.source === edge.target) continue;
    adjacency[edge.source]!.add(edge.target);
    adjacency[edge.target]!.add(edge.source);
  }
  const cliques: number[][] = [];
  let enumerated = 0;

  function visit(r: Set<number>, p: Set<number>, x: Set<number>): void {
    checkAborted(options.signal);
    if (p.size === 0 && x.size === 0) {
      enumerated += 1;
      if (enumerated > maxCliques) {
        throw new RangeError(`maximal clique count exceeded maxCliques (${maxCliques})`);
      }
      if (r.size >= minimumSize) cliques.push([...r].sort((left, right) => left - right));
      options.onProgress?.(enumerated, maxCliques);
      return;
    }
    if (r.size + p.size < minimumSize) return;

    let pivot = -1;
    let pivotNeighbors = -1;
    for (const candidate of [...p, ...x].sort((left, right) => left - right)) {
      let count = 0;
      for (const node of p) if (adjacency[candidate]!.has(node)) count += 1;
      if (count > pivotNeighbors) {
        pivot = candidate;
        pivotNeighbors = count;
      }
    }
    const candidates = [...p]
      .filter((node) => pivot < 0 || !adjacency[pivot]!.has(node))
      .sort((left, right) => left - right);
    for (const node of candidates) {
      const nextR = new Set(r);
      nextR.add(node);
      visit(nextR, setIntersection(p, adjacency[node]!), setIntersection(x, adjacency[node]!));
      p.delete(node);
      x.add(node);
    }
  }

  visit(new Set<number>(), new Set(Array.from({ length: view.order }, (_unused, node) => node)), new Set<number>());
  return cliques.sort(compareNumberArrays);
}

function setIntersection(left: ReadonlySet<number>, right: ReadonlySet<number>): Set<number> {
  const intersection = new Set<number>();
  for (const value of left) if (right.has(value)) intersection.add(value);
  return intersection;
}

function intersectionSize(left: readonly number[], right: readonly number[]): number {
  let leftIndex = 0;
  let rightIndex = 0;
  let size = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftValue = left[leftIndex]!;
    const rightValue = right[rightIndex]!;
    if (leftValue === rightValue) {
      size += 1;
      leftIndex += 1;
      rightIndex += 1;
    } else if (leftValue < rightValue) leftIndex += 1;
    else rightIndex += 1;
  }
  return size;
}

function partitionResult(
  view: WeightedView,
  communitiesInput: IndexCommunities,
  quality: PartitionResult["quality"],
  meta: AnalysisMeta,
): PartitionResult {
  const canonical = canonicalizeIndexCommunities(view.order, communitiesInput);
  return {
    nodes: [...view.nodeIds],
    membership: canonical.membership,
    communities: canonical.communities.map((community) => community.map((node) => view.nodeIds[node]!)),
    quality,
    meta,
  };
}

function communityCoverResult(
  view: WeightedView,
  communitiesInput: IndexCommunities,
  meta: AnalysisMeta,
): CommunityCoverResult {
  const communities = communitiesInput
    .filter((community) => community.length > 0)
    .map((community) => [...new Set(community)].sort((left, right) => left - right))
    .sort(compareNumberArrays);
  const memberships = Array.from({ length: view.order }, () => [] as number[]);
  communities.forEach((community, label) => {
    for (const node of community) memberships[node]!.push(label);
  });
  return {
    nodes: [...view.nodeIds],
    memberships,
    communities: communities.map((community) => community.map((node) => view.nodeIds[node]!)),
    meta,
  };
}

interface MetaDetails {
  readonly exact: boolean;
  readonly weighted?: boolean;
  readonly seed?: number | string;
  readonly converged?: boolean;
  readonly iterations?: number;
  readonly partial?: boolean;
  readonly approximate?: boolean;
  readonly valueSemantics?: AnalysisMeta["valueSemantics"];
  readonly warnings?: readonly string[];
}

function analysisMeta(algorithm: string, view: WeightedView, details: MetaDetails): AnalysisMeta {
  return {
    algorithm,
    directed: view.directed,
    weighted: details.weighted ?? true,
    valueSemantics: details.valueSemantics ?? "strength",
    exact: details.exact,
    warnings: [...(details.warnings ?? [])],
    ...(details.seed === undefined ? {} : { seed: details.seed }),
    ...(details.converged === undefined ? {} : { converged: details.converged }),
    ...(details.iterations === undefined ? {} : { iterations: details.iterations }),
    ...(details.partial === undefined ? {} : { partial: details.partial }),
    ...(details.approximate === undefined ? {} : { approximate: details.approximate }),
  };
}

function deterministicRng(options: RandomOptions): RandomSource {
  if (options.rng !== undefined) return resolveRandomSource({ rng: options.rng });
  return resolveRandomSource({ seed: options.seed ?? 0 });
}

function reportedSeed(options: RandomOptions): number | string | undefined {
  return options.rng === undefined ? (options.seed ?? 0) : undefined;
}

function requireUndirected(view: WeightedView, algorithm: string): void {
  if (view.directed) throw new RangeError(`${algorithm} only supports undirected graphs`);
}

function positiveResolution(value: number | undefined): number {
  return positiveFinite(value ?? 1, "resolution");
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and > 0`);
  return value;
}

function nonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be finite and >= 0`);
  return value;
}

function aliasedNonNegativeFinite(
  preferred: number | undefined,
  alias: number | undefined,
  fallback: number,
  preferredLabel: string,
  aliasLabel: string,
): number {
  assertCompatibleAliases(preferred, alias, preferredLabel, aliasLabel);
  return nonNegativeFinite(preferred ?? alias ?? fallback, preferredLabel);
}

function aliasedPositiveFinite(
  preferred: number | undefined,
  alias: number | undefined,
  fallback: number,
  preferredLabel: string,
  aliasLabel: string,
): number {
  assertCompatibleAliases(preferred, alias, preferredLabel, aliasLabel);
  return positiveFinite(preferred ?? alias ?? fallback, preferredLabel);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer`);
  return value;
}

function aliasedPositiveInteger(
  preferred: number | undefined,
  alias: number | undefined,
  fallback: number,
  preferredLabel: string,
  aliasLabel: string,
): number {
  assertCompatibleAliases(preferred, alias, preferredLabel, aliasLabel);
  return positiveInteger(preferred ?? alias ?? fallback, preferredLabel);
}

function assertCompatibleAliases(
  preferred: number | undefined,
  alias: number | undefined,
  preferredLabel: string,
  aliasLabel: string,
): void {
  if (preferred !== undefined && alias !== undefined && preferred !== alias) {
    throw new RangeError(`${preferredLabel} and deprecated ${aliasLabel} must match when both are provided`);
  }
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`);
  return value;
}
