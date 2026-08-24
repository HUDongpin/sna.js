# Contributing to SNA.js

Thanks for helping make a trustworthy JavaScript port of R `sna`.

## Development setup

```bash
git clone https://github.com/HUDongpin/sna.js.git
cd sna.js
npm ci
npm test            # unit + malformed-input + R golden parity (from committed fixtures)
npm run typecheck   # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run build       # tsup → dist/
npm run check:publish   # everything above + smoke tests + size budget + pack dry-run
```

Node ≥ 20 is required. R is **not** required unless you regenerate parity
fixtures.

Modern algorithms additionally use committed fixtures generated with pinned
NetworkX/python-igraph versions plus mathematical invariants. Regenerate them
with the isolated requirements in `scripts/modern-oracle-requirements.txt`;
Python remains a development oracle and is never a package dependency.

## The parity workflow (the important part)

Every ported function must either match R `sna` 2.8 numerically or carry a
documented divergence in the README table. The proof is executable:

1. `scripts/generate-r-snapshots.R` runs real R `sna` 2.8 over a fixed graph
   corpus and writes `fixtures/r-sna-2.8/parity.json` (with provenance:
   R version, sna version, seeds, timestamp).
2. `tests/parity/parity.test.ts` replays every case through the TypeScript
   port (tolerance 1e-9; 1e-6 for iterative linear algebra).

To extend coverage:

1. Add cases (or corpus graphs) to `scripts/generate-r-snapshots.R`.
2. Install R with `sna` 2.8 and `jsonlite`, then run `npm run r:parity`.
3. Add a runner mapping in `tests/parity/parity.test.ts` if the function is
   new to the suite.
4. Commit the regenerated fixture together with the code.

Never hand-edit `fixtures/` — fixtures must always be reproducible from the
generator script.

## Porting standards

- **Strict TypeScript**: zero `any`, zero `@ts-ignore`; `noUncheckedIndexedAccess` stays on.
- **Match R semantics** including defaults (`ignore.eval`, cmode forcing,
  missing-tie handling). When R's behavior is a bug (e.g. crashes on a typo)
  or web-hostile (console warnings, non-converged results), diverge
  deliberately and document it in the README divergence table.
- Reference the R source you ported in a header comment, e.g.
  `// Ported from R sna 2.8: R/nli.R \`degree\` and src/nli.c \`degree_R\`.`
- **No `console.*` in `src/`**. Signal failures with typed errors.
- **Browser-safe core**: no Node-only or DOM dependencies in `src/` outside
  `visualization/`.
- Zero-based vertex indices in all public APIs.
- Every new function needs unit tests (including malformed input) and parity
  cases, external-oracle fixtures, or a documented invariant/experimental
  boundary in `docs/CAPABILITY_MATRIX.md`.
- New modern graph routines must operate on CSR/CSC without constructing a
  dense `n × n` matrix. Randomized routines require `seed`/`rng` support and
  canonical node-order results.
- Do not commit private source workbooks, participant rows, private edge lists,
  or reversible node-level results. The programming-resilience workbook is a
  local acceptance input only.

## Before opening a PR

```bash
npm run check:publish
```

must pass, and the CHANGELOG needs an entry — **mandatory for anything that
changes numerical results**, however slightly.

## Releasing (maintainers)

1. Update `CHANGELOG.md`, bump `version` in `package.json` (semver).
2. `npm run check:publish` on a clean checkout.
3. Configure the npm trusted publisher exactly for owner `HUDongpin`,
   repository `sna.js`, workflow `publish.yml`, no environment restriction,
   and the `npm publish` action only. Verify this before creating the final
   tag.
4. Merge a green pull request, create and push `vX.Y.Z`, and let the tag-only
   workflow run. It rejects non-tags and mismatched tag/package/checkout SHAs,
   re-runs `npm run check:publish`, publishes through OIDC with provenance,
   verifies npm integrity plus clean consumers and CDN import, then creates the
   matching GitHub Release receipt.
5. Never use a local 2FA publish as the normal release path and never hand-edit
   `dist/`.
