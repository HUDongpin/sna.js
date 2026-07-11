// Package size budget (technical review §F-011): fail if the unpacked
// package exceeds the limit so bloat cannot ship unnoticed.
import { execSync } from "node:child_process";

const LIMIT_MB = 2;

const report = JSON.parse(execSync("npm pack --dry-run --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const { unpackedSize, size, entryCount } = report[0];
const unpackedMb = unpackedSize / (1024 * 1024);

console.log(`tarball: ${(size / 1024).toFixed(0)} kB, unpacked: ${unpackedMb.toFixed(2)} MB, files: ${entryCount}`);
if (unpackedMb > LIMIT_MB) {
  console.error(`size check FAILED: unpacked ${unpackedMb.toFixed(2)} MB exceeds ${LIMIT_MB} MB budget`);
  process.exit(1);
}
console.log(`size check passed (budget ${LIMIT_MB} MB)`);
