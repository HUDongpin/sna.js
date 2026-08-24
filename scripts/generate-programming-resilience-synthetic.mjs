// Deterministic, fully synthetic survey data for the public SNA.js examples.
//
// This generator intentionally does not read or fit the private workbook used
// during local acceptance.  It only preserves the public schema: ID, Gender,
// and four groups of four 1-5 Likert items.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROWS = 240;
const SEED = "programming-resilience-public-v1";
const HEADERS = [
  "ID",
  "Gender",
  "Cmt1",
  "Cmt2",
  "Cmt3",
  "Cmt4",
  "Cnf1",
  "Cnf2",
  "Cnf3",
  "Cnf4",
  "Cop1",
  "Cop2",
  "Cop3",
  "Cop4",
  "Cmp1",
  "Cmp2",
  "Cmp3",
  "Cmp4",
];

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function likert(value) {
  if (value < -1.15) return 1;
  if (value < -0.35) return 2;
  if (value < 0.35) return 3;
  if (value < 1.15) return 4;
  return 5;
}

export function generateSyntheticRows() {
  const rng = mulberry32(hashSeed(SEED));
  const rows = [];
  for (let index = 0; index < ROWS; index += 1) {
    const general = normal(rng);
    const gender = index % 2 === 0 ? "F" : "M";
    const factors = Array.from({ length: 4 }, () => 0.48 * general + 0.88 * normal(rng));
    const items = factors.flatMap((factor, factorIndex) =>
      Array.from({ length: 4 }, (_, itemIndex) => {
        const loading = 0.78 - itemIndex * 0.035;
        const crossLoading = factorIndex === 2 ? 0.12 : 0.08;
        const latent = loading * factor + crossLoading * general + 0.58 * normal(rng);
        return likert(latent);
      }),
    );
    rows.push([index + 1, gender, ...items]);
  }
  return rows;
}

export function toCsv(rows) {
  return [HEADERS, ...rows].map((row) => row.join(",")).join("\n") + "\n";
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = resolve(root, "examples/data/programming-resilience.synthetic.csv");
  const expected = toCsv(generateSyntheticRows());
  if (process.argv.includes("--check")) {
    const actual = await readFile(output, "utf8");
    if (actual !== expected) {
      throw new Error(`synthetic fixture drift: regenerate ${output}`);
    }
    console.log(`verified ${ROWS} deterministic synthetic rows at ${output}`);
  } else {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, expected, "utf8");
    console.log(`wrote ${ROWS} synthetic rows to ${output}`);
  }
  console.log(`seed=${SEED}`);
}
