#!/usr/bin/env node
// Local-only Chromium/Web Worker acceptance for the private 811-node graph.
// The graph is served only on loopback and no row/node result is written into
// the Git checkout or included in the compact receipt.
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const validationDirectory = resolve(projectRoot, "..", "validation");
const relation = relative(projectRoot, validationDirectory);
if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
  throw new RangeError("browser sample validation output must remain outside the Git checkout");
}

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": mime.get(".html") });
      response.end("<!doctype html><meta charset=utf-8><title>SNA.js private Worker acceptance</title>");
      return;
    }
    let file;
    if (pathname === "/respondent-network.local.json" || pathname === "/item-network.local.json") {
      file = resolve(validationDirectory, pathname.slice(1));
    } else if (pathname.startsWith("/dist/")) {
      file = resolve(projectRoot, `.${pathname}`);
      if (!file.startsWith(`${resolve(projectRoot, "dist")}${sep}`)) throw new Error("invalid dist path");
    } else {
      throw new Error("not found");
    }
    response.writeHead(200, {
      "content-type": mime.get(extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(await readFile(file));
  } catch (error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

await new Promise((resolveListen, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
if (typeof address !== "object" || address === null) throw new Error("loopback server did not bind TCP");

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const diagnostics = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") diagnostics.push(`console:${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => diagnostics.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`));
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`private Worker harness returned HTTP ${response?.status() ?? "none"}`);

  const result = await page.evaluate(async () => {
    const { createSnaWorker } = await import("/dist/worker/index.js");
    const [respondents, items] = await Promise.all([
      fetch("/respondent-network.local.json").then((response) => response.json()),
      fetch("/item-network.local.json").then((response) => response.json()),
    ]);
    const client = createSnaWorker(
      () => new Worker("/dist/worker/index.js", { type: "module", name: "sna-private-sample" }),
    );
    const summarizeScores = (value) => ({
      nodes: value.nodes.length,
      sum: value.values?.reduce((total, item) => total + item, 0),
      hubsL2: value.hubs ? Math.sqrt(value.hubs.reduce((total, item) => total + item * item, 0)) : undefined,
      authoritiesL2: value.authorities ? Math.sqrt(value.authorities.reduce((total, item) => total + item * item, 0)) : undefined,
      meta: value.meta,
    });
    const summarizePartition = (value) => ({
      nodes: value.nodes.length,
      communities: value.communities.length,
      membershipCount: value.membership.length,
      quality: value.quality,
      meta: value.meta,
    });
    try {
      const pageRank = await client.run("pageRank", { input: respondents });
      const hits = await client.run("hits", { input: respondents }, { maxIterations: 200, tolerance: 1e-8 });
      const louvain = await client.run("louvain", { input: respondents }, { seed: "private-browser-v1" });
      const leiden = await client.run("leiden", { input: respondents }, { seed: "private-browser-v1", iterations: 3 });
      const infomap = await client.run("infomap", { input: respondents }, { seed: "private-browser-v1", trials: 3 });
      const girvanNewman = await client.run("girvanNewman", { input: items }, { maxCommunities: 4 });
      const prediction = await client.run("linkPrediction", {
        input: items,
        pairs: [[items.nodes[0].id, items.nodes.at(-1).id]],
        method: "jaccardCoefficient",
      });
      return {
        browser: navigator.userAgent,
        respondentInput: { nodes: respondents.nodes.length, edges: respondents.edges.length },
        itemInput: { nodes: items.nodes.length, edges: items.edges.length },
        pageRank: summarizeScores(pageRank),
        hits: summarizeScores(hits),
        louvain: summarizePartition(louvain),
        leiden: summarizePartition(leiden),
        infomap: summarizePartition(infomap),
        girvanNewman: { levels: girvanNewman.levels.length, meta: girvanNewman.meta },
        prediction: { pairs: prediction.pairs.length, score: prediction.pairs[0].score, meta: prediction.meta },
      };
    } finally {
      client.terminate();
    }
  });

  if (result.respondentInput.nodes !== 811 || result.respondentInput.edges !== 4559) {
    throw new Error(`unexpected private respondent graph: ${JSON.stringify(result.respondentInput)}`);
  }
  if (Math.abs(result.pageRank.sum - 1) > 1e-9) throw new Error(`browser PageRank sum is ${result.pageRank.sum}`);
  if (Math.abs(result.hits.hubsL2 - 1) > 1e-8 || Math.abs(result.hits.authoritiesL2 - 1) > 1e-8) {
    throw new Error(`browser HITS normalization failed: ${JSON.stringify(result.hits)}`);
  }
  if (diagnostics.length > 0) throw new Error(`browser diagnostics:\n${diagnostics.join("\n")}`);

  await mkdir(validationDirectory, { recursive: true });
  const receiptPath = resolve(validationDirectory, "browser-worker-receipt.local.json");
  await writeFile(receiptPath, `${JSON.stringify({ localOnly: true, ...result }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ receiptPath, ...result }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
