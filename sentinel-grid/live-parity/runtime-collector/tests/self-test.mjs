import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createCollectorRuntime } from '../collector-core.mjs';

const exec = promisify(execFile);
const kernelPath = path.resolve(process.argv[2] ?? process.env.SENTINEL_GRID_KERNEL_PATH ?? '');
assert(kernelPath, 'Kernel path is required');
const identity = await import(new URL(`file://${path.join(kernelPath, 'src', 'lab', 'zeknova-stage2f-identity.js')}`));
const controlled = await import(new URL(`file://${path.join(kernelPath, 'src', 'lab', 'zeknova-controlled-evaluation.js')}`));
const SHA_RE = /^[a-f0-9]{64}$/;
const temp = await mkdtemp(path.join(os.tmpdir(), 'sentinel-grid-stage2f-collector-'));
try {
  const repo = path.join(temp, 'zeknova');
  const live = path.join(repo, 'sentinel-grid', 'live-parity');
  await mkdir(path.join(repo, 'src', 'game'), { recursive: true });
  await mkdir(path.join(repo, 'src', 'world'), { recursive: true });
  await mkdir(path.join(repo, 'azl'), { recursive: true });
  await writeFile(path.join(repo, 'src', 'game', 'PrimeShadowIntegration.js'), 'export const readOnly = true;\n');
  await writeFile(path.join(repo, 'src', 'world', 'PrimeShadow.js'), 'export const authority = "none";\n');
  await writeFile(path.join(repo, 'azl', 'zeknova-live-shadow-contract-v1.js'), 'globalThis.ZekNovaLiveShadowContract={AUTHORITY:"none-observe-record-compare-only"};\n');
  await exec('git', ['init', '-q'], { cwd: repo });
  await exec('git', ['config', 'user.email', 'collector-test@example.invalid'], { cwd: repo });
  await exec('git', ['config', 'user.name', 'Collector Test'], { cwd: repo });
  await exec('git', ['add', '.'], { cwd: repo });
  await exec('git', ['commit', '-qm', 'collector test runtime'], { cwd: repo });

  const runtimeIdentity = {
    sentinelRuntimeId: `sha256:${'a'.repeat(64)}`,
    generatedRuntimeProvenanceId: `sha256:${'b'.repeat(64)}`,
    canonicalStateSchemaVersion: 'test-state-v2',
    primeVersion: 'test-prime-v1',
    routerVersion: 'test-router-v1',
    authorityPolicyVersion: 'test-r0-policy-v1',
  };
  const generatedRuntimeProvenance = { generatedRuntimeProvenanceId: runtimeIdentity.generatedRuntimeProvenanceId };
  const campaignManifest = identity.buildStage2FCampaignManifest({
    runtimeIdentity,
    generatedRuntimeProvenance,
    campaignStartTime: '2026-08-14T00:00:00.000Z',
    qualificationThresholdPolicy: controlled.DEFAULT_STAGE2F_CAMPAIGN_THRESHOLDS,
    campaignMode: 'DRY_RUN',
    campaignState: 'ACTIVE',
  });
  const runtimeIdentityPath = path.join(temp, 'canonical-runtime-identity.json');
  const generatedRuntimeProvenancePath = path.join(temp, 'generated-runtime-provenance.json');
  const campaignManifestPath = path.join(temp, 'stage2f-campaign-manifest.json');
  await writeFile(runtimeIdentityPath, `${JSON.stringify(runtimeIdentity, null, 2)}\n`);
  await writeFile(generatedRuntimeProvenancePath, `${JSON.stringify(generatedRuntimeProvenance, null, 2)}\n`);
  await writeFile(campaignManifestPath, `${JSON.stringify(campaignManifest, null, 2)}\n`);

  const config = {
    schemaVersion: 1,
    host: '127.0.0.1',
    port: 43129,
    token: '0123456789abcdef0123456789abcdef0123456789abcdef',
    zeknovaRoot: repo,
    kernelPath,
    liveParityRoot: live,
    collectorId: 'sentinel-grid-stage2f-runtime-collector-test',
    environmentId: 'collector-self-test',
    evidenceMode: 'DRY_RUN',
    runtimeIdentityPath,
    generatedRuntimeProvenancePath,
    campaignManifestPath,
    runtimeFiles: [
      'azl/zeknova-live-shadow-contract-v1.js',
      'src/game/PrimeShadowIntegration.js',
      'src/world/PrimeShadow.js',
    ],
  };
  const runtime = await createCollectorRuntime(config);
  const runConfig = JSON.parse(await readFile(path.join(kernelPath, 'config', 'zeknova-parity-runs.json'), 'utf8'));
  const baseline = JSON.parse(await readFile(path.join(kernelPath, 'parity', 'zeknova-stage1az', 'legacy-baseline.json'), 'utf8'));
  const run = runConfig.fixtures[0];
  let envelope = JSON.parse(await readFile(path.join(kernelPath, run.file), 'utf8'));
  let legacyEvidence = baseline.fixtures.find((entry) => entry.fixtureId === run.fixtureId);
  // --- R8-R3-R2 compatibility hydration (in-memory only): historical envelopes predate stateIdentity ---
  // Do not modify historical fixture files on disk. Derive deterministic identity from the existing valid
  // legacyEvidence.sourceStateHash (lowercase SHA-256) already present in every fixture.
  const derivedIdentity = legacyEvidence.sourceStateHash;
  assert(typeof derivedIdentity === 'string' && SHA_RE.test(derivedIdentity), 'legacy sourceStateHash must be lowercase SHA-256');
  envelope = structuredClone(envelope);
  legacyEvidence = structuredClone(legacyEvidence);
  envelope.metadata = envelope.metadata ? structuredClone(envelope.metadata) : {};
  envelope.metadata.stateIdentity = derivedIdentity;
  envelope.snapshotId = `zeknova-live-state-${derivedIdentity.slice(0, 48)}`;
  legacyEvidence.stateIdentity = derivedIdentity;
  assert(SHA_RE.test(envelope.metadata.stateIdentity), 'hydrated stateIdentity must be lowercase SHA-256');
  // --- end hydration ---
  const context = {
    factionId: run.observerId,
    biomeId: run.observerId,
    missionId: 'collector-self-test-mission',
    missionPhase: 'opening',
    tensionBand: 'medium',
    infrastructureBand: 'developing',
    tick: envelope.payload.tick,
  };
  const session = await runtime.startSession({ environmentId: 'collector-self-test', evidenceMode: 'DRY_RUN' });
  const qualificationIdentity = { ...session.qualificationIdentityBase, samplingIdentity: derivedIdentity };
  const validCapture = { context, envelope, legacyEvidence, qualificationIdentity };
  const accepted = await runtime.submitCapture({ sessionId: session.sessionId, capture: validCapture });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.recordPass, true);
  assert.equal(accepted.authority.tier, 'R0');
  const duplicate = await runtime.submitCapture({ sessionId: session.sessionId, capture: validCapture });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.duplicate, true);

  const invalidIdentities = [
    Object.fromEntries(Object.entries(qualificationIdentity).filter(([key]) => key !== 'sentinelRuntimeId')),
    { ...qualificationIdentity, sentinelRuntimeId: `sha256:${'c'.repeat(64)}` },
    Object.fromEntries(Object.entries(qualificationIdentity).filter(([key]) => key !== 'generatedRuntimeProvenanceId')),
    { ...qualificationIdentity, generatedRuntimeProvenanceId: `sha256:${'c'.repeat(64)}` },
    Object.fromEntries(Object.entries(qualificationIdentity).filter(([key]) => key !== 'stage2fCampaignId')),
    { ...qualificationIdentity, stage2fCampaignId: `sha256:${'c'.repeat(64)}` },
    { ...qualificationIdentity, authorityTier: 'R1' },
    { ...qualificationIdentity, identityEnvelopeVersion: 999 },
    { ...qualificationIdentity, samplingIdentity: 'd'.repeat(64) },
    { ...qualificationIdentity, qualificationEligible: true },
  ];
  let invalidRejected = 0;
  for (const invalidIdentity of invalidIdentities) {
    await assert.rejects(
      runtime.submitCapture({ sessionId: session.sessionId, capture: { ...validCapture, qualificationIdentity: invalidIdentity } }),
    );
    invalidRejected += 1;
  }
  const closed = await runtime.endSession({ sessionId: session.sessionId });
  assert.equal(closed.manifest.recordCount, 1);
  assert.match(closed.manifest.repositoryHead, /^[a-f0-9]{40}$/);
  assert.match(closed.manifest.runtimeBuildHash, /^[a-f0-9]{64}$/);
  assert.equal(closed.manifest.authority.canDispatch, false);
  assert.equal(closed.manifest.stage2fCampaignId, campaignManifest.stage2fCampaignId);
  assert.equal(closed.manifest.sentinelRuntimeId, runtimeIdentity.sentinelRuntimeId);
  assert.deepEqual(closed.manifest.samplingIdentities, [derivedIdentity]);
  const persistedRecords = await Promise.all((await readdir(path.join(live, 'records'))).filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await readFile(path.join(live, 'records', name), 'utf8'))));
  const reconciliation = controlled.reconcileStage2FEvidence({ records: persistedRecords, sessionManifests: [closed.manifest], campaignManifest });
  assert.equal(reconciliation.accepted, 1);
  assert.equal(reconciliation.rejected, 0);
  const certification = controlled.certifyZekNovaSustainedShadowCampaign({
    manifest: { authority: { tier: 'R0', executionInterface: false } },
    records: persistedRecords,
    sessionManifests: [closed.manifest],
    campaignManifest,
  });
  assert.equal(certification.certification.authenticRecordCount, 0);
  assert.equal(certification.pass, false);
  const status = await runtime.status();
  assert.equal(status.recordCount, 1);
  assert.equal(status.fixtureCount, 1);
  assert.equal(status.manifestCount, 1);
  assert.equal(status.authority.canMutateLiveWorld, false);
  console.log(JSON.stringify({
    pass: true,
    checks: 37,
    invalidQualificationRecordsAccepted: 0,
    invalidQualificationRecordsRejected: invalidRejected,
    endToEndValidFixtureAcceptedByReconciler: reconciliation.accepted === 1,
    endToEndInvalidFixtureRejected: invalidRejected === invalidIdentities.length,
    dryRunFixturesCountedTowardStage2F: certification.certification.authenticRecordCount,
    status,
    acceptedRecordHash: accepted.recordHash,
    manifestHash: closed.manifest.manifestHash,
  }, null, 2));
} finally {
  await rm(temp, { recursive: true, force: true });
}
