import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createCollectorRuntime } from '../collector-core.mjs';

const exec = promisify(execFile);
const kernelPath = path.resolve(process.argv[2] ?? process.env.SENTINEL_GRID_KERNEL_PATH ?? '');
assert(kernelPath, 'Kernel path is required');
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
  const envelope = JSON.parse(await readFile(path.join(kernelPath, run.file), 'utf8'));
  const legacyEvidence = baseline.fixtures.find((entry) => entry.fixtureId === run.fixtureId);
  const context = {
    factionId: run.observerId,
    biomeId: run.observerId,
    missionId: 'collector-self-test-mission',
    missionPhase: 'opening',
    tensionBand: 'medium',
    infrastructureBand: 'developing',
    tick: envelope.payload.tick,
  };
  const session = await runtime.startSession({ environmentId: 'collector-self-test' });
  const accepted = await runtime.submitCapture({ sessionId: session.sessionId, capture: { context, envelope, legacyEvidence } });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.recordPass, true);
  assert.equal(accepted.authority.tier, 'R0');
  const duplicate = await runtime.submitCapture({ sessionId: session.sessionId, capture: { context, envelope, legacyEvidence } });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.duplicate, true);
  const closed = await runtime.endSession({ sessionId: session.sessionId });
  assert.equal(closed.manifest.recordCount, 1);
  assert.match(closed.manifest.repositoryHead, /^[a-f0-9]{40}$/);
  assert.match(closed.manifest.runtimeBuildHash, /^[a-f0-9]{64}$/);
  assert.equal(closed.manifest.authority.canDispatch, false);
  const status = await runtime.status();
  assert.equal(status.recordCount, 1);
  assert.equal(status.fixtureCount, 1);
  assert.equal(status.manifestCount, 1);
  assert.equal(status.authority.canMutateLiveWorld, false);
  console.log(JSON.stringify({ pass: true, checks: 18, status, acceptedRecordHash: accepted.recordHash, manifestHash: closed.manifest.manifestHash }, null, 2));
} finally {
  await rm(temp, { recursive: true, force: true });
}
