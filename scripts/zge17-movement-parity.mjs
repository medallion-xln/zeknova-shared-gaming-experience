#!/usr/bin/env node
/**
 * ZGE-17 AC12 — regenerate the movement parity baseline.
 *
 * The bundle side is a committed capture (packages/sdk/test/fixtures/), taken once from the
 * live game in a browser, because the bundle's movement cannot be driven headlessly. The
 * rebuilt side is replayed here on every run. That split is what makes parity checkable in CI
 * while still comparing against the real thing rather than an idealised model of it.
 *
 *   node scripts/zge17-movement-parity.mjs            # print the report
 *   node scripts/zge17-movement-parity.mjs --write    # also update the committed baseline
 *
 * Re-capture the fixture with examples/movement-parity/ when the bundle changes.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {replayScript, compareMovement, MovementParityReport, DEFAULT_MOVEMENT, validateMovementConfig, displacement, responseFrames} from '../packages/sdk/src/index.js';

const root = new URL('../', import.meta.url);
const at = (p) => fileURLToPath(new URL(p, root));
const capture = JSON.parse(readFileSync(at('packages/sdk/test/fixtures/bundle-movement-hold-forward.json'), 'utf8'));
const config = validateMovementConfig(DEFAULT_MOVEMENT);

/* The same script the capture used, replayed through the rebuilt movement — and given the
 * basis the bundle was actually observed to move along, so the comparison is about feel and
 * not about which way the camera happened to be pointing when the capture was taken. */
const script = [
  {frames: 60, forward: 1, basis: capture.observedBasis},
  {frames: 120, basis: capture.observedBasis},
];
const rebuilt = replayScript(script, {
  config,
  dtSeconds: capture.dtNominalSeconds,
  start: {x: capture.samples[0].x, y: 0, z: capture.samples[0].z},
});

const report = new MovementParityReport();
const row = report.record({
  scriptId: capture.scriptId,
  legacy: {samples: capture.samples, releasedAtFrame: capture.releasedAtFrame, unobservable: capture.unobservable},
  rebuilt: {samples: rebuilt.samples, releasedAtFrame: rebuilt.releasedAtFrame, unobservable: rebuilt.unobservable},
  capabilities: {dash: true, doubleJump: true, airControl: true},
  reproduce: 'node scripts/zge17-movement-parity.mjs — bundle side from the committed capture, rebuilt side replayed',
});

const baseline = {
  ...report.snapshot(),
  generatedBy: 'scripts/zge17-movement-parity.mjs',
  capture: {source: capture.source, scriptId: capture.scriptId, capturedAt: capture.capturedAt, backend: capture.backend, observedStallFrame: capture.observedStallFrame},
  measurements: {
    legacy: {displacement: +displacement(capture.samples).toFixed(4), responseFrames: responseFrames(capture.samples, 1e-4), frames: capture.samples.length},
    rebuilt: {displacement: +displacement(rebuilt.samples).toFixed(4), responseFrames: responseFrames(rebuilt.samples, 1e-4), frames: rebuilt.samples.length},
  },
  interpretation: [
    'CAPABILITY_ABSENT for dash, doubleJump and airControl is the expected and desired result: the bundle has none of them, which is why movement is being rebuilt rather than extracted.',
    `The bundle stops at frame ${capture.observedStallFrame} with the key still held, so its displacement is bounded by whatever it collided with rather than by its own speed. Displacement parity is therefore NOT meaningful from this capture, and the harness says so through legacy-collision-state and legacy-stall-cause in unobservable.`,
    'Response latency and rest drift ARE meaningful here, and both agree: the bundle and the rebuild move on the first sampled frame and neither creeps after release.',
  ],
};

const path = at('docs/engine/ZGE17_MOVEMENT_PARITY_BASELINE.json');
if (process.argv.includes('--write')) { writeFileSync(path, JSON.stringify(baseline, null, 2) + '\n'); console.error(`wrote ${path}`); }
console.log(JSON.stringify(baseline, null, 2));
console.error(`\nmatched=${row.matched} mismatches=${row.mismatches} classes=${JSON.stringify(report.snapshot().classes)}`);
console.error(`unobservable: ${row.unobservable.join(', ')}`);
