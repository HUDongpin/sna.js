import type { CancellationOptions } from "../core/cancellation";
import type { GraphInput, GraphMode } from "../core/types";

/** Stable public identity for a node in the modern graph APIs. */
export type NodeId = string | number;

export type GraphAttribute = string | number | boolean | null;

/** JSON-safe scalar metadata carried through sparse normalization. */
export type GraphAttributes = Readonly<Record<string, GraphAttribute>>;

export interface GraphNode<Id extends NodeId = NodeId> {
  readonly id: Id;
  readonly attributes?: GraphAttributes;
}

export interface GraphEdge<Id extends NodeId = NodeId> {
  readonly source: Id;
  readonly target: Id;
  /** Edge strength. Defaults to 1. */
  readonly weight?: number;
  readonly attributes?: GraphAttributes;
}

type TypedArrayMutator = "copyWithin" | "fill" | "reverse" | "set" | "sort";

/** Read-only TypeScript view over compact Uint32 storage. */
export type ReadonlyUint32Array = Omit<Uint32Array, TypedArrayMutator> & { readonly [index: number]: number };

/** Read-only TypeScript view over compact Float64 storage. */
export type ReadonlyFloat64Array = Omit<Float64Array, TypedArrayMutator> & { readonly [index: number]: number };

/** Attribute-preserving input for the modern sparse graph API. */
export interface GraphData<Id extends NodeId = NodeId> {
  /** Explicit, stable node order. Every edge endpoint must be declared here. */
  readonly nodes: ReadonlyArray<GraphNode<Id>>;
  readonly edges: ReadonlyArray<GraphEdge<Id>>;
  /** Modern graph direction is always explicit. */
  readonly directed: boolean;
  readonly attributes?: GraphAttributes;
}

/** Compressed sparse adjacency. CSR stores outgoing and CSC incoming arcs. */
export interface SparseAdjacency {
  readonly offsets: ReadonlyUint32Array;
  readonly indices: ReadonlyUint32Array;
  readonly weights: ReadonlyFloat64Array;
  /** Index into the logical edge arrays on {@link SparseGraph}. */
  readonly edgeIds: ReadonlyUint32Array;
}

/**
 * Attribute-preserving O(n + m) graph representation. Undirected logical
 * edges occur once in the edge arrays and in both directions in CSR/CSC
 * (except self-loops, which occur once).
 */
export interface SparseGraph<Id extends NodeId = NodeId> {
  readonly kind: "sparse";
  readonly order: number;
  /** Number of logical edges (not doubled for undirected adjacency). */
  readonly size: number;
  readonly directed: boolean;
  readonly loops: boolean;
  readonly nodeIds: readonly Id[];
  readonly nodeAttributes: readonly GraphAttributes[];
  readonly attributes: GraphAttributes;
  readonly edgeSources: ReadonlyUint32Array;
  readonly edgeTargets: ReadonlyUint32Array;
  readonly edgeWeights: ReadonlyFloat64Array;
  readonly edgeAttributes: readonly GraphAttributes[];
  readonly csr: SparseAdjacency;
  readonly csc: SparseAdjacency;
}

export type ModernGraphInput<Id extends NodeId = NodeId> = GraphInput | GraphData<Id> | SparseGraph<Id>;

export type DuplicateEdgePolicy = "reject" | "sum" | "max" | "first" | "last";

export interface MakeSparseGraphOptions {
  /** Explicit direction override. */
  readonly directed?: boolean;
  /** Legacy direction alias used when `directed` is absent. */
  readonly mode?: GraphMode;
  /** Preserve self-loops. Defaults to true for the modern, lossless input path. */
  readonly loops?: boolean;
  /** Legacy alias for `loops`. */
  readonly diag?: boolean;
  /** Legacy edge-list index base override. */
  readonly indexBase?: 0 | 1;
  /** Duplicate logical-edge resolution. Defaults to `reject`. */
  readonly duplicateEdges?: DuplicateEdgePolicy;
}

export type ValueSemantics = "binary" | "strength" | "distance";

/** Common provenance and completion metadata for modern analyses. */
export interface AnalysisMeta {
  readonly algorithm: string;
  readonly directed: boolean;
  readonly weighted: boolean;
  readonly valueSemantics: ValueSemantics;
  readonly exact: boolean;
  readonly warnings: readonly string[];
  readonly approximate?: boolean;
  readonly converged?: boolean;
  readonly iterations?: number;
  readonly partial?: boolean;
  readonly seed?: string | number;
}

export interface NodeScoreResult<TValue extends number | null = number> {
  readonly nodes: readonly NodeId[];
  readonly values: readonly TValue[];
  readonly meta: AnalysisMeta;
}

export type NullableNodeScoreResult = NodeScoreResult<number | null>;

export interface ScalarResult<TValue extends number | null = number> {
  readonly value: TValue;
  readonly meta: AnalysisMeta;
}

export interface HitsResult {
  readonly nodes: readonly NodeId[];
  readonly hubs: readonly number[];
  readonly authorities: readonly number[];
  readonly meta: AnalysisMeta;
}

export interface PairScore {
  readonly source: NodeId;
  readonly target: NodeId;
  readonly score: number;
}

export interface PairScoreResult {
  readonly pairs: readonly PairScore[];
  readonly meta: AnalysisMeta;
}

export interface PartitionResult {
  readonly nodes: readonly NodeId[];
  readonly membership: readonly number[];
  /** Communities contain node identities in stable community order. */
  readonly communities: ReadonlyArray<ReadonlyArray<NodeId>>;
  readonly quality: Readonly<{
    readonly modularity?: number;
    readonly cpm?: number;
    readonly codeLength?: number;
    readonly coverage?: number;
    readonly performance?: number;
  }>;
  readonly meta: AnalysisMeta;
}

export interface CommunityCoverResult {
  readonly nodes: readonly NodeId[];
  readonly memberships: readonly (readonly number[])[];
  readonly communities: readonly (readonly NodeId[])[];
  readonly meta: AnalysisMeta;
}

export interface MixingMatrixResult {
  readonly labels: readonly (string | number)[];
  readonly values: readonly (readonly number[])[];
  readonly meta: AnalysisMeta;
}

/** Dense vectors or identity-safe per-node weights used by iterative methods. */
export type NodeWeightInput = ReadonlyArray<number> | ReadonlyMap<NodeId, number> | ReadonlyArray<readonly [NodeId, number]>;

export interface IterativeAnalysisOptions extends MakeSparseGraphOptions, CancellationOptions {
  readonly tolerance?: number;
  readonly maxIterations?: number;
  /** Return the last iterate with `meta.partial=true` instead of throwing. */
  readonly allowPartial?: boolean;
}
