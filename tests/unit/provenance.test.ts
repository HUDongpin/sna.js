import { readFileSync } from "node:fs";
import { join } from "node:path";

import { verify as verifySigstore, type Bundle, type VerifyOptions } from "sigstore";
import { describe, expect, it } from "vitest";

// Release tooling is intentionally plain ESM JavaScript and is not part of the
// public package declarations.
// @ts-expect-error no declaration file is emitted for release tooling
import { decodeProvenanceStatement, validateProvenanceStatement, verifyNpmProvenance } from "../../scripts/verify-npm-provenance.mjs";

type JsonObject = Record<string, any>;

// Public registry fixture for hina-js@0.1.0, published by HUDongpin through a
// GitHub-hosted npm Trusted Publishing workflow on 2026-08-24.
const fixture = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/npm-provenance-hina-js-0.1.0.json"), "utf8"),
) as JsonObject;

const expectations = {
  attestationUrl: "",
  packageName: "hina-js",
  packageVersion: "0.1.0",
  repository: "https://github.com/HUDongpin/hina",
  workflowPath: ".github/workflows/release.yml",
  ref: "refs/tags/v0.1.0",
  commitSha: "06905a995b6a8a2c85345e54668ff8e6364c1bb0",
  integrity:
    "sha512-Cs6rJAeyGoXdYQhKqgjY4humeLTI/AnmXCgOj+THIal0uDmE6TV8xAiuewZYvGVyts41IGKHA2RYF7I2f+ErLQ==",
};

const asDataUrl = (document: JsonObject) =>
  `data:application/json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;

const provenanceBundle = (document: JsonObject) => document.attestations[0].bundle as JsonObject;

const verifyBundleFromCache = (bundle: JsonObject, options: VerifyOptions) =>
  verifySigstore(bundle as Bundle, {
    ...options,
    tufCachePath: process.env.SNA_TEST_SIGSTORE_TUF_CACHE,
    tufForceCache: true,
  });

describe("npm provenance release verifier", () => {
  it(
    "cryptographically verifies and parses the same real npm Sigstore bundle",
    async () => {
      const receipt = await verifyNpmProvenance(
        {
          ...expectations,
          attestationUrl: asDataUrl(fixture),
        },
        { verifyBundle: verifyBundleFromCache },
      );

      expect(receipt).toMatchObject({
        package: "hina-js@0.1.0",
        repository: expectations.repository,
        workflow: expectations.workflowPath,
        ref: expectations.ref,
        commitSha: expectations.commitSha,
        integrity: expectations.integrity,
        sourceUri: `git+${expectations.repository}@${expectations.ref}`,
        certificateIssuer: "https://token.actions.githubusercontent.com",
        certificateIdentity:
          "https://github.com/HUDongpin/hina/.github/workflows/release.yml@refs/tags/v0.1.0",
      });
    },
    30_000,
  );

  it(
    "rejects a tampered DSSE signature before accepting claims",
    async () => {
      const tampered = structuredClone(fixture);
      const signature = provenanceBundle(tampered).dsseEnvelope.signatures[0];
      const bytes = Buffer.from(signature.sig, "base64");
      bytes[0] = bytes[0]! ^ 0xff;
      signature.sig = bytes.toString("base64");

      await expect(
        verifyNpmProvenance(
          {
            ...expectations,
            attestationUrl: asDataUrl(tampered),
          },
          { verifyBundle: verifyBundleFromCache },
        ),
      ).rejects.toThrow("Sigstore provenance verification failed");
    },
    30_000,
  );

  it("requires source URI, tag ref, and commit on the same resolved dependency", () => {
    const statement = structuredClone(decodeProvenanceStatement(provenanceBundle(fixture)));
    statement.predicate.buildDefinition.resolvedDependencies[0].uri =
      "git+https://example.invalid/wrong@refs/tags/wrong";

    expect(() => validateProvenanceStatement(statement, expectations)).toThrow(
      `resolved source git+${expectations.repository}@${expectations.ref} at commit ${expectations.commitSha} is missing`,
    );
  });

  it("requires the GitHub Actions workflow build type", () => {
    const statement = structuredClone(decodeProvenanceStatement(provenanceBundle(fixture)));
    statement.predicate.buildDefinition.buildType = "https://example.invalid/build";

    expect(() => validateProvenanceStatement(statement, expectations)).toThrow("build type mismatch");
  });
});
