/** Options accepted by long-running routines. */
export interface CancellationOptions {
  /**
   * Abort the computation. The signal is checked at loop granularity (per
   * source vertex, per permutation replicate, ...). On the main thread only a
   * pre-aborted signal or one aborted from inside an `onProgress` callback
   * can interrupt the synchronous loop; for true asynchronous cancellation
   * run the routine in a worker and terminate it (see the `./worker`
   * subpath).
   */
  readonly signal?: AbortSignal;
  /** Coarse progress callback: `completed` of `total` outer-loop steps. */
  readonly onProgress?: (completed: number, total: number) => void;
}

export function checkAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const reason: unknown = signal.reason;
  throw reason instanceof Error ? reason : new DOMException("The operation was aborted", "AbortError");
}
