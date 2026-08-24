// Verify the exact npm registry attestation bundle cryptographically, then
// parse claims from that same in-memory bundle. `npm audit signatures` remains
// a separate registry/package acceptance gate in the publish workflow.
import { pathToFileURL } from "node:url";

import { verify as verifySigstore } from "sigstore";

export const SLSA_PROVENANCE_TYPE = "https://slsa.dev/provenance/v1";
export const IN_TOTO_STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
export const GITHUB_ACTIONS_BUILD_TYPE =
  "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1";
export const GITHUB_HOSTED_BUILDER = "https://github.com/actions/runner/github-hosted";
export const GITHUB_ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
export const IN_TOTO_PAYLOAD_TYPE = "application/vnd.in-toto+json";

const fail = (label, actual, expected) => {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${String(actual)}`);
  }
};

const escapeRegularExpression = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exactCertificateIdentity = ({ repository, workflowPath, ref }) =>
  `${repository}/${workflowPath}@${ref}`;

const expectedSourceUri = ({ repository, ref }) => `git+${repository}@${ref}`;

const parseIntegrity = (integrity) => {
  if (typeof integrity !== "string" || !integrity.startsWith("sha512-")) {
    throw new Error("expected npm sha512 integrity");
  }
  const encoded = integrity.slice("sha512-".length);
  const digest = Buffer.from(encoded, "base64");
  if (digest.length !== 64 || digest.toString("base64") !== encoded) {
    throw new Error("expected canonical npm sha512 integrity");
  }
  return digest.toString("hex");
};

export const decodeProvenanceStatement = (bundle) => {
  const envelope = bundle?.dsseEnvelope;
  fail("DSSE payload type", envelope?.payloadType, IN_TOTO_PAYLOAD_TYPE);
  if (typeof envelope?.payload !== "string") {
    throw new Error("SLSA provenance DSSE payload is missing");
  }

  try {
    return JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
  } catch (error) {
    throw new Error("SLSA provenance DSSE payload is not valid base64 JSON", { cause: error });
  }
};

export const validateProvenanceStatement = (statement, expectations) => {
  const { packageName, packageVersion, repository, workflowPath, ref, commitSha, integrity } = expectations;
  fail("statement type", statement?._type, IN_TOTO_STATEMENT_TYPE);
  fail("predicate type", statement?.predicateType, SLSA_PROVENANCE_TYPE);

  const buildDefinition = statement?.predicate?.buildDefinition;
  fail("build type", buildDefinition?.buildType, GITHUB_ACTIONS_BUILD_TYPE);

  const workflow = buildDefinition?.externalParameters?.workflow;
  fail("source repository", workflow?.repository, repository);
  fail("workflow path", workflow?.path, workflowPath);
  fail("source ref", workflow?.ref, ref);
  fail("builder", statement?.predicate?.runDetails?.builder?.id, GITHUB_HOSTED_BUILDER);

  const normalizedCommit = commitSha.toLowerCase();
  const sourceUri = expectedSourceUri(expectations);
  const resolved = buildDefinition?.resolvedDependencies;
  const resolvedSource = Array.isArray(resolved)
    ? resolved.find(
        (dependency) =>
          dependency?.uri === sourceUri &&
          typeof dependency?.digest?.gitCommit === "string" &&
          dependency.digest.gitCommit.toLowerCase() === normalizedCommit,
      )
    : undefined;
  if (!resolvedSource) {
    throw new Error(`resolved source ${sourceUri} at commit ${commitSha} is missing from provenance`);
  }

  const subject = statement?.subject?.find((candidate) => {
    if (typeof candidate?.name !== "string") return false;
    try {
      return decodeURIComponent(candidate.name) === `pkg:npm/${packageName}@${packageVersion}`;
    } catch {
      return false;
    }
  });
  if (!subject) {
    throw new Error(`provenance subject pkg:npm/${packageName}@${packageVersion} is missing`);
  }
  fail("subject sha512", subject?.digest?.sha512?.toLowerCase(), parseIntegrity(integrity));

  return {
    builder: GITHUB_HOSTED_BUILDER,
    invocationId: statement?.predicate?.runDetails?.metadata?.invocationId ?? null,
    sourceUri,
  };
};

export const verifyNpmProvenance = async (
  expectations,
  { fetchImpl = fetch, verifyBundle = verifySigstore } = {},
) => {
  const response = await fetchImpl(expectations.attestationUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`attestation endpoint returned HTTP ${response.status}`);
  }
  const document = await response.json();
  const provenance = document?.attestations?.find(
    (attestation) => attestation?.predicateType === SLSA_PROVENANCE_TYPE,
  );
  const bundle = provenance?.bundle;
  if (!bundle || typeof bundle !== "object") {
    throw new Error("SLSA provenance Sigstore bundle is missing");
  }

  const certificateIdentity = exactCertificateIdentity(expectations);
  let signer;
  try {
    signer = await verifyBundle(bundle, {
      certificateIssuer: GITHUB_ACTIONS_ISSUER,
      certificateIdentityURI: `^${escapeRegularExpression(certificateIdentity)}$`,
      timeout: 15_000,
    });
  } catch (error) {
    throw new Error("Sigstore provenance verification failed", { cause: error });
  }
  fail("certificate issuer", signer?.identity?.extensions?.issuer, GITHUB_ACTIONS_ISSUER);
  fail("certificate identity", signer?.identity?.subjectAlternativeName, certificateIdentity);

  const statement = decodeProvenanceStatement(bundle);
  const claims = validateProvenanceStatement(statement, expectations);
  return {
    package: `${expectations.packageName}@${expectations.packageVersion}`,
    repository: expectations.repository,
    workflow: expectations.workflowPath,
    ref: expectations.ref,
    commitSha: expectations.commitSha,
    integrity: expectations.integrity,
    builder: claims.builder,
    sourceUri: claims.sourceUri,
    certificateIssuer: signer.identity.extensions.issuer,
    certificateIdentity: signer.identity.subjectAlternativeName,
    invocationId: claims.invocationId,
    attestationUrl: expectations.attestationUrl,
  };
};

export const main = async (args = process.argv.slice(2)) => {
  const [
    attestationUrl,
    packageName,
    packageVersion,
    repository,
    workflowPath,
    ref,
    commitSha,
    integrity,
  ] = args;
  if (
    [attestationUrl, packageName, packageVersion, repository, workflowPath, ref, commitSha, integrity].some(
      (value) => !value,
    )
  ) {
    throw new TypeError(
      "usage: verify-npm-provenance.mjs <url> <package> <version> <repository-url> <workflow-path> <ref> <sha> <sha512-integrity>",
    );
  }

  const receipt = await verifyNpmProvenance({
    attestationUrl,
    packageName,
    packageVersion,
    repository,
    workflowPath,
    ref,
    commitSha,
    integrity,
  });
  console.log(JSON.stringify(receipt));
};

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  await main();
}
