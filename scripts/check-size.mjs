// Release size gates for the packed npm artifact and each independently
// importable browser-safe entry. Run after `npm run build`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const MIB = 1024 * 1024;
const KIB = 1024;
const UNPACKED_LIMIT = 4 * MIB;
const ROOT_GZIP_LIMIT = 85 * KIB;
const FAMILY_GZIP_LIMIT = 75 * KIB;
const temporaryBase = process.env.SNA_JS_TEMP_ROOT ?? tmpdir();

const report = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--offline", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, npm_config_cache: join(temporaryBase, "sna-js-npm-cache") },
  }),
);
const { unpackedSize, size, entryCount } = report[0];
const packedFiles = (report[0].files ?? []).map((file) => file.path);

const failures = [];
if (unpackedSize > UNPACKED_LIMIT) {
  failures.push(`unpacked package ${(unpackedSize / MIB).toFixed(2)} MiB exceeds 4 MiB`);
}

const forbiddenPackPaths = [
  /\.(?:xls|xlsx|xlsm|xlsb)$/i,
  /(^|\/)(?:validation|private)(\/|$)/i,
  /(^|[./_-])local(?:[./_-]|$)/i,
  /receipt/i,
  /01_Programming_Resilience_811/i,
];
for (const file of packedFiles) {
  if (forbiddenPackPaths.some((pattern) => pattern.test(file))) {
    failures.push(`forbidden private/local artifact is present in npm pack: ${file}`);
  }
}
const allowedExampleArtifacts = new Set([
  "examples/data/programming-resilience.synthetic.csv",
  "examples/generated/programming-resilience.analysis.json",
  "examples/generated/programming-resilience.items.svg",
  "examples/generated/programming-resilience.respondents.svg",
]);
for (const file of packedFiles) {
  if ((file.startsWith("examples/data/") || file.startsWith("examples/generated/")) && !allowedExampleArtifacts.has(file)) {
    failures.push(`unapproved example data/generated artifact is present in npm pack: ${file}`);
  }
}
for (const required of [
  "dist/compat.d.ts",
  "dist/compat.d.cts",
  "scripts/write-compat-entry.mjs",
  "tsconfig.json",
  "tsup.config.ts",
]) {
  if (!packedFiles.includes(required)) failures.push(`required source/build artifact is missing from npm pack: ${required}`);
}

const entryLimits = new Map([
  ["dist/browser.min.js", ROOT_GZIP_LIMIT],
  // CJS entries are self-contained and therefore provide a conservative
  // family-size measurement; ESM entries share chunks and would undercount.
  ["dist/graph/index.cjs", FAMILY_GZIP_LIMIT],
  ["dist/centrality/index.cjs", FAMILY_GZIP_LIMIT],
  ["dist/statistics/index.cjs", FAMILY_GZIP_LIMIT],
  ["dist/community/index.cjs", FAMILY_GZIP_LIMIT],
  ["dist/prediction/index.cjs", FAMILY_GZIP_LIMIT],
  ["dist/modern/index.cjs", FAMILY_GZIP_LIMIT],
]);

console.log(
  `tarball ${(size / KIB).toFixed(0)} KiB; unpacked ${(unpackedSize / MIB).toFixed(2)} MiB; ${entryCount} files`,
);
for (const [file, limit] of entryLimits) {
  let bytes;
  try {
    bytes = gzipSync(readFileSync(file), { level: 9 }).byteLength;
  } catch (error) {
    failures.push(`${file} is missing or unreadable (${error instanceof Error ? error.message : String(error)})`);
    continue;
  }
  console.log(`${file}: ${(bytes / KIB).toFixed(1)} KiB gzip / ${limit / KIB} KiB budget`);
  if (bytes > limit) failures.push(`${file} ${(bytes / KIB).toFixed(1)} KiB gzip exceeds ${limit / KIB} KiB`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`size check FAILED: ${failure}`);
  process.exit(1);
}
console.log("size check passed");
