// Real-Chromium smoke test for the published ESM boundary and dedicated
// worker protocol. This is CI infrastructure; it does not create a web app.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><meta charset=utf-8><title>SNA.js browser smoke</title>");
      return;
    }
    const file = resolve(projectRoot, `.${pathname}`);
    if (!file.startsWith(`${projectRoot}${sep}`)) throw new Error("path outside project root");
    response.writeHead(200, { "content-type": mime.get(extname(file)) ?? "application/octet-stream" });
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
if (typeof address !== "object" || address === null) throw new Error("browser smoke server did not bind TCP");
const baseUrl = `http://127.0.0.1:${address.port}`;
const moduleBase = (process.env.SNA_CDN_BASE ?? "").replace(/\/$/, "");
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const diagnostics = [];
  page.on("console", (message) => diagnostics.push(`console:${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => diagnostics.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`));
  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  if (!response?.ok()) throw new Error(`browser harness returned HTTP ${response?.status() ?? "no response"}`);

  const result = await page.evaluate(async ({ moduleBase }) => {
    const modernUrl = moduleBase ? `${moduleBase}/dist/modern/index.js` : "/dist/modern/index.js";
    const workerUrl = moduleBase ? `${moduleBase}/dist/worker/index.js` : "/dist/worker/index.js";
    const browserRootUrl = moduleBase ? `${moduleBase}/dist/browser.min.js` : "/dist/browser.min.js";
    const modern = await import(modernUrl);
    const workerApi = await import(workerUrl);
    const browserRoot = await import(browserRootUrl);
    const input = {
      directed: true,
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "a" },
      ],
    };
    const direct = modern.pageRank(input);
    const worker = workerApi.createSnaWorker(() => {
      if (!moduleBase) return new Worker(workerUrl, { type: "module", name: "sna-browser-smoke" });
      const bootstrap = URL.createObjectURL(
        new Blob([`import ${JSON.stringify(workerUrl)};`], { type: "text/javascript" }),
      );
      const instance = new Worker(bootstrap, { type: "module", name: "sna-cdn-smoke" });
      setTimeout(() => URL.revokeObjectURL(bootstrap), 0);
      return instance;
    });
    try {
      const threaded = await worker.run("pageRank", { input });
      return {
        direct,
        threaded,
        hasSparse: typeof modern.makeSparseGraph === "function",
        rootDensity: browserRoot.gden([[0, 1], [1, 0]], { mode: "graph" }),
      };
    } finally {
      worker.terminate();
    }
  }, { moduleBase });

  const expected = [1 / 3, 1 / 3, 1 / 3];
  const close = (values) =>
    Array.isArray(values) && values.length === expected.length && values.every((value, i) => Math.abs(value - expected[i]) < 1e-9);
  if (result.rootDensity !== 1 || !result.hasSparse || !close(result.direct?.values) || !close(result.threaded?.values)) {
    throw new Error(`unexpected Chromium result: ${JSON.stringify(result)}`);
  }
  if (diagnostics.length > 0) throw new Error(`Chromium diagnostics:\n${diagnostics.join("\n")}`);
  console.log(`Chromium ESM + Worker smoke passed (${moduleBase || "local dist"})`);
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
