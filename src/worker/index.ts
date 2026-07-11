// Web Worker adapter: run heavy SNA routines off the main thread with
// progress events and hard cancellation (worker termination).
//
// The same module serves as BOTH the worker entry and the main-thread client:
// loaded inside a dedicated worker it self-registers an onmessage handler;
// imported on the main thread it only exposes the client API.
//
//   import { createSnaWorker } from "@peterhudongpin/sna.js/worker";
//   const client = createSnaWorker(() => new Worker(workerUrl, { type: "module" }));
//   const scores = await client.run("betweenness", { input }, { mode: "graph" }, {
//     signal: controller.signal,
//     onProgress: (done, total) => render(done / total),
//   });
//
// where `workerUrl` resolves this module in your bundler/runtime, e.g. Vite:
//   const workerUrl = new URL("./sna-worker.js", import.meta.url)   // a one-line
//   // file containing: import "@peterhudongpin/sna.js/worker";
import { checkAborted, type CancellationOptions } from "../core/cancellation";
import type { GraphInput } from "../core/types";
import { betweenness } from "../algorithms/betweenness";
import { closeness } from "../algorithms/closeness";
import { degree } from "../algorithms/degree";
import { gden } from "../algorithms/density";
import { evcent } from "../algorithms/evcent";
import { flowbet } from "../algorithms/flowbet";
import { geodist } from "../algorithms/geodist";
import { componentDist } from "../algorithms/connectivity";
import { dyadCensus, grecip, gtrans, hierarchy, mutuality } from "../algorithms/graphStatistics";
import { cugTest, qaptest, type CugTestStatistic, type GraphTestStatistic } from "../algorithms/graphTests";
import { loadcent } from "../algorithms/loadcent";
import { stresscent } from "../algorithms/stresscent";
import { cliqueCensus, kcores, kcycleCensus, kpathCensus, maxflow } from "../algorithms/structural";
import { triadCensus } from "../algorithms/triads";
import { gcor, gscor, hdist } from "../algorithms/graphComparison";

/** Graph statistics accepted by name for `qaptest` (stack, {g1, g2}). */
const QAP_STATISTICS: Record<string, GraphTestStatistic> = {
  gcor: (stack, o) => gcor(stack as number[][][], { g1: (o.g1 as number) ?? 0, g2: (o.g2 as number) ?? 1 }),
  gscor: (stack, o) => gscor(stack as number[][][], { g1: (o.g1 as number) ?? 0, g2: (o.g2 as number) ?? 1 }),
  hdist: (stack, o) => hdist(stack as number[][][], { g1: (o.g1 as number) ?? 0, g2: (o.g2 as number) ?? 1 }),
};

/** Graph statistics accepted by name for `cugTest` (matrix, {mode, diag}). */
const CUG_STATISTICS: Record<string, CugTestStatistic> = {
  gtrans: (matrix, o) => gtrans(matrix, o),
  gden: (matrix, o) => gden(matrix, o),
  grecip: (matrix, o) => grecip(matrix, o),
  mutuality: (matrix, o) => mutuality(matrix, o),
  hierarchy: (matrix, o) => hierarchy(matrix, o),
};

type TaskRunner = (payload: Record<string, unknown>, options: Record<string, unknown>) => unknown;

const input = (payload: Record<string, unknown>): GraphInput => payload.input as GraphInput;

const TASKS = {
  betweenness: (p, o) => betweenness(input(p), o),
  closeness: (p, o) => closeness(input(p), o),
  stresscent: (p, o) => stresscent(input(p), o),
  loadcent: (p, o) => loadcent(input(p), o),
  geodist: (p, o) => geodist(input(p), o),
  triadCensus: (p, o) => triadCensus(input(p), o),
  dyadCensus: (p, o) => dyadCensus(input(p), o),
  evcent: (p, o) => evcent(input(p), o),
  degree: (p, o) => degree(input(p), o),
  gden: (p, o) => gden(input(p), o),
  gtrans: (p, o) => gtrans(input(p), o),
  kcores: (p, o) => kcores(input(p), o),
  componentDist: (p, o) => componentDist(input(p), o),
  flowbet: (p, o) => flowbet(input(p), o),
  maxflow: (p, o) => maxflow(input(p), o),
  cliqueCensus: (p, o) => cliqueCensus(input(p), o),
  kcycleCensus: (p, o) => kcycleCensus(input(p), o),
  kpathCensus: (p, o) => kpathCensus(input(p), o),
  qaptest: (p, o) => {
    const statistic = QAP_STATISTICS[p.statistic as string];
    if (!statistic) throw new RangeError(`unknown qaptest statistic "${String(p.statistic)}" (worker protocol accepts: ${Object.keys(QAP_STATISTICS).join(", ")})`);
    return qaptest(p.input as GraphInput[], statistic, o);
  },
  cugTest: (p, o) => {
    const statistic = CUG_STATISTICS[p.statistic as string];
    if (!statistic) throw new RangeError(`unknown cugTest statistic "${String(p.statistic)}" (worker protocol accepts: ${Object.keys(CUG_STATISTICS).join(", ")})`);
    return cugTest(input(p), statistic, o);
  },
} satisfies Record<string, TaskRunner>;

export type SnaWorkerFunction = keyof typeof TASKS;

export interface SnaWorkerRequest {
  readonly sna: true;
  readonly id: number;
  readonly fn: SnaWorkerFunction;
  readonly payload: Record<string, unknown>;
  readonly options?: Record<string, unknown>;
  readonly reportProgress?: boolean;
}

export type SnaWorkerResponse =
  | { readonly sna: true; readonly id: number; readonly type: "result"; readonly result: unknown }
  | { readonly sna: true; readonly id: number; readonly type: "error"; readonly name: string; readonly message: string }
  | { readonly sna: true; readonly id: number; readonly type: "progress"; readonly completed: number; readonly total: number };

/**
 * Execute one protocol request synchronously. Runtime-agnostic: the worker
 * entry below uses it, and Node callers can wire it to `worker_threads`.
 */
export function executeSnaTask(request: Pick<SnaWorkerRequest, "fn" | "payload" | "options">, cancellation: CancellationOptions = {}): unknown {
  const runner: TaskRunner | undefined = TASKS[request.fn];
  if (!runner) throw new RangeError(`unknown sna worker function "${String(request.fn)}" (supported: ${Object.keys(TASKS).join(", ")})`);
  checkAborted(cancellation.signal);
  const options: Record<string, unknown> = { ...(request.options ?? {}) };
  if (cancellation.signal) options.signal = cancellation.signal;
  if (cancellation.onProgress) options.onProgress = cancellation.onProgress;
  return runner(request.payload, options);
}

interface PendingTask {
  readonly id: number;
  readonly onProgress: ((completed: number, total: number) => void) | undefined;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

/**
 * Main-thread client. One task runs at a time; `run` calls queue up.
 * Aborting a task terminates the worker (the only way to interrupt a busy
 * thread) and a fresh worker is spawned for the next task.
 */
export class SnaWorkerClient {
  #createWorker: () => Worker;
  #worker: Worker | null = null;
  #pending: PendingTask | null = null;
  #queueTail: Promise<unknown> = Promise.resolve();
  #nextId = 1;

  constructor(createWorker: () => Worker) {
    this.#createWorker = createWorker;
  }

  run<T = unknown>(
    fn: SnaWorkerFunction,
    payload: Record<string, unknown>,
    options?: Record<string, unknown>,
    cancellation: CancellationOptions = {},
  ): Promise<T> {
    const execute = (): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        if (cancellation.signal?.aborted) {
          reject(abortError(cancellation.signal));
          return;
        }
        const id = this.#nextId;
        this.#nextId += 1;
        this.#pending = { id, onProgress: cancellation.onProgress, resolve: resolve as (value: unknown) => void, reject };
        const onAbort = (): void => this.#abortPending();
        cancellation.signal?.addEventListener("abort", onAbort, { once: true });
        const settle = <V,>(fnDone: (value: V) => void) => (value: V): void => {
          cancellation.signal?.removeEventListener("abort", onAbort);
          this.#pending = null;
          fnDone(value);
        };
        this.#pending = { id, onProgress: cancellation.onProgress, resolve: settle(resolve) as (value: unknown) => void, reject: settle(reject) };
        const request: SnaWorkerRequest = {
          sna: true,
          id,
          fn,
          payload,
          ...(options ? { options } : {}),
          reportProgress: cancellation.onProgress !== undefined,
        };
        this.#ensureWorker().postMessage(request);
      });
    const queued = this.#queueTail.then(execute, execute);
    this.#queueTail = queued.catch(() => undefined);
    return queued;
  }

  /** Terminate the worker immediately, rejecting any in-flight task. */
  terminate(): void {
    this.#abortPending();
  }

  #ensureWorker(): Worker {
    if (!this.#worker) {
      const worker = this.#createWorker();
      worker.onmessage = (event: MessageEvent): void => this.#handleMessage(event.data as SnaWorkerResponse);
      worker.onerror = (event: ErrorEvent): void => {
        this.#pending?.reject(new Error(event.message || "sna worker crashed"));
        this.#resetWorker();
      };
      this.#worker = worker;
    }
    return this.#worker;
  }

  #handleMessage(message: SnaWorkerResponse): void {
    if (typeof message !== "object" || message === null || message.sna !== true) return;
    const pending = this.#pending;
    if (!pending || message.id !== pending.id) return;
    if (message.type === "progress") {
      pending.onProgress?.(message.completed, message.total);
      return;
    }
    if (message.type === "result") pending.resolve(message.result);
    else {
      const error = new Error(message.message);
      error.name = message.name;
      pending.reject(error);
    }
  }

  #abortPending(): void {
    this.#pending?.reject(abortError());
    this.#pending = null;
    this.#resetWorker();
  }

  #resetWorker(): void {
    this.#worker?.terminate();
    this.#worker = null;
  }
}

export function createSnaWorker(createWorker: () => Worker): SnaWorkerClient {
  return new SnaWorkerClient(createWorker);
}

function abortError(signal?: AbortSignal): unknown {
  const reason: unknown = signal?.reason;
  if (reason instanceof Error) return reason;
  return new DOMException("The operation was aborted", "AbortError");
}

// ---------------------------------------------------------------- worker ----
// Self-register when loaded inside a dedicated Web Worker (browser/Deno/Bun).
interface WorkerScopeLike {
  WorkerGlobalScope?: abstract new () => object;
  document?: unknown;
  postMessage?: (message: unknown) => void;
  addEventListener?: (type: "message", listener: (event: { data: unknown }) => void) => void;
}

const scope = globalThis as WorkerScopeLike;
const insideWorker =
  typeof scope.WorkerGlobalScope === "function" &&
  globalThis instanceof scope.WorkerGlobalScope &&
  typeof scope.postMessage === "function" &&
  typeof scope.addEventListener === "function";

if (insideWorker) {
  scope.addEventListener!("message", (event) => {
    const request = event.data as SnaWorkerRequest;
    if (typeof request !== "object" || request === null || request.sna !== true) return;
    const post = scope.postMessage!.bind(scope);
    try {
      const cancellation: CancellationOptions = request.reportProgress
        ? { onProgress: (completed, total) => post({ sna: true, id: request.id, type: "progress", completed, total } satisfies SnaWorkerResponse) }
        : {};
      const result = executeSnaTask(request, cancellation);
      post({ sna: true, id: request.id, type: "result", result } satisfies SnaWorkerResponse);
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      post({ sna: true, id: request.id, type: "error", name, message } satisfies SnaWorkerResponse);
    }
  });
}
