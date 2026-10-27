import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEngine, createProject, transform, SDKError,
  installMovement, stepMovement, createMovementState, validateMovementConfig,
  validateEvasionWindow, evasionCovers, DEFAULT_MOVEMENT, MOVEMENT_AUTHORITY, EVASION_SCHEMA,
  compareMovement, replayScript, responseFrames, displacement, MovementParityReport,
} from '../src/index.js';

const DT = 1 / 60;
const run = (state, input, steps, config = DEFAULT_MOVEMENT) => {
  let s = state, events = [];
  for (let i = 0; i < steps; i++) {
    const r = stepMovement(s, {...input, jump: !!input.jump && i === 0, dash: !!input.dash && i === 0}, DT, config);
    s = r.state; events = events.concat(r.events);
  }
  return {state: s, events};
};

/* ───────────────────────────── AC9 — the moves exist ───────────────────────────── */

test('AC9: double jump — a second jump in the air, and no third', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  let s = createMovementState({config});
  ({state: s} = run(s, {jump: true}, 1, config));
  assert.equal(s.jumpsUsed, 1);
  assert.ok(!s.grounded && s.vy > 0, 'left the ground');

  ({state: s} = run(s, {}, 10, config));
  const apexFirst = s.y;
  const second = stepMovement(s, {jump: true}, DT, config);
  assert.equal(second.state.jumpsUsed, 2);
  assert.ok(second.events.some((e) => e.type === 'movement:jump' && e.double === true), 'emits a double jump');
  assert.ok(second.state.vy > 0, 'the second jump pushes back up');
  assert.ok(second.state.y > apexFirst - 1, 'gains height rather than falling through');

  // A third is refused while airborne.
  const third = stepMovement(second.state, {jump: true}, DT, config);
  assert.equal(third.state.jumpsUsed, 2, 'maxJumps is respected');
  assert.ok(!third.events.some((e) => e.type === 'movement:jump'));

  // Landing restores both.
  ({state: s} = run(second.state, {}, 240, config));
  assert.ok(s.grounded, 'came back down');
  assert.equal(s.jumpsUsed, 0, 'jumps reset on landing');
  assert.equal(s.y, config.groundY);
});

test('AC9: dash commits to a direction, overrides steering, and respects its cooldown', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  let s = createMovementState({config});
  const first = stepMovement(s, {forward: 1, dash: true}, DT, config);
  assert.ok(first.dashing, 'dash is active');
  assert.ok(first.events.some((e) => e.type === 'movement:dash'));
  const speed = Math.hypot(first.state.vx, first.state.vz);
  assert.ok(Math.abs(speed - config.dash.speed) < 1e-9, `dash speed ${speed} should be ${config.dash.speed}`);

  // Steering the other way mid-dash must not turn it: the commitment is the readability.
  const mid = stepMovement(first.state, {forward: -1, strafe: 1}, DT, config);
  assert.ok(Math.abs(Math.hypot(mid.state.vx, mid.state.vz) - config.dash.speed) < 1e-9, 'still dashing at dash speed');
  assert.ok(mid.state.vz > 0, 'still going the original way');

  // A second dash before the cooldown is refused.
  const early = stepMovement(mid.state, {dash: true}, DT, config);
  assert.equal(early.state.evasionSequence, 1, 'no second window granted');

  // After the cooldown it is allowed again.
  let s2 = early.state;
  while (s2.timeMs < early.state.dashReadyAtMs) ({state: s2} = run(s2, {}, 1, config));
  const again = stepMovement(s2, {dash: true}, DT, config);
  assert.equal(again.state.evasionSequence, 2, 'dash available once the cooldown elapses');
});

test('AC9: air dashes are limited and refill on landing', () => {
  const config = validateMovementConfig({...DEFAULT_MOVEMENT, dash: {...DEFAULT_MOVEMENT.dash, cooldownMs: DEFAULT_MOVEMENT.dash.durationMs}});
  let s = createMovementState({config});
  ({state: s} = run(s, {jump: true}, 1, config));
  const air1 = stepMovement(s, {forward: 1, dash: true}, DT, config);
  assert.equal(air1.state.airDashesUsed, 1);
  let s2 = air1.state;
  while (s2.timeMs < air1.state.dashUntilMs) ({state: s2} = run(s2, {}, 1, config));
  const air2 = stepMovement(s2, {forward: 1, dash: true}, DT, config);
  assert.equal(air2.state.airDashesUsed, 1, 'a second air dash is refused');
  ({state: s2} = run(air2.state, {}, 300, config));
  assert.ok(s2.grounded);
  assert.equal(s2.airDashesUsed, 0, 'air dashes refill on landing');
});

/* ───────────────────────── AC10 — feel targets and data ───────────────────────── */

test('AC10: motion begins within two frames of input', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  const {samples} = replayScript([{frames: 10, forward: 1}], {config, dtSeconds: DT});
  const frames = responseFrames(samples, 1e-9);
  assert.ok(frames !== null && frames <= 2, `first motion after ${frames} frames, budget is 2`);
  assert.equal(frames, 1, 'in practice it moves on the very first step');
});

test('AC10: zero drift after release — exactly zero, not an asymptote', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  let s = createMovementState({config});
  ({state: s} = run(s, {forward: 1}, 60, config));
  assert.ok(Math.hypot(s.vx, s.vz) > 1, 'was moving');
  ({state: s} = run(s, {}, 60, config));
  assert.equal(s.vx, 0, 'horizontal velocity is exactly zero');
  assert.equal(s.vz, 0, 'horizontal velocity is exactly zero');
  const resting = {x: s.x, z: s.z};
  ({state: s} = run(s, {}, 600, config));
  assert.equal(s.x, resting.x, 'no creep over 10 further seconds');
  assert.equal(s.z, resting.z, 'no creep over 10 further seconds');
});

test('AC10: dash cooldown, i-frames and air control are data, not constants', () => {
  const slow = validateMovementConfig({...DEFAULT_MOVEMENT, dash: {...DEFAULT_MOVEMENT.dash, cooldownMs: 4000, invulnerableMs: 40}});
  let s = createMovementState({config: slow});
  const dashed = stepMovement(s, {forward: 1, dash: true}, DT, slow);
  assert.equal(dashed.state.lastEvasion.durationMs, 40, 'i-frame length follows config');
  assert.equal(dashed.state.lastEvasion.earliestNextMs - dashed.state.lastEvasion.startedAtMs, 4000, 'cooldown follows config');

  // Air control scales how much steering authority exists off the ground.
  const measure = (airControl) => {
    const c = validateMovementConfig({...DEFAULT_MOVEMENT, airControl});
    let st = createMovementState({config: c});
    ({state: st} = run(st, {jump: true}, 1, c));
    ({state: st} = run(st, {forward: 1}, 20, c));
    return Math.abs(st.vz);
  };
  const loose = measure(1), tight = measure(0.1);
  assert.ok(loose > tight * 2, `airControl must matter: 1.0 gave ${loose.toFixed(2)}, 0.1 gave ${tight.toFixed(2)}`);
  assert.equal(measure(0), 0, 'zero air control means no steering at all');
});

test('AC10: configuration is validated rather than trusted', () => {
  assert.throws(() => validateMovementConfig({...DEFAULT_MOVEMENT, speed: 0}), (e) => e instanceof SDKError);
  assert.throws(() => validateMovementConfig({...DEFAULT_MOVEMENT, airControl: 2}), (e) => e instanceof SDKError);
  assert.throws(() => validateMovementConfig({...DEFAULT_MOVEMENT, maxJumps: 0}), (e) => e instanceof SDKError);
  // i-frames may not outlast the dash, and the cooldown may not be shorter than it.
  assert.throws(() => validateMovementConfig({...DEFAULT_MOVEMENT, dash: {...DEFAULT_MOVEMENT.dash, invulnerableMs: 10_000}}), (e) => e instanceof SDKError);
  assert.throws(() => validateMovementConfig({...DEFAULT_MOVEMENT, dash: {...DEFAULT_MOVEMENT.dash, cooldownMs: 1}}), (e) => e instanceof SDKError);
  assert.throws(() => stepMovement(createMovementState(), {}, 0), (e) => e instanceof SDKError);
  assert.throws(() => stepMovement(createMovementState(), {}, 5), (e) => e instanceof SDKError);
});

test('AC10: the step is deterministic and the simulation is frame-rate independent', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  const a = replayScript([{frames: 90, forward: 1}], {config, dtSeconds: DT});
  const b = replayScript([{frames: 90, forward: 1}], {config, dtSeconds: DT});
  assert.deepEqual(a.samples, b.samples, 'same script, same trajectory');
  const slow = replayScript([{frames: 45, forward: 1}], {config, dtSeconds: 1 / 30});
  assert.ok(Math.abs(displacement(slow.samples) - displacement(a.samples)) < 0.25,
    'half the frames at double dt lands in the same place');
});

/* ─────────────────── AC11 — the evasion window is a claim, not a verdict ─────────────────── */

test('AC11: a dash emits a timestamped window, and never asserts the damage outcome', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  const {events, state} = run(createMovementState({config}), {forward: 1, dash: true}, 1, config);
  const emitted = events.find((e) => e.type === 'movement:evasion-window');
  assert.ok(emitted, 'a window is emitted');
  const w = emitted.evasion;
  assert.equal(w.schema, EVASION_SCHEMA);
  assert.equal(w.claim, 'damage-negation', 'it is a claim about damage');
  assert.equal(w.authority, 'client-feel');
  assert.equal(w.endsAtMs - w.startedAtMs, config.dash.invulnerableMs);
  assert.equal(w.earliestNextMs - w.startedAtMs, config.dash.cooldownMs);
  // The plugin states a bounded interval. It does not state that no damage occurred.
  assert.ok(!('damageTaken' in w) && !('invulnerable' in w) && !('negated' in w),
    'the window must not carry a damage verdict');
  assert.deepEqual(MOVEMENT_AUTHORITY.serverValidated, ['damage-negation']);
  assert.ok(MOVEMENT_AUTHORITY.clientAuthoritative.includes('position'));
  assert.ok(!MOVEMENT_AUTHORITY.clientAuthoritative.includes('damage-negation'));
  assert.equal(state.lastEvasion.sequence, 1);
});

test('AC11: a server accepts an honest window and rejects every forged one', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  const {state, events} = run(createMovementState({config}), {forward: 1, dash: true}, 1, config);
  const honest = events.find((e) => e.type === 'movement:evasion-window').evasion;

  assert.deepEqual(validateEvasionWindow(honest, {config, nowMs: honest.startedAtMs}).ok, true);

  const reject = (mutation, reason, options = {}) => {
    const result = validateEvasionWindow({...honest, ...mutation}, {config, nowMs: honest.startedAtMs + 10_000, ...options});
    assert.equal(result.ok, false, `expected rejection: ${reason}`);
    assert.equal(result.reason, reason);
  };
  // A longer window than the server configured.
  reject({durationMs: 5000, endsAtMs: honest.startedAtMs + 5000}, 'duration-not-configured');
  // The right length, but inconsistent endpoints.
  reject({endsAtMs: honest.startedAtMs + 9999}, 'window-inconsistent');
  // A shorter cooldown than the server configured.
  reject({earliestNextMs: honest.startedAtMs + 10}, 'cooldown-not-configured');
  // A window dated into the future.
  reject({startedAtMs: 10_000_000, endsAtMs: 10_000_000 + config.dash.invulnerableMs, earliestNextMs: 10_000_000 + config.dash.cooldownMs}, 'future-dated', {nowMs: 0});
  // Wrong shape or claim.
  reject({claim: 'invincible'}, 'claim');
  reject({schema: 'something-else'}, 'schema');
  reject({sequence: 0}, 'sequence-shape');

  // Replay and sequence-stuffing, judged against the previous accepted window.
  assert.equal(validateEvasionWindow(honest, {config, previous: honest}).reason, 'sequence-gap');
  const next = {...honest, sequence: 2, startedAtMs: honest.startedAtMs + 10,
    endsAtMs: honest.startedAtMs + 10 + config.dash.invulnerableMs,
    earliestNextMs: honest.startedAtMs + 10 + config.dash.cooldownMs};
  assert.equal(validateEvasionWindow(next, {config, previous: honest}).reason, 'cooldown-violated',
    'dashing again before the cooldown is refused even with a tidy sequence');

  // The honest second dash, after the cooldown, is accepted.
  let s2 = state;
  while (s2.timeMs < state.dashReadyAtMs) ({state: s2} = run(s2, {}, 1, config));
  const second = stepMovement(s2, {forward: 1, dash: true}, DT, config);
  const window2 = second.state.lastEvasion;
  assert.equal(validateEvasionWindow(window2, {config, previous: honest, nowMs: window2.startedAtMs}).ok, true);
});

test('AC11: coverage is decided by timestamp, so a hit outside the window still lands', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  const {state} = run(createMovementState({config}), {forward: 1, dash: true}, 1, config);
  const w = state.lastEvasion;
  assert.equal(evasionCovers(w, w.startedAtMs), true);
  assert.equal(evasionCovers(w, w.endsAtMs - 1), true);
  assert.equal(evasionCovers(w, w.endsAtMs), false, 'the window is half-open');
  assert.equal(evasionCovers(w, w.startedAtMs - 1), false);
  // The dash outlasts its i-frames by design: the tail is committed but vulnerable.
  assert.ok(config.dash.invulnerableMs < config.dash.durationMs);
  assert.equal(evasionCovers(w, w.startedAtMs + config.dash.durationMs - 1), false,
    'late in the dash you are still moving, and still hittable');
});

/* ─────────────────────────── AC12 — the parity harness ─────────────────────────── */

test('AC12: identical trajectories match, with nothing unobservable', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  const script = [{frames: 60, forward: 1}, {frames: 60}];
  const a = replayScript(script, {config}), b = replayScript(script, {config});
  const row = compareMovement({scriptId: 'self', legacy: a, rebuilt: b, capabilities: {}});
  assert.equal(row.matched, true);
  assert.deepEqual(row.differences, []);
  assert.equal(row.fullyObservable, true);
});

test('AC12: each divergence class is detected', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  const script = [{frames: 60, forward: 1}, {frames: 60}];
  const base = replayScript(script, {config});

  const slower = replayScript(script, {config: validateMovementConfig({...DEFAULT_MOVEMENT, speed: 1})});
  const classes = (row) => row.differences.map((d) => d.classification);
  assert.ok(classes(compareMovement({legacy: base, rebuilt: slower})).includes('DISPLACEMENT_MISMATCH'));

  const sideways = replayScript([{frames: 60, strafe: 1}, {frames: 60}], {config});
  assert.ok(classes(compareMovement({legacy: base, rebuilt: sideways})).includes('DIRECTION_MISMATCH'));

  const laggy = {...base, samples: [base.samples[0], ...base.samples.map((s) => ({...s}))].slice(0, base.samples.length)};
  laggy.samples = base.samples.map((s, i) => (i < 6 ? {...s, x: base.samples[0].x, z: base.samples[0].z} : s));
  assert.ok(classes(compareMovement({legacy: base, rebuilt: laggy})).includes('RESPONSE_LATENCY_MISMATCH'));

  const drifting = {...base, samples: base.samples.map((s, i) => (i > 60 ? {...s, x: s.x + i * 0.01} : s))};
  assert.ok(classes(compareMovement({legacy: base, rebuilt: drifting})).includes('REST_DRIFT_MISMATCH'));

  const capability = compareMovement({legacy: base, rebuilt: base, capabilities: {dash: true, doubleJump: true}});
  assert.equal(capability.matched, true, 'a move the bundle never had is not a defect');
  assert.equal(capability.differences.filter((d) => d.classification === 'CAPABILITY_ABSENT').length, 2);
});

test('AC12: a missing side is reported as unobservable, never as a match', () => {
  const base = replayScript([{frames: 30, forward: 1}], {config: DEFAULT_MOVEMENT});
  const row = compareMovement({scriptId: 'no-legacy', legacy: {samples: []}, rebuilt: base, capabilities: {}});
  assert.equal(row.fullyObservable, false);
  assert.ok(row.unobservable.includes('legacy-trajectory'));
  assert.equal(row.matched, true, 'nothing to compare is not a mismatch');
  assert.equal(row.mismatches, 0);
});

test('AC12: the report accumulates classes and snapshots under a schema', () => {
  const config = validateMovementConfig(DEFAULT_MOVEMENT);
  const script = [{frames: 40, forward: 1}, {frames: 40}];
  const base = replayScript(script, {config});
  const report = new MovementParityReport();
  report.record({scriptId: 'match', legacy: base, rebuilt: base, capabilities: {dash: true}});
  report.record({scriptId: 'slow', legacy: base, rebuilt: replayScript(script, {config: validateMovementConfig({...DEFAULT_MOVEMENT, speed: 1})}), capabilities: {}});
  const snap = report.snapshot();
  assert.equal(snap.schema, 'zge.movement-parity.v1');
  assert.equal(snap.total, 2);
  assert.equal(snap.matched, 1);
  assert.equal(snap.mismatched, 1);
  assert.equal(snap.classes.DISPLACEMENT_MISMATCH, 1);
  assert.equal(snap.classes.CAPABILITY_ABSENT, 1);
});

/* ─────────────────────── AC9 — installed on a live engine ─────────────────────── */

test('AC9: the plugin drives a real entity through the engine and declares its authority', async () => {
  const engine = await createEngine({project: createProject()});
  const world = await engine.loadWorld();
  world.createEntity({id: 'player', name: 'Player', components: {transform: transform({position: [0, 0, 0]})}});
  const input = new Set();
  const movement = installMovement(engine, {entity: 'player', input});
  assert.deepEqual(movement.authority, MOVEMENT_AUTHORITY);

  await engine.start();
  engine.pause();
  input.add('w');
  for (let i = 0; i < 30; i++) engine.step(1);
  const moved = world.findEntity('player').components.transform.position;
  assert.ok(Math.hypot(moved[0], moved[2]) > 0.5, `expected movement, got ${JSON.stringify(moved)}`);

  input.clear();
  for (let i = 0; i < 60; i++) engine.step(1);
  const rested = world.findEntity('player').components.transform.position;
  for (let i = 0; i < 60; i++) engine.step(1);
  assert.deepEqual(world.findEntity('player').components.transform.position, rested, 'no drift once input stops');

  // Edge semantics: holding dash must not re-trigger it every frame.
  input.add('Shift');
  for (let i = 0; i < 30; i++) engine.step(1);
  assert.equal(movement.state.evasionSequence, 1, 'holding the key grants exactly one window');

  movement.dispose();
  await engine.dispose();
});

/* ──────────── AC12 — against the real captured bundle trajectory ──────────── */

test('AC12: the committed baseline reflects the real bundle capture', async () => {
  const {readFileSync} = await import('node:fs');
  const {fileURLToPath} = await import('node:url');
  const at = (p) => fileURLToPath(new URL(p, new URL('../../../', import.meta.url)));
  const capture = JSON.parse(readFileSync(at('packages/sdk/test/fixtures/bundle-movement-hold-forward.json'), 'utf8'));
  const baseline = JSON.parse(readFileSync(at('docs/engine/ZGE17_MOVEMENT_PARITY_BASELINE.json'), 'utf8'));
  const config = validateMovementConfig(DEFAULT_MOVEMENT);

  assert.equal(capture.schema, 'zge.movement-capture.v1');
  assert.equal(capture.source, 'assets/index-02987539.js', 'the capture must come from the frozen bundle');
  assert.equal(capture.samples.length, 181);

  const rebuilt = replayScript(
    [{frames: 60, forward: 1, basis: capture.observedBasis}, {frames: 120, basis: capture.observedBasis}],
    {config, dtSeconds: capture.dtNominalSeconds, start: {x: capture.samples[0].x, y: 0, z: capture.samples[0].z}},
  );
  const row = compareMovement({
    scriptId: capture.scriptId,
    legacy: {samples: capture.samples, releasedAtFrame: capture.releasedAtFrame, unobservable: capture.unobservable},
    rebuilt: {samples: rebuilt.samples, releasedAtFrame: rebuilt.releasedAtFrame, unobservable: rebuilt.unobservable},
    capabilities: {dash: true, doubleJump: true, airControl: true},
  });

  // Regenerating must reproduce the committed baseline exactly.
  assert.equal(row.mismatches, baseline.mismatched === 0 ? 0 : baseline.rows[0].mismatches,
    'the harness no longer produces the committed baseline — rerun scripts/zge17-movement-parity.mjs --write and review the change');
  assert.deepEqual(row.differences.map((d) => d.classification).sort(),
    baseline.rows[0].differences.map((d) => d.classification).sort());

  // The two properties this capture CAN settle, both of which matter for feel.
  assert.equal(responseFrames(capture.samples, 1e-4), 1, 'the bundle moves on the first sampled frame');
  assert.equal(responseFrames(rebuilt.samples, 1e-4), 1, 'and so does the rebuild');
  assert.ok(!row.differences.some((d) => d.classification === 'REST_DRIFT_MISMATCH'),
    'neither side creeps after release');

  // And the one it cannot, stated rather than silently scored.
  assert.ok(row.unobservable.includes('legacy-collision-state'));
  assert.ok(row.unobservable.includes('legacy-stall-cause'));
  assert.equal(row.fullyObservable, false, 'parity against a minified runtime is never fully observable');
  assert.ok(capture.observedStallFrame < capture.releasedAtFrame,
    'the capture stalls before release, which is why displacement parity is not meaningful from it');

  // Dash and double jump are absent from the bundle by definition, not by defect.
  const absent = row.differences.filter((d) => d.classification === 'CAPABILITY_ABSENT').map((d) => d.detail.capability);
  assert.deepEqual(absent.sort(), ['airControl', 'dash', 'doubleJump']);
});
