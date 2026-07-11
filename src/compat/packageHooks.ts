export interface AttachOptions {
  readonly logger?: (message: string) => void;
  readonly packageName?: string;
  readonly title?: string;
  readonly version?: string;
  readonly date?: string;
}

export function onLoad(): void {
  // R loads a native library here; SNA.js is browser-safe and has no native side effect.
}

export function onAttach(options: AttachOptions = {}): string {
  const packageName = options.packageName ?? "sna.js";
  const title = options.title ?? "TypeScript/JavaScript tools for social network analysis";
  const version = options.version ?? "0.0.0";
  const date = options.date ?? "2026-05-27";
  const message = [
    `${packageName}: ${title}`,
    `Version ${version} created on ${date}.`,
    "copyright (c) 2005, Carter T. Butts, University of California-Irvine",
    'For citation information, see the R sna package citation("sna").',
    "Type help(package=\"sna\") in R for the original package documentation.",
  ].join("\n");
  options.logger?.(message);
  return message;
}
