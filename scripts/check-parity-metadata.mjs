// Keep README validation claims synchronized with the executable fixture.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(join(root, "fixtures/r-sna-2.8/parity.json"), "utf8"));
const readme = await readFile(join(root, "README.md"), "utf8");

const graphCount = Object.keys(fixture.graphs).length;
const caseCount = fixture.cases.length;
const familyCount = new Set(fixture.cases.map((entry) => entry.fn)).size;
const claim = `${graphCount} graphs / ${caseCount} cases / ${familyCount} function families`;

if (!readme.includes(`<!-- parity-counts: ${claim} -->`)) {
  console.error(`README parity marker is stale; expected: <!-- parity-counts: ${claim} -->`);
  process.exit(1);
}

console.log(`parity metadata: ${claim}`);
