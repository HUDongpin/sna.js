import { makeDenseGraph } from "../core/graph";
import { createNumberMatrix } from "../core/matrix";
import type { DenseGraph, EdgeListInput, GeodistResult, GraphInput, GraphMode, GraphOptions } from "../core/types";
import { asEdgelistSna } from "./dataprep";
import { edmondsKarpMaxFlow } from "./flow";
import { geodist } from "./geodist";

export type CutpointConnectedness = "strong" | "weak" | "recursive";

export interface CutpointsOptions extends GraphOptions {
  readonly connected?: CutpointConnectedness;
  readonly returnIndicator?: boolean;
}

export type BicomponentSymmetrizeRule = "strong" | "weak";

export interface BicomponentDistOptions extends GraphOptions {
  readonly symmetrize?: BicomponentSymmetrizeRule;
}

export interface BicomponentDistResult {
  readonly members: number[][];
  readonly membership: Array<number | null>;
  readonly csize: number[];
  readonly cdist: number[];
}

export type KcoreMode = "indegree" | "outdegree" | "freeman";

export interface KCoresOptions extends GraphOptions {
  readonly cmode?: KcoreMode;
}

export type ComembershipMode = "none" | "sum" | "bysize" | "bylength";

export interface CliqueCensusOptions extends GraphOptions {
  readonly tabulateByVertex?: boolean;
  readonly cliqueComembership?: "none" | "sum" | "bysize";
  readonly enumerate?: boolean;
  readonly naOmit?: boolean;
}

export interface CliqueCensusResult {
  readonly cliqueCount: number[] | number[][];
  readonly cliqueComemb?: number[][] | number[][][];
  readonly cliques?: number[][][];
}

export interface KPathCensusOptions extends GraphOptions {
  readonly maxlen?: number | null;
  readonly tabulateByVertex?: boolean;
  readonly pathComembership?: "none" | "sum" | "bylength";
  readonly dyadicTabulation?: "none" | "sum" | "bylength";
}

export interface KPathCensusResult {
  readonly pathCount: number[] | number[][];
  readonly pathComemb?: number[][] | number[][][];
  readonly pathsByDyad?: number[][] | number[][][];
}

export interface KCycleCensusOptions extends GraphOptions {
  readonly maxlen?: number | null;
  readonly tabulateByVertex?: boolean;
  readonly cycleComembership?: "none" | "sum" | "bylength";
}

export interface KCycleCensusResult {
  readonly cycleCount: number[] | number[][];
  readonly cycleComemb?: number[][] | number[][][];
}

export interface MaxflowOptions extends GraphOptions {
  readonly src?: number | readonly number[];
  readonly sink?: number | readonly number[];
}

export interface SimmelianOptions extends GraphOptions {
  readonly dichotomize?: boolean;
  readonly returnAsEdgeList?: boolean;
}

export interface StructureStatisticsOptions extends GraphOptions {
  readonly geodistPrecomp?: GeodistResult;
}

type AdjacencyList = number[][];
type Edge = readonly [number, number];

export function cutpoints(input: GraphInput, options: CutpointsOptions & { returnIndicator: true }): boolean[];
export function cutpoints(input: GraphInput, options?: CutpointsOptions & { returnIndicator?: false }): number[];
export function cutpoints(input: GraphInput, options: CutpointsOptions = {}): number[] | boolean[] {
  const mode = options.mode ?? "digraph";
  const connected = options.connected ?? "strong";
  const graph = makeDenseGraph(input, { ...options, mode: "digraph", diag: false });

  let indicator: boolean[];
  if (mode === "graph" || connected === "weak" || connected === "recursive") {
    const rule: BicomponentSymmetrizeRule = mode === "graph" || connected === "weak" ? "weak" : "strong";
    indicator = undirectedCutpointIndicators(symmetrizedAdjacency(graph, rule));
  } else {
    indicator = directedStrongCutpointIndicators(graph);
  }

  return options.returnIndicator ? indicator : indicator.flatMap((value, vertex) => (value ? [vertex] : []));
}

export function bicomponentDist(input: GraphInput, options: BicomponentDistOptions = {}): BicomponentDistResult {
  const graph = makeDenseGraph(input, { ...options, mode: "digraph", diag: false });
  const adj = symmetrizedAdjacency(graph, options.symmetrize ?? "strong");
  const members = biconnectedComponents(adj).sort((a, b) => b.length - a.length);
  const membership: Array<number | null> = Array.from({ length: graph.order }, () => null);

  members.forEach((component, index) => {
    for (const vertex of component) {
      if (membership[vertex] === null) membership[vertex] = index;
    }
  });

  const csize = members.map((component) => component.length);
  const cdist = Array.from({ length: graph.order }, () => 0);
  for (const size of csize) cdist[size - 1] = (cdist[size - 1] ?? 0) + 1;

  return { members, membership, csize, cdist };
}

export function kcores(input: GraphInput, options: KCoresOptions = {}): number[] {
  const graph = makeDenseGraph(input, { ...options, diag: false });
  const mode = graph.directed ? (options.cmode ?? "freeman") : "indegree";
  if (!["indegree", "outdegree", "freeman"].includes(mode)) throw new RangeError("illegal cmode in kcores");
  const ignoreEval = options.ignoreEval ?? false;

  const n = graph.order;
  const remaining = new Uint8Array(n);
  remaining.fill(1);
  const stat = Array.from({ length: n }, (_unused, vertex) => kcoreStat(graph, vertex, remaining, mode, ignoreEval));
  const core = Array.from({ length: n }, () => 0);

  for (let removed = 0; removed < n; removed += 1) {
    let vertex = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < n; candidate += 1) {
      if (!remaining[candidate]) continue;
      if (stat[candidate]! < best) {
        best = stat[candidate]!;
        vertex = candidate;
      }
    }
    if (vertex === -1) break;
    core[vertex] = best;
    remaining[vertex] = 0;

    for (let candidate = 0; candidate < n; candidate += 1) {
      if (!remaining[candidate]) continue;
      const updated = kcoreStat(graph, candidate, remaining, mode, ignoreEval);
      stat[candidate] = Math.max(updated, best);
    }
  }

  return core;
}

export function cliqueCensus(input: GraphInput, options: CliqueCensusOptions = {}): CliqueCensusResult {
  const graph = makeDenseGraph(input, { ...options, mode: "digraph", diag: false });
  const mode = options.mode ?? "digraph";
  const adj = cliqueAdjacency(graph, mode, options.naOmit ?? true);
  const cliques = enumerateMaximalCliques(adj).map((clique) => [...clique].sort((a, b) => a - b));
  const maxSize = cliques.reduce((max, clique) => Math.max(max, clique.length), 0);
  const tabulateByVertex = options.tabulateByVertex ?? true;
  const comembership = options.cliqueComembership ?? "none";
  const enumerate = options.enumerate ?? true;

  const cliqueCount = tabulateByVertex ? createNumberMatrix(maxSize, graph.order + 1) : Array.from({ length: maxSize }, () => 0);
  for (const clique of cliques) {
    const row = clique.length - 1;
    if (tabulateByVertex) {
      const rowCounts = (cliqueCount as number[][])[row]!;
      rowCounts[0] = (rowCounts[0] ?? 0) + 1;
      for (const vertex of clique) rowCounts[vertex + 1] = (rowCounts[vertex + 1] ?? 0) + 1;
    } else {
      (cliqueCount as number[])[row] = ((cliqueCount as number[])[row] ?? 0) + 1;
    }
  }

  const result: { cliqueCount: number[] | number[][]; cliqueComemb?: number[][] | number[][][]; cliques?: number[][][] } = { cliqueCount };
  if (comembership !== "none") result.cliqueComemb = tabulateComembership(cliques, graph.order, maxSize, comembership === "bysize");
  if (enumerate) result.cliques = groupSubgraphsBySize(cliques, maxSize);
  return result;
}

export function kpathCensus(input: GraphInput, options: KPathCensusOptions = {}): KPathCensusResult {
  const graph = makeDenseGraph(input, { ...options, diag: false });
  const maxlen = options.maxlen === null ? Math.max(graph.order - 1, 0) : (options.maxlen ?? 3);
  if (!Number.isInteger(maxlen) || maxlen < 1) throw new RangeError("maxlen must be >= 1");

  const directed = (options.mode ?? "digraph") !== "graph";
  const paths = enumerateSimplePaths(pathAdjacency(graph, directed), maxlen, directed);
  const tabulateByVertex = options.tabulateByVertex ?? true;
  const pathComembership = options.pathComembership ?? "none";
  const dyadicTabulation = options.dyadicTabulation ?? "none";
  const pathCount = tabulateByVertex ? createNumberMatrix(maxlen, graph.order + 1) : Array.from({ length: maxlen }, () => 0);

  for (const path of paths) {
    const row = path.length - 2;
    if (tabulateByVertex) {
      const rowCounts = (pathCount as number[][])[row]!;
      rowCounts[0] = (rowCounts[0] ?? 0) + 1;
      for (const vertex of path) rowCounts[vertex + 1] = (rowCounts[vertex + 1] ?? 0) + 1;
    } else {
      (pathCount as number[])[row] = ((pathCount as number[])[row] ?? 0) + 1;
    }
  }

  const result: { pathCount: number[] | number[][]; pathComemb?: number[][] | number[][][]; pathsByDyad?: number[][] | number[][][] } = { pathCount };
  if (pathComembership !== "none") result.pathComemb = tabulateComembership(paths, graph.order, maxlen, pathComembership === "bylength", (path) => path.length - 2);
  if (dyadicTabulation !== "none") result.pathsByDyad = tabulatePathDyads(paths, graph.order, maxlen, dyadicTabulation === "bylength", directed);
  return result;
}

export function kcycleCensus(input: GraphInput, options: KCycleCensusOptions = {}): KCycleCensusResult {
  const graph = makeDenseGraph(input, { ...options, diag: false });
  const maxlen = options.maxlen === null ? graph.order : (options.maxlen ?? 3);
  if (!Number.isInteger(maxlen) || maxlen < 2) throw new RangeError("maxlen must be >= 2");

  const directed = (options.mode ?? "digraph") !== "graph";
  const cycles = enumerateSimpleCycles(pathAdjacency(graph, directed), maxlen, directed);
  const tabulateByVertex = options.tabulateByVertex ?? true;
  const cycleComembership = options.cycleComembership ?? "none";
  const rows = maxlen - 1;
  const cycleCount = tabulateByVertex ? createNumberMatrix(rows, graph.order + 1) : Array.from({ length: rows }, () => 0);

  for (const cycle of cycles) {
    const row = cycle.length - 2;
    if (tabulateByVertex) {
      const rowCounts = (cycleCount as number[][])[row]!;
      rowCounts[0] = (rowCounts[0] ?? 0) + 1;
      for (const vertex of cycle) rowCounts[vertex + 1] = (rowCounts[vertex + 1] ?? 0) + 1;
    } else {
      (cycleCount as number[])[row] = ((cycleCount as number[])[row] ?? 0) + 1;
    }
  }

  const result: { cycleCount: number[] | number[][]; cycleComemb?: number[][] | number[][][] } = { cycleCount };
  if (cycleComembership !== "none") result.cycleComemb = tabulateComembership(cycles, graph.order, rows, cycleComembership === "bylength", (cycle) => cycle.length - 2);
  return result;
}

export function maxflow(input: GraphInput, options: MaxflowOptions = {}): number | number[][] {
  const graph = makeDenseGraph(input, { ...options, diag: false });
  const sources = normalizeVertexSelection(options.src, graph.order);
  const sinks = normalizeVertexSelection(options.sink, graph.order);
  const out = sources.map((source) => sinks.map((sink) => edmondsKarpMaxFlow(graph, source, sink, options.ignoreEval ?? false)));
  return sources.length * sinks.length === 1 ? out[0]![0]! : out;
}

export function simmelian(input: GraphInput, options: SimmelianOptions & { returnAsEdgeList: true }): EdgeListInput;
export function simmelian(input: GraphInput, options?: SimmelianOptions & { returnAsEdgeList?: false }): number[][];
export function simmelian(input: GraphInput, options: SimmelianOptions = {}): number[][] | EdgeListInput {
  const graph = makeDenseGraph(input, { ...options, mode: "digraph", diag: false });
  const adj = symmetrizedAdjacency(graph, "strong");
  const matrix = createNumberMatrix(graph.order, graph.order);

  for (let i = 0; i < graph.order; i += 1) {
    for (let j = i + 1; j < graph.order; j += 1) {
      if (!adj[i]!.includes(j)) continue;
      let shared = 0;
      for (const k of adj[i]!) {
        if (k !== j && adj[j]!.includes(k)) shared += 1;
      }
      const value = options.dichotomize ?? true ? (shared > 0 ? 1 : 0) : shared;
      matrix[i]![j] = value;
      matrix[j]![i] = value;
    }
  }

  return options.returnAsEdgeList ? (asEdgelistSna(matrix) as EdgeListInput) : matrix;
}

export function structureStatistics(input: GraphInput, options: StructureStatisticsOptions = {}): number[] {
  const graph = makeDenseGraph(input, options);
  const distances = options.geodistPrecomp?.distances ?? geodist(graph, options).distances;
  const out: number[] = [];
  const denominator = graph.order * graph.order;

  for (let cutoff = 0; cutoff < graph.order; cutoff += 1) {
    let count = 0;
    for (let i = 0; i < graph.order; i += 1) {
      for (let j = 0; j < graph.order; j += 1) {
        if ((distances[i]?.[j] ?? Number.POSITIVE_INFINITY) <= cutoff) count += 1;
      }
    }
    out.push(denominator === 0 ? Number.NaN : count / denominator);
  }

  return out;
}

function directedStrongCutpointIndicators(graph: DenseGraph): boolean[] {
  const n = graph.order;
  const base = strongComponentCount(graph, -1);
  return Array.from({ length: n }, (_unused, removed) => strongComponentCount(graph, removed) > base);
}

function strongComponentCount(graph: DenseGraph, removed: number): number {
  const n = graph.order;
  const index = Array.from({ length: n }, () => -1);
  const lowlink = Array.from({ length: n }, () => 0);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  let nextIndex = 0;
  let count = 0;

  const visit = (start: number): void => {
    const frames: Array<{ vertex: number; next: number }> = [{ vertex: start, next: 0 }];
    index[start] = nextIndex;
    lowlink[start] = nextIndex;
    nextIndex += 1;
    stack.push(start);
    onStack[start] = 1;

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const vertex = frame.vertex;
      let advanced = false;
      for (; frame.next < n; frame.next += 1) {
        const next = frame.next;
        if (next === removed || !hasDirectedTie(graph, vertex, next)) continue;
        if (index[next] === -1) {
          frame.next += 1;
          index[next] = nextIndex;
          lowlink[next] = nextIndex;
          nextIndex += 1;
          stack.push(next);
          onStack[next] = 1;
          frames.push({ vertex: next, next: 0 });
          advanced = true;
          break;
        }
        if (onStack[next]) lowlink[vertex] = Math.min(lowlink[vertex]!, index[next]!);
      }
      if (advanced) continue;

      frames.pop();
      if (frames.length > 0) {
        const parent = frames[frames.length - 1]!.vertex;
        lowlink[parent] = Math.min(lowlink[parent]!, lowlink[vertex]!);
      }
      if (lowlink[vertex] === index[vertex]) {
        while (true) {
          const member = stack.pop();
          if (member === undefined) throw new Error("internal Tarjan stack underflow");
          onStack[member] = 0;
          if (member === vertex) break;
        }
        count += 1;
      }
    }
  };

  for (let vertex = 0; vertex < n; vertex += 1) {
    if (vertex !== removed && index[vertex] === -1) visit(vertex);
  }
  return count;
}

function undirectedCutpointIndicators(adj: AdjacencyList): boolean[] {
  const n = adj.length;
  const visited = new Uint8Array(n);
  const disc = Array.from({ length: n }, () => 0);
  const low = Array.from({ length: n }, () => 0);
  const parent = Array.from({ length: n }, () => -1);
  const cut = Array.from({ length: n }, () => false);
  let time = 0;

  for (let root = 0; root < n; root += 1) {
    if (visited[root]) continue;
    let rootChildren = 0;
    const stack: Array<{ vertex: number; nextIndex: number }> = [{ vertex: root, nextIndex: 0 }];
    visited[root] = 1;
    disc[root] = time;
    low[root] = time;
    time += 1;

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const vertex = frame.vertex;
      if (frame.nextIndex < adj[vertex]!.length) {
        const next = adj[vertex]![frame.nextIndex]!;
        frame.nextIndex += 1;
        if (!visited[next]) {
          parent[next] = vertex;
          if (vertex === root) rootChildren += 1;
          visited[next] = 1;
          disc[next] = time;
          low[next] = time;
          time += 1;
          stack.push({ vertex: next, nextIndex: 0 });
        } else if (next !== parent[vertex]) {
          low[vertex] = Math.min(low[vertex]!, disc[next]!);
        }
        continue;
      }

      stack.pop();
      const p = parent[vertex]!;
      if (p !== -1) {
        low[p] = Math.min(low[p]!, low[vertex]!);
        if (low[vertex]! >= disc[p]! && p !== root) cut[p] = true;
      }
    }
    if (rootChildren > 1) cut[root] = true;
  }

  return cut;
}

function biconnectedComponents(adj: AdjacencyList): number[][] {
  const n = adj.length;
  const visited = new Uint8Array(n);
  const disc = Array.from({ length: n }, () => 0);
  const low = Array.from({ length: n }, () => 0);
  const parent = Array.from({ length: n }, () => -1);
  const edgeStack: Edge[] = [];
  const components: number[][] = [];
  let time = 0;

  const emitUntil = (stop: Edge): void => {
    const vertices = new Set<number>();
    while (edgeStack.length > 0) {
      const edge = edgeStack.pop()!;
      vertices.add(edge[0]);
      vertices.add(edge[1]);
      if ((edge[0] === stop[0] && edge[1] === stop[1]) || (edge[0] === stop[1] && edge[1] === stop[0])) break;
    }
    if (vertices.size > 0) components.push([...vertices].sort((a, b) => a - b));
  };

  const dfs = (root: number): void => {
    const stack: Array<{ vertex: number; nextIndex: number }> = [{ vertex: root, nextIndex: 0 }];
    visited[root] = 1;
    disc[root] = time;
    low[root] = time;
    time += 1;

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const vertex = frame.vertex;
      if (frame.nextIndex < adj[vertex]!.length) {
        const next = adj[vertex]![frame.nextIndex]!;
        frame.nextIndex += 1;
        if (!visited[next]) {
          parent[next] = vertex;
          edgeStack.push([vertex, next]);
          visited[next] = 1;
          disc[next] = time;
          low[next] = time;
          time += 1;
          stack.push({ vertex: next, nextIndex: 0 });
        } else if (next !== parent[vertex] && disc[next]! < disc[vertex]!) {
          low[vertex] = Math.min(low[vertex]!, disc[next]!);
          edgeStack.push([vertex, next]);
        }
        continue;
      }

      stack.pop();
      const p = parent[vertex]!;
      if (p !== -1) {
        low[p] = Math.min(low[p]!, low[vertex]!);
        if (low[vertex]! >= disc[p]!) emitUntil([p, vertex]);
      }
    }
  };

  for (let vertex = 0; vertex < n; vertex += 1) {
    if (!visited[vertex]) dfs(vertex);
    if (edgeStack.length > 0) emitUntil(edgeStack[0]!);
  }
  return components;
}

function kcoreStat(graph: DenseGraph, vertex: number, remaining: Uint8Array, mode: KcoreMode, ignoreEval: boolean): number {
  const n = graph.order;
  let sum = 0;
  const edgeValue = (tail: number, head: number): number => {
    if (!remaining[tail] || !remaining[head] || tail === head || isMissing(graph, tail, head) || graph.adjacency[tail * n + head] !== 1) return 0;
    return ignoreEval ? 1 : (graph.weights[tail * n + head] ?? 0);
  };

  for (let other = 0; other < n; other += 1) {
    if (mode === "indegree" || mode === "freeman") sum += edgeValue(other, vertex);
    if (mode === "outdegree" || mode === "freeman") sum += edgeValue(vertex, other);
  }
  return sum;
}

function cliqueAdjacency(graph: DenseGraph, mode: GraphMode, naOmit: boolean): AdjacencyList {
  const n = graph.order;
  const present = (tail: number, head: number): boolean => (isMissing(graph, tail, head) ? !naOmit : graph.adjacency[tail * n + head] === 1);
  return buildUndirectedAdjacency(n, (i, j) => (mode === "digraph" ? present(i, j) && present(j, i) : present(i, j) || present(j, i)));
}

function enumerateMaximalCliques(adj: AdjacencyList): number[][] {
  const n = adj.length;
  const neighbors = adj.map((row) => new Set(row));
  const cliques: number[][] = [];

  const bronKerbosch = (r: number[], p: Set<number>, x: Set<number>): void => {
    if (p.size === 0 && x.size === 0) {
      cliques.push([...r]);
      return;
    }
    let pivot: number | undefined;
    let bestDegree = -1;
    for (const candidate of [...p, ...x]) {
      const degree = neighbors[candidate]!.size;
      if (degree > bestDegree) {
        bestDegree = degree;
        pivot = candidate;
      }
    }
    const pivotNeighbors = pivot === undefined ? new Set<number>() : neighbors[pivot]!;
    for (const vertex of [...p].filter((candidate) => !pivotNeighbors.has(candidate))) {
      const nextP = intersectSet(p, neighbors[vertex]!);
      const nextX = intersectSet(x, neighbors[vertex]!);
      bronKerbosch([...r, vertex], nextP, nextX);
      p.delete(vertex);
      x.add(vertex);
    }
  };

  bronKerbosch([], new Set(Array.from({ length: n }, (_unused, vertex) => vertex)), new Set());
  return cliques;
}

function enumerateSimplePaths(adj: AdjacencyList, maxlen: number, directed: boolean): number[][] {
  const n = adj.length;
  const paths: number[][] = [];

  for (let source = 0; source < n; source += 1) {
    const visited = new Uint8Array(n);
    visited[source] = 1;
    const stack: Array<{ vertex: number; nextIndex: number; path: number[] }> = [{ vertex: source, nextIndex: 0, path: [source] }];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const pathLength = frame.path.length - 1;
      if (pathLength >= maxlen || frame.nextIndex >= adj[frame.vertex]!.length) {
        visited[frame.vertex] = 0;
        stack.pop();
        continue;
      }
      const next = adj[frame.vertex]![frame.nextIndex]!;
      frame.nextIndex += 1;
      if (visited[next]) continue;
      const nextPath = [...frame.path, next];
      if (directed || source < next) paths.push(nextPath);
      visited[next] = 1;
      stack.push({ vertex: next, nextIndex: 0, path: nextPath });
    }
  }

  return paths;
}

function enumerateSimpleCycles(adj: AdjacencyList, maxlen: number, directed: boolean): number[][] {
  const n = adj.length;
  const cycles: number[][] = [];

  for (let start = 0; start < n; start += 1) {
    const visited = new Uint8Array(n);
    visited[start] = 1;
    const stack: Array<{ vertex: number; nextIndex: number; path: number[] }> = [{ vertex: start, nextIndex: 0, path: [start] }];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      if (frame.nextIndex >= adj[frame.vertex]!.length) {
        visited[frame.vertex] = 0;
        stack.pop();
        continue;
      }
      const next = adj[frame.vertex]![frame.nextIndex]!;
      frame.nextIndex += 1;
      if (next === start) {
        if (frame.path.length >= (directed ? 2 : 3) && (directed || frame.path[1]! < frame.vertex)) cycles.push([...frame.path]);
        continue;
      }
      if (frame.path.length >= maxlen) continue;
      if (next < start || visited[next]) continue;
      visited[next] = 1;
      stack.push({ vertex: next, nextIndex: 0, path: [...frame.path, next] });
    }
  }

  return cycles;
}

function tabulateComembership(
  subgraphs: readonly number[][],
  n: number,
  rows: number,
  byLayer: boolean,
  layerFor: (subgraph: number[]) => number = (subgraph) => subgraph.length - 1,
): number[][] | number[][][] {
  if (!byLayer) {
    const matrix = createNumberMatrix(n, n);
    for (const subgraph of subgraphs) incrementComembershipMatrix(matrix, subgraph);
    return matrix;
  }

  const out = Array.from({ length: rows }, () => createNumberMatrix(n, n));
  for (const subgraph of subgraphs) {
    const layer = layerFor(subgraph);
    if (layer >= 0 && layer < rows) incrementComembershipMatrix(out[layer]!, subgraph);
  }
  return out;
}

function incrementComembershipMatrix(matrix: number[][], vertices: readonly number[]): void {
  for (const i of vertices) {
    const row = matrix[i]!;
    for (const j of vertices) row[j] = (row[j] ?? 0) + 1;
  }
}

function tabulatePathDyads(paths: readonly number[][], n: number, maxlen: number, byLength: boolean, directed: boolean): number[][] | number[][][] {
  if (!byLength) {
    const matrix = createNumberMatrix(n, n);
    for (const path of paths) incrementPathDyad(matrix, path, directed);
    return matrix;
  }
  const out = Array.from({ length: maxlen }, () => createNumberMatrix(n, n));
  for (const path of paths) incrementPathDyad(out[path.length - 2]!, path, directed);
  return out;
}

function incrementPathDyad(matrix: number[][], path: readonly number[], directed: boolean): void {
  const source = path[0]!;
  const sink = path[path.length - 1]!;
  const sourceRow = matrix[source]!;
  sourceRow[sink] = (sourceRow[sink] ?? 0) + 1;
  if (!directed) {
    const sinkRow = matrix[sink]!;
    sinkRow[source] = (sinkRow[source] ?? 0) + 1;
  }
}

function groupSubgraphsBySize(subgraphs: readonly number[][], maxSize: number): number[][][] {
  const out = Array.from({ length: maxSize }, () => [] as number[][]);
  for (const subgraph of subgraphs) out[subgraph.length - 1]!.push(subgraph);
  return out;
}

function normalizeVertexSelection(selection: number | readonly number[] | undefined, order: number): number[] {
  const raw = selection === undefined ? Array.from({ length: order }, (_unused, vertex) => vertex) : Array.isArray(selection) ? [...selection] : [selection];
  return raw.filter((vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < order);
}

function pathAdjacency(graph: DenseGraph, directed: boolean): AdjacencyList {
  const n = graph.order;
  return directed ? buildDirectedAdjacency(graph) : buildUndirectedAdjacency(n, (i, j) => hasDirectedTie(graph, i, j) || hasDirectedTie(graph, j, i));
}

function symmetrizedAdjacency(graph: DenseGraph, rule: BicomponentSymmetrizeRule): AdjacencyList {
  return buildUndirectedAdjacency(graph.order, (i, j) => (rule === "weak" ? hasDirectedTie(graph, i, j) || hasDirectedTie(graph, j, i) : hasDirectedTie(graph, i, j) && hasDirectedTie(graph, j, i)));
}

function buildDirectedAdjacency(graph: DenseGraph): AdjacencyList {
  return Array.from({ length: graph.order }, (_unused, tail) => {
    const row: number[] = [];
    for (let head = 0; head < graph.order; head += 1) {
      if (tail !== head && hasDirectedTie(graph, tail, head)) row.push(head);
    }
    return row;
  });
}

function buildUndirectedAdjacency(n: number, adjacent: (i: number, j: number) => boolean): AdjacencyList {
  const out = Array.from({ length: n }, () => [] as number[]);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (!adjacent(i, j)) continue;
      out[i]!.push(j);
      out[j]!.push(i);
    }
  }
  return out;
}

function hasDirectedTie(graph: DenseGraph, tail: number, head: number): boolean {
  return !isMissing(graph, tail, head) && graph.adjacency[tail * graph.order + head] === 1;
}

function isMissing(graph: DenseGraph, tail: number, head: number): boolean {
  return graph.missing?.[tail * graph.order + head] === 1;
}

function intersectSet(left: Set<number>, right: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const value of left) {
    if (right.has(value)) out.add(value);
  }
  return out;
}
