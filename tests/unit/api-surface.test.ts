// Export-surface gate (review F-010): the public surface of every entry
// point is pinned in tests/api-surface.json. An unintended addition or
// removal fails here; a deliberate change means regenerating the snapshot
// (see the comment at the bottom) and calling it out in the CHANGELOG.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as root from "../../src/index";
import * as display from "../../src/display/index";
import * as compat from "../../src/compat/index";
import * as visualization from "../../src/visualization/index";
import * as visualizationThree from "../../src/visualization/three";

const snapshot = JSON.parse(readFileSync(join(__dirname, "../api-surface.json"), "utf8")) as Record<string, string[]>;

const ENTRIES: Record<string, Record<string, unknown>> = {
  root,
  display,
  compat,
  visualization,
  "visualization/three": visualizationThree,
};

describe("public API surface", () => {
  for (const [name, moduleExports] of Object.entries(ENTRIES)) {
    it(`${name} matches the pinned surface (${snapshot[name]!.length} exports)`, () => {
      const actual = Object.keys(moduleExports).sort();
      const expected = snapshot[name]!;
      const added = actual.filter((k) => !expected.includes(k));
      const removed = expected.filter((k) => !actual.includes(k));
      expect(added, "unexpected new exports — update tests/api-surface.json deliberately").toEqual([]);
      expect(removed, "missing exports — removing public API is a breaking change").toEqual([]);
    });
  }
});

// To regenerate after a deliberate surface change:
//   npm run build && node -e "$(cat <<'EOF'
//     (async () => {
//       const fs = require('node:fs');
//       const entries = { root: './dist/index.js', display: './dist/display/index.js', compat: './dist/compat.js', visualization: './dist/visualization/index.js', 'visualization/three': './dist/visualization/three.js' };
//       const surface = {};
//       for (const [k, p] of Object.entries(entries)) surface[k] = Object.keys(await import(p)).sort();
//       fs.writeFileSync('tests/api-surface.json', JSON.stringify(surface, null, 2) + '\n');
//     })();
//   EOF
//   )"
