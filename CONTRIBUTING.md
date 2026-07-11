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
  cases or a documented divergence.

## Before opening a PR

```bash
npm run check:publish
```

must pass, and the CHANGELOG needs an entry — **mandatory for anything that
changes numerical results**, however slightly.

## Releasing (maintainers)

1. Update `CHANGELOG.md`, bump `version` in `package.json` (semver).
2. `npm run check:publish` on a clean checkout.
3. Tag `vX.Y.Z`, push, and publish from CI (`npm publish --provenance`).
   Never publish from a laptop; never hand-edit `dist/`.
