#!/usr/bin/env node
// Run the built package against the private, locally derived acceptance graphs.
// Inputs and outputs must remain outside the Git checkout.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import {
  adamicAdar,
  averageClustering,
  categoricalAssortativity,
  clusteringCoefficient,
  commonNeighbors,
  constraint,
  degreeAssortativity,
  effectiveSize,
  girvanNewman,
  greedyModularity,
  harmonicCentrality,
  hits,
  infomap,
  jaccardCoefficient,
  kCliqueCommunities,
  labelPropagation,
  leiden,
  louvain,
  pageRank,
  preferentialAttachment,
  resourceAllocation,
  triangles,
} from "../dist/modern/index.js";
import { gplot } from "../dist/visualization/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaults = resolve(projectRoot, "..", "validation");

function option(name, fallback) {
  const position = process.argv.indexOf(name);
  return position < 0 ? fallback : resolve(process.argv[position + 1] ?? "");
}

function assertOutsideProject(path, label) {
  const relation = relative(projectRoot, path);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    throw new RangeError(`${label} must remain outside the Git checkout`);
  }
}

function assertReceipt(receipt) {
  const expected = {
    sha256: "043fb5d66e70085c757939aa6082877c3392204156e3e986ac56fab967819434",
    rows: 811,
    itemNodes: 16,
    itemEdges: 32,
    respondentNodes: 811,
    respondentEdges: 4559,
    components: 1,
  };
  const actual = {
    sha256: receipt.sha256,
    rows: receipt.rows,
    itemNodes: receipt.itemNetwork?.nodes,
    itemEdges: receipt.itemNetwork?.edges,
    respondentNodes: receipt.respondentNetwork?.nodes,
    respondentEdges: receipt.respondentNetwork?.edges,
    components: receipt.respondentNetwork?.components,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`private sample receipt mismatch: ${JSON.stringify({ expected, actual })}`);
  }
}

function legacyGraph(graph) {
  const indexById = new Map(graph.nodes.map((node, index) => [node.id, index]));
  return {
    order: graph.nodes.length,
    directed: graph.directed,
    edges: graph.edges.map((edge) => [indexById.get(edge.source), indexById.get(edge.target), edge.weight]),
  };
}

function nonEdges(graph, limit = 32) {
  const present = new Set(graph.edges.map((edge) => {
    const [left, right] = [String(edge.source), String(edge.target)].sort();
    return `${left}\u0000${right}`;
  }));
  const result = [];
  for (let left = 0; left < graph.nodes.length && result.length < limit; left += 1) {
    for (let right = left + 1; right < graph.nodes.length && result.length < limit; right += 1) {
      const source = graph.nodes[left].id;
      const target = graph.nodes[right].id;
      const key = [String(source), String(target)].sort().join("\u0000");
      if (!present.has(key)) result.push([source, target]);
    }
  }
  return result;
}

function palette(membership) {
  const colors = ["#2563eb", "#dc2626", "#059669", "#7c3aed", "#d97706", "#0891b2", "#be185d", "#4b5563"];
  return membership.map((community) => colors[community % colors.length]);
}

const inputDirectory = option("--input-dir", defaults);
const outputDirectory = option("--output-dir", defaults);
assertOutsideProject(inputDirectory, "input directory");
assertOutsideProject(outputDirectory, "output directory");

const [receipt, itemGraph, respondentGraph] = await Promise.all([
  readFile(resolve(inputDirectory, "source-receipt.json"), "utf8").then(JSON.parse),
  readFile(resolve(inputDirectory, "item-network.local.json"), "utf8").then(JSON.parse),
  readFile(resolve(inputDirectory, "respondent-network.local.json"), "utf8").then(JSON.parse),
]);
assertReceipt(receipt);

const timings = {};
const timed = (name, operation) => {
  const start = performance.now();
  const result = operation();
  timings[name] = Number((performance.now() - start).toFixed(3));
  return result;
};
const seed = "private-sample-acceptance-v1";
const itemLouvain = timed("item.louvain", () => louvain(itemGraph, { seed }));
const respondentLouvain = timed("respondent.louvain", () => louvain(respondentGraph, { seed }));
const candidates = nonEdges(itemGraph);

const analysis = {
  localOnly: true,
  sourceReceipt: receipt,
  runtime: { node: process.version, packageVersion: "0.5.0" },
  itemNetwork: {
    pageRank: timed("item.pageRank", () => pageRank(itemGraph)),
    hits: timed("item.hits", () => hits(itemGraph, { maxIterations: 200, tolerance: 1e-8 })),
    harmonicCentrality: timed("item.harmonic", () => harmonicCentrality(itemGraph)),
    triangles: timed("item.triangles", () => triangles(itemGraph)),
    clustering: timed("item.clustering", () => clusteringCoefficient(itemGraph, { weighted: true })),
    averageClustering: timed("item.averageClustering", () => averageClustering(itemGraph, { weighted: true })),
    degreeAssortativity: timed("item.assortativity", () => degreeAssortativity(itemGraph, { weighted: true })),
    constraint: timed("item.constraint", () => constraint(itemGraph, { weighted: true })),
    effectiveSize: timed("item.effectiveSize", () => effectiveSize(itemGraph, { weighted: true })),
    communities: {
      greedy: timed("item.greedy", () => greedyModularity(itemGraph)),
      louvain: itemLouvain,
      leiden: timed("item.leiden", () => leiden(itemGraph, { seed, iterations: 3 })),
      infomap: timed("item.infomap", () => infomap(itemGraph, { seed, trials: 5 })),
      girvanNewman: timed("item.girvanNewman", () => girvanNewman(itemGraph, { maxCommunities: 4 })),
      labelPropagation: timed("item.labelPropagation", () => labelPropagation(itemGraph, { seed })),
      kClique3: timed("item.kClique3", () => kCliqueCommunities(itemGraph, 3)),
    },
    prediction: {
      candidates,
      commonNeighbors: commonNeighbors(itemGraph, candidates),
      jaccard: jaccardCoefficient(itemGraph, candidates),
      adamicAdar: adamicAdar(itemGraph, candidates),
      resourceAllocation: resourceAllocation(itemGraph, candidates),
      preferentialAttachment: preferentialAttachment(itemGraph, candidates),
    },
  },
  respondentNetwork: {
    pageRank: timed("respondent.pageRank", () => pageRank(respondentGraph)),
    hits: timed("respondent.hits", () => hits(respondentGraph, { maxIterations: 200, tolerance: 1e-8 })),
    harmonicCentrality: timed("respondent.harmonic", () => harmonicCentrality(respondentGraph)),
    clustering: timed("respondent.clustering", () => clusteringCoefficient(respondentGraph, { weighted: true })),
    averageClustering: timed("respondent.averageClustering", () => averageClustering(respondentGraph, { weighted: true })),
    degreeAssortativity: timed("respondent.assortativity", () => degreeAssortativity(respondentGraph, { weighted: true })),
    genderAssortativity: timed("respondent.genderAssortativity", () => categoricalAssortativity(respondentGraph, "gender")),
    constraint: timed("respondent.constraint", () => constraint(respondentGraph, { weighted: true })),
    effectiveSize: timed("respondent.effectiveSize", () => effectiveSize(respondentGraph, { weighted: true })),
    communities: {
      louvain: respondentLouvain,
      leiden: timed("respondent.leiden", () => leiden(respondentGraph, { seed, iterations: 3 })),
      infomap: timed("respondent.infomap", () => infomap(respondentGraph, { seed, trials: 3 })),
      labelPropagation: timed("respondent.labelPropagation", () => labelPropagation(respondentGraph, { seed })),
    },
  },
};

const itemPlot = gplot(legacyGraph(itemGraph), {
  gmode: "graph",
  mode: "circle",
  label: itemGraph.nodes.map((node) => node.id),
  displaylabels: true,
  vertexCol: palette(itemLouvain.membership),
  vertexBorder: "none",
  edgeCol: "#94a3b8",
  edgeLwd: 0.012,
  width: 900,
  height: 720,
  seed,
});
const respondentPlot = gplot(legacyGraph(respondentGraph), {
  gmode: "graph",
  mode: "fruchtermanreingold",
  displaylabels: false,
  vertexCol: palette(respondentLouvain.membership),
  vertexBorder: "none",
  edgeCol: "#cbd5e1",
  objectScale: 0.004,
  width: 1400,
  height: 1000,
  seed,
});

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, "analysis.local.json"), `${JSON.stringify(analysis, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDirectory, "item-network.local.svg"), itemPlot.svg, "utf8"),
  writeFile(resolve(outputDirectory, "respondent-network.local.svg"), respondentPlot.svg, "utf8"),
]);
console.log(JSON.stringify({ receipt, timingsMs: timings, outputDirectory }, null, 2));
