#!/usr/bin/env node

/**
 * Sparse modern-SNA performance acceptance harness.
 *
 * The default profile is intentionally the release gate requested for 0.5.0:
 * 10,000 nodes and 100,000 undirected, simple, non-negative weighted edges.
 * `--quick` is suitable for CI and `--large` is an opt-in nightly profile.
 * The generator and all invariant checks use O(n + m) storage; no n-by-n
 * matrix is created.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const PROFILE_DEFAULTS = Object.freeze({
  quick: Object.freeze({ nodes: 80, edges: 320, infomapTrials: 2, communityPasses: 12, leidenIterations: 2 }),
  default: Object.freeze({ nodes: 10_000, edges: 100_000, infomapTrials: 10, communityPasses: 100, leidenIterations: 2 }),
  large: Object.freeze({ nodes: 50_000, edges: 1_000_000, infomapTrials: 10, communityPasses: 100, leidenIterations: 2 }),
});

const TIMEOUT_DEFAULTS = Object.freeze({
  quick: Object.freeze({ inputGeneration: 15_000, graphBuild: 15_000, pageRank: 15_000, degreeAssortativity: 15_000, louvain: 30_000, leiden: 30_000, infomap: 30_000 }),
  default: Object.freeze({ inputGeneration: 60_000, graphBuild: 60_000, pageRank: 120_000, degreeAssortativity: 60_000, louvain: 300_000, leiden: 300_000, infomap: 300_000 }),
  large: Object.freeze({ inputGeneration: 300_000, graphBuild: 300_000, pageRank: 600_000, degreeAssortativity: 300_000, louvain: 900_000, leiden: 900_000, infomap: 900_000 }),
});

const STAGE_TIMEOUT_FLAGS = Object.freeze({
  "timeout-input-ms": "inputGeneration",
  "timeout-build-ms": "graphBuild",
  "timeout-pagerank-ms": "pageRank",
  "timeout-assortativity-ms": "degreeAssortativity",
  "timeout-louvain-ms": "louvain",
  "timeout-leiden-ms": "leiden",
  "timeout-infomap-ms": "infomap",
});

export const BENCHMARK_USAGE = `Usage: node scripts/benchmark-modern.mjs [options]

Profiles (mutually exclusive):
  --quick                    80 nodes / 320 edges for CI
  --large                    50,000 nodes / 1,000,000 edges for nightly runs
  (default)                  10,000 nodes / 100,000 edges

Graph and output:
  --nodes N                  override the profile node count
  --edges M                  override the profile edge count
  --seed VALUE               deterministic seed (default: sna-modern-benchmark-v1)
  --output PATH              also write the JSON receipt to PATH
  --pretty                   pretty-print JSON
  --verbose                  write stage progress to stderr

Timeouts:
  --timeout-ms MS            override every stage timeout
  --timeout-input-ms MS      input generation
  --timeout-build-ms MS      sparse graph build
  --timeout-pagerank-ms MS   PageRank
  --timeout-assortativity-ms MS
  --timeout-louvain-ms MS
  --timeout-leiden-ms MS
  --timeout-infomap-ms MS
  --help                     show this help
`;

class StageTimeoutError extends Error {
  constructor(stage, limitMs) {
    super(`stage ${stage} exceeded its ${limitMs} ms time limit`);
    this.name = "StageTimeoutError";
    this.stage = stage;
    this.limitMs = limitMs;
  }
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return number;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
  return number;
}

function optionValue(args, index, inlineValue, label) {
  if (inlineValue !== undefined) return { value: inlineValue, nextIndex: index };
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new RangeError(`${label} requires a value`);
  return { value, nextIndex: index + 1 };
}

/** Parse CLI options without performing I/O. Exported for focused tests. */
export function parseBenchmarkArgs(args = process.argv.slice(2)) {
  let profile = "default";
  let profileWasSelected = false;
  let nodesOverride;
  let edgesOverride;
  let seed = "sna-modern-benchmark-v1";
  let output;
  let pretty = false;
  let verbose = false;
  let help = false;
  let allTimeout;
  const timeoutOverrides = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equal = argument.indexOf("=");
    const name = equal < 0 ? argument : argument.slice(0, equal);
    const inlineValue = equal < 0 ? undefined : argument.slice(equal + 1);

    if (name === "--quick" || name === "--large") {
      if (inlineValue !== undefined) throw new RangeError(`${name} does not accept a value`);
      const selected = name === "--quick" ? "quick" : "large";
      if (profileWasSelected && profile !== selected) throw new RangeError("--quick and --large are mutually exclusive");
      profile = selected;
      profileWasSelected = true;
      continue;
    }
    if (name === "--pretty" || name === "--verbose" || name === "--help") {
      if (inlineValue !== undefined) throw new RangeError(`${name} does not accept a value`);
      if (name === "--pretty") pretty = true;
      else if (name === "--verbose") verbose = true;
      else help = true;
      continue;
    }

    const valueNames = new Set([
      "--nodes",
      "--edges",
      "--seed",
      "--output",
      "--timeout-ms",
      ...Object.keys(STAGE_TIMEOUT_FLAGS).map((flag) => `--${flag}`),
    ]);
    if (!valueNames.has(name)) throw new RangeError(`unknown option: ${name}`);
    const valueOption = optionValue(args, index, inlineValue, name);
    index = valueOption.nextIndex;
    if (name === "--nodes") nodesOverride = positiveInteger(valueOption.value, "nodes");
    else if (name === "--edges") edgesOverride = nonNegativeInteger(valueOption.value, "edges");
    else if (name === "--seed") seed = valueOption.value;
    else if (name === "--output") output = valueOption.value;
    else if (name === "--timeout-ms") allTimeout = positiveInteger(valueOption.value, "timeout-ms");
    else if (name.slice(2) in STAGE_TIMEOUT_FLAGS) {
      timeoutOverrides[STAGE_TIMEOUT_FLAGS[name.slice(2)]] = positiveInteger(valueOption.value, name.slice(2));
    }
  }

  const selected = PROFILE_DEFAULTS[profile];
  const nodes = nodesOverride ?? selected.nodes;
  const edges = edgesOverride ?? selected.edges;
  const capacity = (nodes * (nodes - 1)) / 2;
  if (edges > capacity) throw new RangeError(`edges must not exceed the ${capacity} possible undirected simple edges`);
  if (nodes > 1 && edges < nodes - 1) throw new RangeError("benchmark graphs must contain at least nodes - 1 edges so they are connected");

  const stageTimeoutMs = { ...TIMEOUT_DEFAULTS[profile] };
  if (allTimeout !== undefined) {
    for (const stage of Object.keys(stageTimeoutMs)) stageTimeoutMs[stage] = allTimeout;
  }
  Object.assign(stageTimeoutMs, timeoutOverrides);

  return {
    help,
    profile,
    nodes,
    edges,
    seed,
    output,
    pretty,
    verbose,
    stageTimeoutMs,
    infomapTrials: selected.infomapTrials,
    communityPasses: selected.communityPasses,
    leidenIterations: selected.leidenIterations,
  };
}

function seedToUint32(seed) {
  let hash = 2166136261;
  const text = String(seed);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seedToUint32(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted", "AbortError");
}

function edgeKey(source, target, order) {
  return source * order + target;
}

function benchmarkInputHash(order, edges) {
  const hash = createHash("sha256");
  hash.update(`undirected-simple-v1\n${order}\n${edges.length}\n`);
  for (const edge of edges) hash.update(`${edge[0]},${edge[1]},${edge[2].toFixed(4)}\n`);
  return hash.digest("hex");
}

/**
 * Generate an exactly sized, connected, undirected simple weighted edge list.
 * Storage is O(n + m): one edge array and one Set of scalar edge keys.
 */
export function generateBenchmarkInput({ nodes, edges, seed }, signal) {
  const order = positiveInteger(nodes, "nodes");
  const size = nonNegativeInteger(edges, "edges");
  const capacity = (order * (order - 1)) / 2;
  if (size > capacity) throw new RangeError(`edges must not exceed the ${capacity} possible undirected simple edges`);
  if (order > 1 && size < order - 1) throw new RangeError("connected generation requires at least nodes - 1 edges");

  const random = seededRandom(seed);
  const selected = new Set();
  const tuples = [];
  const add = (left, right) => {
    const source = Math.min(left, right);
    const target = Math.max(left, right);
    if (source === target) return false;
    const key = edgeKey(source, target, order);
    if (selected.has(key)) return false;
    selected.add(key);
    // Positive fixed-precision strengths in [0.1, 1.0].
    const weight = (1_000 + Math.floor(random() * 9_001)) / 10_000;
    tuples.push([source, target, weight]);
    return true;
  };

  // A deterministic spanning path guarantees one connected component.
  for (let node = 1; node < order && tuples.length < size; node += 1) add(node - 1, node);

  let attemptsWithoutProgress = 0;
  while (tuples.length < size && attemptsWithoutProgress < Math.max(10_000, size * 20)) {
    if ((attemptsWithoutProgress & 0xfff) === 0) throwIfAborted(signal);
    const before = tuples.length;
    add(Math.floor(random() * order), Math.floor(random() * order));
    attemptsWithoutProgress = tuples.length === before ? attemptsWithoutProgress + 1 : 0;
  }

  // Near-complete custom graphs may make rejection sampling inefficient. The
  // deterministic enumeration fallback still uses O(n + m) storage.
  if (tuples.length < size) {
    for (let source = 0; source < order && tuples.length < size; source += 1) {
      for (let target = source + 1; target < order && tuples.length < size; target += 1) {
        if ((target & 0xfff) === 0) throwIfAborted(signal);
        add(source, target);
      }
    }
  }

  tuples.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  if (tuples.length !== size) throw new Error(`generator produced ${tuples.length} edges; expected ${size}`);
  return {
    input: { order, indexBase: 0, directed: false, edges: tuples },
    sha256: benchmarkInputHash(order, tuples),
  };
}

function memorySnapshot() {
  const memory = process.memoryUsage();
  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    heapTotal: memory.heapTotal,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  };
}

function memoryMaximum(left, right) {
  return Object.fromEntries(Object.keys(left).map((key) => [key, Math.max(left[key], right[key])]));
}

function memoryDelta(before, after) {
  return Object.fromEntries(Object.keys(before).map((key) => [key, after[key] - before[key]]));
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    ...(error && typeof error === "object" && "stage" in error ? { stage: error.stage } : {}),
    ...(error && typeof error === "object" && "limitMs" in error ? { limitMs: error.limitMs } : {}),
  };
}

function ensure(condition, message) {
  if (!condition) throw new Error(`invariant failed: ${message}`);
}

function roundedMilliseconds(value) {
  return Math.round(value * 1_000) / 1_000;
}

function arrayHash(values) {
  const hash = createHash("sha256");
  for (const value of values) hash.update(`${value}\n`);
  return hash.digest("hex");
}

/** O(n + m) connectivity check for every community in a partition. */
export function partitionCommunitiesAreConnected(graph, partition) {
  if (partition.membership.length !== graph.order) return false;
  const communityCount = partition.communities.length;
  const sizes = new Uint32Array(communityCount);
  const starts = new Int32Array(communityCount);
  starts.fill(-1);
  for (let node = 0; node < graph.order; node += 1) {
    const label = partition.membership[node];
    if (!Number.isInteger(label) || label < 0 || label >= communityCount) return false;
    sizes[label] += 1;
    if (starts[label] < 0) starts[label] = node;
  }

  const seen = new Uint32Array(graph.order);
  const queue = new Uint32Array(graph.order);
  for (let label = 0; label < communityCount; label += 1) {
    if (sizes[label] === 0 || starts[label] < 0) return false;
    const stamp = label + 1;
    let head = 0;
    let tail = 0;
    let visited = 0;
    queue[tail++] = starts[label];
    seen[starts[label]] = stamp;
    while (head < tail) {
      const node = queue[head++];
      visited += 1;
      for (let cursor = graph.csr.offsets[node]; cursor < graph.csr.offsets[node + 1]; cursor += 1) {
        const neighbor = graph.csr.indices[cursor];
        if (partition.membership[neighbor] !== label || seen[neighbor] === stamp) continue;
        seen[neighbor] = stamp;
        queue[tail++] = neighbor;
      }
    }
    if (visited !== sizes[label]) return false;
  }
  return true;
}

function graphStorageReceipt(graph) {
  return {
    logicalEdges: graph.size,
    csrEntries: graph.csr.indices.length,
    cscEntries: graph.csc.indices.length,
    offsetsPerDirection: graph.order + 1,
    denseMatrixAllocated: false,
    storageComplexity: "O(nodes + edges)",
  };
}

async function packageVersion() {
  try {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    return manifest.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Execute the benchmark and return a JSON-safe receipt without node-level data. */
export async function runModernBenchmark(config) {
  const stages = [];
  const receipt = {
    schemaVersion: 1,
    benchmark: "sna.js-modern-sparse-performance",
    status: "running",
    packageVersion: await packageVersion(),
    profile: config.profile,
    seed: String(config.seed),
    graph: { nodes: config.nodes, edges: config.edges, directed: false, simple: true, nonNegativeWeights: true },
    limitsMs: { ...config.stageTimeoutMs },
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    stages,
  };

  const log = (message) => {
    if (config.verbose) process.stderr.write(`${message}\n`);
  };

  const runStage = async (name, operation) => {
    const limitMs = config.stageTimeoutMs[name];
    const started = performance.now();
    const deadline = started + limitMs;
    const timeoutError = new StageTimeoutError(name, limitMs);
    const deadlineSignal = {
      get aborted() {
        return performance.now() > deadline;
      },
      get reason() {
        return timeoutError;
      },
    };
    const before = memorySnapshot();
    let peakApprox = before;
    const sampleMemory = () => {
      peakApprox = memoryMaximum(peakApprox, memorySnapshot());
      throwIfAborted(deadlineSignal);
    };
    log(`benchmark stage ${name} started (limit ${limitMs} ms)`);
    try {
      const output = await operation({ signal: deadlineSignal, sampleMemory });
      sampleMemory();
      const after = memorySnapshot();
      peakApprox = memoryMaximum(peakApprox, after);
      const wallTimeMs = performance.now() - started;
      if (wallTimeMs > limitMs) throw timeoutError;
      stages.push({
        name,
        status: "pass",
        wallTimeMs: roundedMilliseconds(wallTimeMs),
        limitMs,
        memoryBytes: { before, after, peakApprox, delta: memoryDelta(before, after) },
        invariants: output.invariants,
        summary: output.summary,
      });
      log(`benchmark stage ${name} passed in ${roundedMilliseconds(wallTimeMs)} ms`);
      return output.value;
    } catch (error) {
      const after = memorySnapshot();
      peakApprox = memoryMaximum(peakApprox, after);
      stages.push({
        name,
        status: "fail",
        wallTimeMs: roundedMilliseconds(performance.now() - started),
        limitMs,
        memoryBytes: { before, after, peakApprox, delta: memoryDelta(before, after) },
        error: serializeError(error),
      });
      throw error;
    }
  };

  try {
    const generated = await runStage("inputGeneration", ({ signal, sampleMemory }) => {
      const value = generateBenchmarkInput(config, signal);
      sampleMemory();
      ensure(value.input.edges.length === config.edges, "generator edge count");
      return {
        value,
        invariants: { exactNodeCount: true, exactEdgeCount: true, connectedByConstruction: true, noLoops: true, noParallelEdges: true },
        summary: { sha256: value.sha256 },
      };
    });

    const api = await import(new URL("../dist/modern/index.js", import.meta.url));
    const graph = await runStage("graphBuild", ({ sampleMemory }) => {
      const value = api.makeSparseGraph(generated.input, { loops: false });
      sampleMemory();
      ensure(value.order === config.nodes, "sparse graph node count");
      ensure(value.size === config.edges, "sparse graph logical edge count");
      ensure(value.directed === false, "sparse graph is undirected");
      ensure(value.loops === false, "sparse graph is loop-free");
      ensure(value.csr.indices.length === config.edges * 2, "undirected CSR contains two arcs per logical edge");
      ensure(value.csc.indices.length === config.edges * 2, "undirected CSC contains two arcs per logical edge");
      return {
        value,
        invariants: { sparse: true, exactNodeCount: true, exactLogicalEdgeCount: true, undirected: true, loopFree: true, noDenseAllocation: true },
        summary: graphStorageReceipt(value),
      };
    });

    await runStage("pageRank", ({ signal, sampleMemory }) => {
      const value = api.pageRank(graph, {
        signal,
        onProgress: sampleMemory,
        tolerance: 1e-9,
        maxIterations: 200,
      });
      const sum = value.values.reduce((total, score) => total + score, 0);
      const minimum = Math.min(...value.values);
      const maximum = Math.max(...value.values);
      ensure(value.values.length === graph.order, "PageRank returns one value per node");
      ensure(value.values.every((score) => Number.isFinite(score) && score >= 0), "PageRank values are finite and non-negative");
      ensure(Math.abs(sum - 1) <= 1e-9, "PageRank sums to one");
      ensure(value.meta.converged === true, "PageRank converged");
      return {
        value: undefined,
        invariants: { oneScorePerNode: true, finiteNonNegative: true, sumApproximatelyOne: true, converged: true },
        summary: { sum, minimum, maximum, iterations: value.meta.iterations, valuesSha256: arrayHash(value.values) },
      };
    });

    await runStage("degreeAssortativity", ({ sampleMemory }) => {
      const value = api.degreeAssortativity(graph, { weighted: true });
      sampleMemory();
      ensure(typeof value.value === "number" && Number.isFinite(value.value), "degree assortativity is finite");
      ensure(value.value >= -1 - 1e-12 && value.value <= 1 + 1e-12, "degree assortativity lies in [-1, 1]");
      return {
        value: undefined,
        invariants: { finite: true, inCorrelationRange: true },
        summary: { value: value.value },
      };
    });

    const partitionSummary = (result, algorithm, qualityName, apiQuality, extra = {}) => {
      api.validatePartition(graph, result);
      const recomputedModularity = api.modularity(graph, result);
      const reportedQuality = result.quality[qualityName];
      if (qualityName === "modularity") {
        ensure(typeof reportedQuality === "number" && Number.isFinite(reportedQuality), `${algorithm} reports finite modularity`);
        ensure(Math.abs(reportedQuality - recomputedModularity) <= 1e-9, `${algorithm} modularity recomputes consistently`);
      }
      ensure(result.membership.length === graph.order, `${algorithm} membership covers every node`);
      return {
        invariants: {
          validPartition: true,
          membershipCoversEveryNode: true,
          modularityRecomputed: true,
          ...(qualityName === "modularity" ? { reportedModularityMatches: true } : {}),
          ...extra,
        },
        summary: {
          communities: result.communities.length,
          recomputedModularity,
          reportedQuality: apiQuality,
          membershipSha256: arrayHash(result.membership),
        },
      };
    };

    await runStage("louvain", ({ signal, sampleMemory }) => {
      const value = api.louvain(graph, {
        seed: config.seed,
        signal,
        onProgress: sampleMemory,
        maxPasses: config.communityPasses,
        maxLevels: 100,
      });
      const checked = partitionSummary(value, "Louvain", "modularity", value.quality.modularity);
      sampleMemory();
      return { value: undefined, ...checked };
    });

    await runStage("leiden", ({ signal, sampleMemory }) => {
      const value = api.leiden(graph, {
        seed: config.seed,
        signal,
        onProgress: sampleMemory,
        objective: "modularity",
        iterations: config.leidenIterations,
        maxPasses: config.communityPasses,
      });
      const connected = partitionCommunitiesAreConnected(graph, value);
      ensure(connected, "every Leiden community is connected");
      const checked = partitionSummary(value, "Leiden", "modularity", value.quality.modularity, { communitiesConnected: true });
      sampleMemory();
      return { value: undefined, ...checked };
    });

    await runStage("infomap", ({ signal, sampleMemory }) => {
      const value = api.infomap(graph, {
        seed: config.seed,
        signal,
        onProgress: sampleMemory,
        trials: config.infomapTrials,
        maxPasses: config.communityPasses,
      });
      const codeLength = value.quality.codeLength;
      ensure(typeof codeLength === "number" && Number.isFinite(codeLength), "Infomap code length is finite");
      const recomputedCodeLength = api.mapEquation(graph, value);
      ensure(Number.isFinite(recomputedCodeLength), "recomputed map-equation code length is finite");
      ensure(Math.abs(codeLength - recomputedCodeLength) <= 1e-9, "Infomap code length recomputes consistently");
      const checked = partitionSummary(value, "Infomap", "codeLength", codeLength, {
        finiteCodeLength: true,
        codeLengthRecomputed: true,
      });
      checked.summary.recomputedCodeLength = recomputedCodeLength;
      sampleMemory();
      return { value: undefined, ...checked };
    });

    receipt.status = "pass";
    receipt.completedStages = stages.length;
  } catch (error) {
    receipt.status = "fail";
    receipt.error = serializeError(error);
    receipt.completedStages = stages.filter((stage) => stage.status === "pass").length;
  }
  return receipt;
}

async function emitReceipt(receipt, config) {
  const serialized = `${JSON.stringify(receipt, null, config.pretty ? 2 : undefined)}\n`;
  if (config.output) {
    const output = resolve(config.output);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

async function main() {
  let config;
  try {
    config = parseBenchmarkArgs();
    if (config.help) {
      process.stdout.write(BENCHMARK_USAGE);
      return;
    }
    const receipt = await runModernBenchmark(config);
    await emitReceipt(receipt, config);
    if (receipt.status !== "pass") process.exitCode = 1;
  } catch (error) {
    const failure = { schemaVersion: 1, benchmark: "sna.js-modern-sparse-performance", status: "fail", error: serializeError(error), stages: [] };
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.stdout.write(`${JSON.stringify(failure)}\n`);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) await main();
