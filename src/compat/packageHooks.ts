declare const __SNA_VERSION__: string | undefined;

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
  const version = options.version ?? (typeof __SNA_VERSION__ === "string" ? __SNA_VERSION__ : "dev");
  const versionLine = options.date ? `Version ${version} created on ${options.date}.` : `Version ${version}.`;
  const message = [
    `${packageName}: ${title}`,
    versionLine,
    "copyright (c) 2005, Carter T. Butts, University of California-Irvine",
    'For citation information, see the R sna package citation("sna").',
    "Type help(package=\"sna\") in R for the original package documentation.",
  ].join("\n");
  options.logger?.(message);
  return message;
}
