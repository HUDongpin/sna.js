// `snaR` mirrors the whole legacy API, so bundling src/compat/index.ts as a
// separate CommonJS entry would duplicate roughly the entire root bundle.
// Write tiny wrappers only after tsup (including its declaration phase) has
// finished; a tsup onSuccess hook can race with declaration output cleanup.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve(new URL("../dist", import.meta.url).pathname);

await mkdir(dist, { recursive: true });
await Promise.all([
  writeFile(resolve(dist, "compat.js"), 'export { snaR, onAttach, onLoad } from "./index.js";\n'),
  writeFile(
    resolve(dist, "compat.cjs"),
    'const root = require("./index.cjs");\nmodule.exports = { snaR: root.snaR, onAttach: root.onAttach, onLoad: root.onLoad };\n',
  ),
  writeFile(
    resolve(dist, "compat.d.ts"),
    'export { snaR, onAttach, onLoad } from "./index.js";\nexport type { AttachOptions } from "./index.js";\n',
  ),
  writeFile(
    resolve(dist, "compat.d.cts"),
    'export { snaR, onAttach, onLoad } from "./index.cjs";\nexport type { AttachOptions } from "./index.cjs";\n',
  ),
]);
