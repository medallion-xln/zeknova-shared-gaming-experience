import {stepMovement, createMovementState, validateMovementConfig, DEFAULT_MOVEMENT} from './movement.js';

/**
 * Movement parity harness — ZGE-17 AC12.
 *
 * Modelled on packages/gameplay-construction/src/Parity.js, which is the repository's existing
 * pattern for migrating a system away from the frozen bundle: replay the same scripted input
 * against both sides, classify every divergence, and name what could not be observed at all
 * rather than quietly scoring it as a match.
 *
 * What can be observed differs sharply between the two sides, and pretending otherwise would
 * make the report worthless. The rebuilt movement exposes its whole state. The bundle exposes
 * a position on an Object3D and nothing else: its velocity, grounded flag and jump state are
 * minified locals. So the harness compares TRAJECTORIES — position sampled per frame — and
 * lists everything else under `unobservable`.
 *
 * CAPABILITY_ABSENT is the expected verdict for dash and double jump: the bundle has neither,
 * which is the point of rebuilding. It is classified, not counted as a defect.
 */

export const MOVEMENT_PARITY_CLASSES = Object.freeze([
  'RESPONSE_LATENCY_MISMATCH',  // frames from input to first motion
  'DISPLACEMENT_MISMATCH',      // total ground covered over the script
  'REST_DRIFT_MISMATCH',        // movement after the key came up
  'TRAJECTORY_DIVERGENCE',      // worst per-sample separation
  'DIRECTION_MISMATCH',         // ended up somewhere else entirely
  'CAPABILITY_ABSENT',          // the rebuild has a move the bundle never had
  'EXPECTED_NORMALIZATION',     // known, accepted difference
]);

const near = (a, b, epsilon) => Math.abs(a - b) <= epsilon;
const distance = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);

/** Frames elapsed before the sample moves more than `epsilon` from where it started. */
export function responseFrames(samples, epsilon = 0.01) {
  if (!samples?.length) return null;
  const origin = samples[0];
  for (let i = 1; i < samples.length; i++) if (distance(samples[i], origin) > epsilon) return i;
  return null;
}

/** Ground distance travelled between the first and last sample of a span. */
export function displacement(samples) {
  if (!samples?.length) return 0;
  return Math.hypot(samples.at(-1).x - samples[0].x, samples.at(-1).z - samples[0].z);
}

/**
 * `observation` is two recorded runs of the same script:
 *   { scriptId, tolerances, legacy: {samples, releasedAtFrame, unobservable}, rebuilt: {...},
 *     capabilities: {dash, doubleJump} }
 * Samples are [{frame, x, y, z}] from each side, taken at the same cadence.
 */
export function compareMovement(observation) {
  const o = observation;
  const differences = [];
  const unobservable = [...(o.legacy?.unobservable ?? []), ...(o.rebuilt?.unobservable ?? [])];
  const add = (classification, detail) => differences.push({classification, detail});
  const tol = {responseFrames: 2, displacementRatio: 0.35, restDrift: 1e-6, trajectory: 2.5, settleFrames: 20, ...(o.tolerances ?? {})};

  const legacy = o.legacy?.samples ?? [];
  const rebuilt = o.rebuilt?.samples ?? [];
  if (!legacy.length || !rebuilt.length) {
    unobservable.push(!legacy.length ? 'legacy-trajectory' : 'rebuilt-trajectory');
    return report(o, differences, unobservable, tol);
  }

  // Responsiveness. This is the feel property AC10 pins down, so it is compared directly.
  const legacyResponse = responseFrames(legacy), rebuiltResponse = responseFrames(rebuilt);
  if (legacyResponse === null || rebuiltResponse === null) unobservable.push('response-latency');
  else if (Math.abs(legacyResponse - rebuiltResponse) > tol.responseFrames) {
    add('RESPONSE_LATENCY_MISMATCH', {legacyFrames: legacyResponse, rebuiltFrames: rebuiltResponse, tolerance: tol.responseFrames});
  }

  // Distance covered. Compared as a ratio: the two use different speeds by design, and the
  // question is whether the rebuild is in the same class of movement, not identical to it.
  const legacyDistance = displacement(legacy), rebuiltDistance = displacement(rebuilt);
  if (legacyDistance > 0.01) {
    const ratio = rebuiltDistance / legacyDistance;
    if (ratio < 1 - tol.displacementRatio || ratio > 1 + tol.displacementRatio) {
      add('DISPLACEMENT_MISMATCH', {legacy: +legacyDistance.toFixed(3), rebuilt: +rebuiltDistance.toFixed(3), ratio: +ratio.toFixed(3), tolerance: tol.displacementRatio});
    }
  } else unobservable.push('legacy-displacement-too-small-to-compare');

  // Drift after release — the continuous-input defect this rebuild must not reproduce.
  // Measured AFTER a settle allowance, because decelerating to a stop is movement we asked for;
  // creeping once stopped is the defect. Without the allowance a correct stop reads as 0.075 of
  // drift, which is just the deceleration ramp.
  const released = o.legacy?.releasedAtFrame ?? null;
  for (const [side, run] of [['legacy', o.legacy], ['rebuilt', o.rebuilt]]) {
    const at = (run?.releasedAtFrame ?? released);
    const from = at === null ? null : at + tol.settleFrames;
    if (from === null || from >= run.samples.length - 1) { unobservable.push(`${side}-rest-drift`); continue; }
    const tail = run.samples.slice(from);
    const drift = Math.max(...tail.map((s) => Math.hypot(s.x - tail.at(-1).x, s.z - tail.at(-1).z)));
    if (!near(drift, 0, tol.restDrift)) add('REST_DRIFT_MISMATCH', {side, drift: +drift.toExponential(3), tolerance: tol.restDrift, settleFrames: tol.settleFrames});
  }

  // Shape of the path, aligned on the shorter run.
  const span = Math.min(legacy.length, rebuilt.length);
  let worst = 0, worstFrame = 0;
  for (let i = 0; i < span; i++) {
    const d = distance(
      {x: legacy[i].x - legacy[0].x, y: 0, z: legacy[i].z - legacy[0].z},
      {x: rebuilt[i].x - rebuilt[0].x, y: 0, z: rebuilt[i].z - rebuilt[0].z},
    );
    if (d > worst) { worst = d; worstFrame = i; }
  }
  if (worst > tol.trajectory) add('TRAJECTORY_DIVERGENCE', {worst: +worst.toFixed(3), atFrame: worstFrame, tolerance: tol.trajectory});

  // Did they at least go the same way?
  if (legacyDistance > 0.01 && rebuiltDistance > 0.01) {
    const angle = (run) => Math.atan2(run.at(-1).z - run[0].z, run.at(-1).x - run[0].x);
    let delta = Math.abs(angle(legacy) - angle(rebuilt));
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    if (delta > Math.PI / 4) add('DIRECTION_MISMATCH', {radians: +delta.toFixed(3)});
  }

  // Moves the bundle never had. Expected, and recorded so the report says so out loud.
  for (const [name, present] of Object.entries(o.capabilities ?? {})) {
    if (present) add('CAPABILITY_ABSENT', {capability: name, legacy: false, rebuilt: true,
      rule: 'the rebuild adds this move; the bundle has no equivalent to diverge from'});
  }

  return report(o, differences, unobservable, tol);
}

function report(o, differences, unobservable, tolerances) {
  const mismatches = differences.filter((d) => !['EXPECTED_NORMALIZATION', 'CAPABILITY_ABSENT'].includes(d.classification));
  return {
    scriptId: o.scriptId ?? null,
    matched: mismatches.length === 0,
    differences,
    mismatches: mismatches.length,
    unobservable: [...new Set(unobservable)],
    fullyObservable: unobservable.length === 0,
    tolerances,
    reproduce: o.reproduce ?? 'Replay the scripted input against both runtimes at the same cadence',
  };
}

export class MovementParityReport {
  constructor({limit = 100} = {}) { this.limit = limit; this.rows = []; this.total = 0; this.mismatched = 0; this.unobservable = 0; this.classes = {}; }
  record(observation) {
    const row = compareMovement(observation);
    this.total++;
    if (!row.matched) this.mismatched++;
    if (row.unobservable.length) this.unobservable++;
    for (const d of row.differences) this.classes[d.classification] = (this.classes[d.classification] ?? 0) + 1;
    this.rows.push(row);
    if (this.rows.length > this.limit) this.rows.shift();
    return row;
  }
  snapshot() {
    return structuredClone({schema: 'zge.movement-parity.v1', total: this.total, matched: this.total - this.mismatched,
      mismatched: this.mismatched, unobservable: this.unobservable, classes: this.classes, rows: this.rows});
  }
}

/**
 * Replay a script through the rebuilt movement offline, producing samples in the same shape a
 * browser capture of the bundle produces. This is what makes AC12 runnable in CI: the bundle
 * side is captured once into a fixture, and the rebuilt side is regenerated on every run.
 *
 * A script is [{frames, forward, strafe, jump, dash}] — `jump` and `dash` fire on the first
 * frame of their span, matching the edge semantics of installMovement.
 */
export function replayScript(script, {config = DEFAULT_MOVEMENT, dtSeconds = 1 / 60, start = {x: 0, y: 0, z: 0}} = {}) {
  const c = validateMovementConfig(config);
  let state = createMovementState({...start, config: c});
  const samples = [{frame: 0, x: state.x, y: state.y, z: state.z}];
  const events = [];
  let frame = 0, releasedAtFrame = null;
  for (const span of script) {
    for (let i = 0; i < span.frames; i++) {
      const result = stepMovement(state, {
        forward: span.forward ?? 0, strafe: span.strafe ?? 0,
        jump: !!span.jump && i === 0, dash: !!span.dash && i === 0,
        basis: span.basis,
      }, dtSeconds, c);
      state = result.state; frame += 1;
      samples.push({frame, x: state.x, y: state.y, z: state.z});
      for (const e of result.events) events.push({frame, ...e});
    }
    if (releasedAtFrame === null && !span.forward && !span.strafe && !span.dash) releasedAtFrame = frame - span.frames + 1;
  }
  return {samples, events, releasedAtFrame, finalState: state,
    unobservable: []};
}
