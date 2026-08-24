// Package example: derive two networks from the committed, fully synthetic
// programming-resilience survey and write deterministic JSON/SVG artifacts.
// No private workbook or participant record is read by this example.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adamicAdar,
  averageClustering,
  categoricalAssortativity,
  commonNeighbors,
  degreeAssortativity,
  girvanNewman,
  greedyModularity,
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "examples/data/programming-resilience.synthetic.csv");
const outputDirectory = resolve(root, "examples/generated");
const seed = "programming-resilience-public-v1";
const correlationThreshold = 0.3;
const k = 8;
const palette = ["#2563eb", "#dc2626", "#059669", "#7c3aed", "#d97706", "#0891b2", "#be185d", "#4b5563"];

function parseCsv(text) {
  const [headerLine, ...dataLines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return dataLines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sampleStandardDeviation(values, center = mean(values)) {
  return Math.sqrt(values.reduce((total, value) => total + (value - center) ** 2, 0) / Math.max(1, values.length - 1));
}

function pearson(left, right) {
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const x = left[index] - leftMean;
    const y = right[index] - rightMean;
    numerator += x * y;
    leftSquares += x * x;
    rightSquares += y * y;
  }
  return numerator / Math.sqrt(leftSquares * rightSquares);
}

function itemNetwork(rows, itemNames) {
  const columns = itemNames.map((name) => rows.map((row) => Number(row[name])));
  const edges = [];
  for (let source = 0; source < itemNames.length; source += 1) {
    for (let target = source + 1; target < itemNames.length; target += 1) {
      const weight = pearson(columns[source], columns[target]);
      if (Math.abs(weight) >= correlationThreshold) {
        edges.push({ source: itemNames[source], target: itemNames[target], weight });
      }
    }
  }
  return {
    directed: false,
    nodes: itemNames.map((id) => ({ id, attributes: { construct: id.slice(0, 3) } })),
    edges,
  };
}

function respondentNetwork(rows, itemNames) {
  const columns = itemNames.map((name) => rows.map((row) => Number(row[name])));
  const centers = columns.map(mean);
  const scales = columns.map((column, index) => sampleStandardDeviation(column, centers[index]));
  const vectors = rows.map((row) => itemNames.map((name, index) => (Number(row[name]) - centers[index]) / scales[index]));
  const ids = rows.map((row) => Number(row.ID));
  const distances = Array.from({ length: rows.length }, () => new Float64Array(rows.length));
  for (let source = 0; source < rows.length; source += 1) {
    distances[source][source] = Number.POSITIVE_INFINITY;
    for (let target = source + 1; target < rows.length; target += 1) {
      let squares = 0;
      for (let item = 0; item < itemNames.length; item += 1) squares += (vectors[source][item] - vectors[target][item]) ** 2;
      const distance = Math.sqrt(squares);
      distances[source][target] = distance;
      distances[target][source] = distance;
    }
  }

  const selected = new Map();
  for (let source = 0; source < rows.length; source += 1) {
    const candidates = Array.from({ length: rows.length }, (_, index) => index)
      .filter((target) => target !== source)
      .sort((left, right) => distances[source][left] - distances[source][right] || ids[left] - ids[right]);
    for (const target of candidates.slice(0, k)) {
      const a = Math.min(source, target);
      const b = Math.max(source, target);
      selected.set(`${a}:${b}`, [a, b]);
    }
  }

  const edges = [...selected.values()]
    .sort(([a1, b1], [a2, b2]) => a1 - a2 || b1 - b2)
    .map(([source, target]) => ({ source: ids[source], target: ids[target], weight: 1 / (1 + distances[source][target]) }));
  return {
    directed: false,
    nodes: rows.map((row) => ({ id: Number(row.ID), attributes: { gender: row.Gender } })),
    edges,
  };
}

function legacyGraph(graph) {
  const indexById = new Map(graph.nodes.map((node, index) => [node.id, index]));
  return {
    order: graph.nodes.length,
    directed: graph.directed,
    edges: graph.edges.map((edge) => [indexById.get(edge.source), indexById.get(edge.target), edge.weight]),
  };
}

function candidateNonEdges(graph, limit = 24) {
  const edgeKeys = new Set(graph.edges.map((edge) => {
    const pair = [String(edge.source), String(edge.target)].sort();
    return `${pair[0]}\u0000${pair[1]}`;
  }));
  const pairs = [];
  for (let source = 0; source < graph.nodes.length && pairs.length < limit; source += 1) {
    for (let target = source + 1; target < graph.nodes.length && pairs.length < limit; target += 1) {
      const left = graph.nodes[source].id;
      const right = graph.nodes[target].id;
      const key = [String(left), String(right)].sort().join("\u0000");
      if (!edgeKeys.has(key)) pairs.push([left, right]);
    }
  }
  return pairs;
}

function colors(membership) {
  return membership.map((community) => palette[community % palette.length]);
}

const rows = parseCsv(await readFile(sourcePath, "utf8"));
const itemNames = Object.keys(rows[0]).slice(2);
const items = itemNetwork(rows, itemNames);
const respondents = respondentNetwork(rows, itemNames);
const itemCandidates = candidateNonEdges(items);

const itemLouvain = louvain(items, { seed, resolution: 1 });
const respondentLouvain = louvain(respondents, { seed, resolution: 1 });
const itemLeiden = leiden(items, { seed, objective: "modularity", resolution: 1 });
const itemInfomap = infomap(items, { seed });
const analysis = {
  provenance: {
    synthetic: true,
    source: "examples/data/programming-resilience.synthetic.csv",
    generator: "scripts/generate-programming-resilience-synthetic.mjs",
    seed,
    schema: ["ID", "Gender", ...itemNames],
    notice: "Fully synthetic public demonstration data; no source participant record was copied or modeled.",
  },
  construction: {
    itemNetwork: { correlation: "Pearson", threshold: `abs(r) >= ${correlationThreshold}`, nodes: items.nodes.length, edges: items.edges.length },
    respondentNetwork: { standardization: "sample z-score per item", nearestNeighbors: k, tieBreak: "ascending ID", symmetrization: "union", weight: "1 / (1 + Euclidean distance)", nodes: respondents.nodes.length, edges: respondents.edges.length },
  },
  itemNetwork: {
    pageRank: pageRank(items),
    triangles: triangles(items),
    averageClustering: averageClustering(items),
    degreeAssortativity: degreeAssortativity(items),
    communities: {
      greedy: greedyModularity(items),
      louvain: itemLouvain,
      leiden: itemLeiden,
      infomap: itemInfomap,
      girvanNewman: girvanNewman(items, { maxCommunities: 4 }),
      labelPropagation: labelPropagation(items, { seed }),
      kClique3: kCliqueCommunities(items, 3),
    },
    prediction: {
      candidates: itemCandidates,
      commonNeighbors: commonNeighbors(items, itemCandidates),
      jaccard: jaccardCoefficient(items, itemCandidates),
      adamicAdar: adamicAdar(items, itemCandidates),
      resourceAllocation: resourceAllocation(items, itemCandidates),
      preferentialAttachment: preferentialAttachment(items, itemCandidates),
    },
  },
  respondentNetwork: {
    pageRank: pageRank(respondents),
    averageClustering: averageClustering(respondents),
    degreeAssortativity: degreeAssortativity(respondents),
    genderAssortativity: categoricalAssortativity(respondents, "gender"),
    communities: {
      louvain: respondentLouvain,
    },
  },
};

const itemPlot = gplot(legacyGraph(items), {
  gmode: "graph",
  mode: "circle",
  label: itemNames,
  displaylabels: true,
  vertexCol: colors(itemLouvain.membership),
  vertexBorder: "none",
  edgeCol: "#94a3b8",
  edgeLwd: 0.012,
  width: 900,
  height: 720,
  seed,
});
const respondentPlot = gplot(legacyGraph(respondents), {
  gmode: "graph",
  mode: "fruchtermanreingold",
  displaylabels: false,
  vertexCol: colors(respondentLouvain.membership),
  vertexBorder: "none",
  edgeCol: "#cbd5e1",
  edgeLwd: 0.3,
  objectScale: 0.006,
  width: 1200,
  height: 900,
  seed,
});

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(outputDirectory, "programming-resilience.analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputDirectory, "programming-resilience.items.svg"), itemPlot.svg, "utf8"),
  writeFile(resolve(outputDirectory, "programming-resilience.respondents.svg"), respondentPlot.svg, "utf8"),
]);
console.log(`wrote synthetic analysis and two SVGs to ${outputDirectory}`);
console.log(`item network: ${items.nodes.length} nodes / ${items.edges.length} edges`);
console.log(`respondent network: ${respondents.nodes.length} nodes / ${respondents.edges.length} edges`);
