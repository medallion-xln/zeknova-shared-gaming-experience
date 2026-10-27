import {SDKError} from './schema.js';

/**
 * Movement — the first system rebuilt onto the SDK engine (ZGE-17 AC9-AC11).
 *
 * This is deliberately NOT extracted from the frozen bundle. It is re-derived against the
 * bundle's observable behaviour, which is what "a completely deconstructed version of the
 * ZekNova game" means in practice: the old build is the specification, not the source.
 *
 * Feel target (ZGE-17 §12): Returnal's MOVE SET — dash with i-frames, double jump, real air
 * control — on Call of Duty's PHYSICS QUALITY: weight, a short but real acceleration ramp,
 * a crisp stop, and nothing floaty. Every number below is data, not a constant baked into the
 * step: a host overrides any of them, which is what AC10 means by data-driven.
 *
 * Dash cooldown is tuned against content that already exists. The bundle's juggernaut
 * telegraphs for 0.92 s before a 1.55 s committed charge and runs its charge and slam on
 * 6.8 s / 7.5 s cooldowns (docs/engine/REBUILD_REQUIRED_BEHAVIOURS.md), so a 0.9 s dash
 * cooldown gives roughly seven evasions per boss cycle — enough to read a telegraph and move,
 * not enough to ignore one.
 *
 * AUTHORITY. Per ZGE-17 §5 the split is: movement and feel are the client's, damage and world
 * mutation are server-validated. A dash sits across that line, because i-frames do not negate
 * movement, they negate DAMAGE. So the plugin never asserts "I took no damage". It emits a
 * timestamped evasion window — a bounded, checkable claim — and `validateEvasionWindow` is the
 * check a server runs against its own clock and its own copy of the config. See AC11.
 */

export const MOVEMENT_SCHEMA = 'zge.movement.v1';
export const EVASION_SCHEMA = 'zge.evasion.v1';

/** What this plugin owns, declared rather than implied — the vocabulary the Q5 split needs. */
export const MOVEMENT_AUTHORITY = Object.freeze({
  plugin: 'movement',
  clientAuthoritative: Object.freeze(['position', 'velocity', 'facing', 'grounded', 'jump', 'dash-motion']),
  serverValidated: Object.freeze(['damage-negation']),
  claims: Object.freeze([EVASION_SCHEMA]),
  note: 'The client owns where it is. It does not own whether it was hit.',
});

export const DEFAULT_MOVEMENT = Object.freeze({
  schema: MOVEMENT_SCHEMA,
  speed: 6,              // m/s on the ground
  acceleration: 60,      // reaches full speed in ~0.1 s — weight without sludge
  deceleration: 90,      // and stops crisply; AC10 requires it reach exactly zero
  airControl: 0.45,      // Returnal lets you steer in the air; it does not let you fly
  gravity: 24,           // heavier than earth: landings read as landings
  jumpVelocity: 8.5,
  maxJumps: 2,           // ground jump + one air jump
  groundY: 0,
  restEpsilon: 1e-6,     // below this, velocity snaps to zero rather than decaying forever
  dash: Object.freeze({
    speed: 26,
    durationMs: 180,
    cooldownMs: 900,
    invulnerableMs: 140, // strictly inside the dash: the tail is committed but vulnerable
    airDashes: 1,
  }),
});

const check = (ok, message) => { if (!ok) throw new SDKError('MOVEMENT_CONFIG', message); };
const finite = (v) => Number.isFinite(v);

export function validateMovementConfig(config) {
  const c = {...DEFAULT_MOVEMENT, ...config, dash: {...DEFAULT_MOVEMENT.dash, ...(config?.dash ?? {})}};
  check(c.schema === MOVEMENT_SCHEMA, 'Invalid movement schema');
  for (const key of ['speed', 'acceleration', 'deceleration', 'gravity', 'jumpVelocity']) {
    check(finite(c[key]) && c[key] > 0 && c[key] <= 1000, `movement.${key} must be > 0 and <= 1000`);
  }
  check(finite(c.airControl) && c.airControl >= 0 && c.airControl <= 1, 'movement.airControl must be 0..1');
  check(Number.isInteger(c.maxJumps) && c.maxJumps >= 1 && c.maxJumps <= 8, 'movement.maxJumps must be 1..8');
  check(finite(c.groundY), 'movement.groundY must be finite');
  check(finite(c.restEpsilon) && c.restEpsilon > 0 && c.restEpsilon < 1, 'movement.restEpsilon must be a small positive number');
  check(finite(c.dash.speed) && c.dash.speed > 0 && c.dash.speed <= 1000, 'dash.speed must be > 0');
  for (const key of ['durationMs', 'cooldownMs', 'invulnerableMs']) {
    check(finite(c.dash[key]) && c.dash[key] >= 0 && c.dash[key] <= 60000, `dash.${key} must be 0..60000`);
  }
  check(c.dash.invulnerableMs <= c.dash.durationMs, 'dash.invulnerableMs cannot outlast the dash itself');
  check(c.dash.cooldownMs >= c.dash.durationMs, 'dash.cooldownMs must be at least the dash duration');
  check(Number.isInteger(c.dash.airDashes) && c.dash.airDashes >= 0 && c.dash.airDashes <= 8, 'dash.airDashes must be 0..8');
  return Object.freeze({...c, dash: Object.freeze({...c.dash})});
}

export function createMovementState({x = 0, y = 0, z = 0, config = DEFAULT_MOVEMENT} = {}) {
  const c = validateMovementConfig(config);
  return {
    x, y: Math.max(y, c.groundY), z,
    vx: 0, vy: 0, vz: 0,
    facingX: 0, facingZ: 1,
    grounded: y <= c.groundY,
    jumpsUsed: 0, airDashesUsed: 0,
    dashUntilMs: -Infinity, dashReadyAtMs: -Infinity,
    dashDirX: 0, dashDirZ: 0,
    timeMs: 0, sequence: 0, evasionSequence: 0,
    lastEvasion: null,
  };
}

const DEFAULT_BASIS = Object.freeze({forward: [0, 1], right: [1, 0]});

/**
 * One deterministic step. Pure: same state + input + dt gives the same result on any machine,
 * which is what lets the parity harness replay a trajectory offline and a test assert feel
 * targets without a browser.
 *
 * `input.jump` and `input.dash` are EDGES (pressed this step), not held flags — holding a key
 * must not re-trigger. The host does that debouncing; `installMovement` below does it for you.
 */
export function stepMovement(state, input, dtSeconds, config = DEFAULT_MOVEMENT) {
  const c = config.schema === MOVEMENT_SCHEMA && Object.isFrozen(config) ? config : validateMovementConfig(config);
  check(finite(dtSeconds) && dtSeconds > 0 && dtSeconds <= 1, 'dt must be a positive number of seconds <= 1');
  const s = {...state};
  const events = [];
  const basis = input?.basis ?? DEFAULT_BASIS;
  const dtMs = dtSeconds * 1000;
  s.timeMs += dtMs;
  s.sequence += 1;

  // Intent, normalised so diagonals are not faster.
  let forward = Math.max(-1, Math.min(1, Number(input?.forward ?? 0)));
  let strafe = Math.max(-1, Math.min(1, Number(input?.strafe ?? 0)));
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude > 1) { forward /= magnitude; strafe /= magnitude; }
  const wishX = basis.forward[0] * forward + basis.right[0] * strafe;
  const wishZ = basis.forward[1] * forward + basis.right[1] * strafe;
  const wishLength = Math.hypot(wishX, wishZ);

  const dashing = s.timeMs < s.dashUntilMs;

  // ── dash ────────────────────────────────────────────────────────────────────
  if (input?.dash && !dashing && s.timeMs >= s.dashReadyAtMs
      && (s.grounded || s.airDashesUsed < c.dash.airDashes)) {
    // Dash the way you are steering; with no input, the way you are facing.
    const dirX = wishLength > 0 ? wishX / wishLength : s.facingX;
    const dirZ = wishLength > 0 ? wishZ / wishLength : s.facingZ;
    s.dashDirX = dirX; s.dashDirZ = dirZ;
    s.dashUntilMs = s.timeMs + c.dash.durationMs;
    s.dashReadyAtMs = s.timeMs + c.dash.cooldownMs;
    if (!s.grounded) s.airDashesUsed += 1;
    s.evasionSequence += 1;
    const evasion = Object.freeze({
      schema: EVASION_SCHEMA,
      sequence: s.evasionSequence,
      inputSequence: s.sequence,
      startedAtMs: s.timeMs,
      endsAtMs: s.timeMs + c.dash.invulnerableMs,
      durationMs: c.dash.invulnerableMs,
      earliestNextMs: s.timeMs + c.dash.cooldownMs,
      authority: 'client-feel',
      claim: 'damage-negation',
    });
    s.lastEvasion = evasion;
    events.push({type: 'movement:dash', direction: [dirX, dirZ], evasion});
    events.push({type: 'movement:evasion-window', evasion});
  }

  // ── jump ────────────────────────────────────────────────────────────────────
  if (input?.jump && s.jumpsUsed < c.maxJumps) {
    s.vy = c.jumpVelocity;
    s.jumpsUsed += 1;
    s.grounded = false;
    events.push({type: 'movement:jump', ordinal: s.jumpsUsed, double: s.jumpsUsed > 1});
  }

  // ── horizontal ──────────────────────────────────────────────────────────────
  if (s.timeMs < s.dashUntilMs) {
    // A dash is committed: it overrides steering for its duration. That commitment is what
    // makes it readable to another player, and what makes the i-frame window meaningful.
    s.vx = s.dashDirX * c.dash.speed;
    s.vz = s.dashDirZ * c.dash.speed;
  } else {
    const control = s.grounded ? 1 : c.airControl;
    const targetX = wishLength > 0 ? (wishX / Math.max(wishLength, 1)) * c.speed : 0;
    const targetZ = wishLength > 0 ? (wishZ / Math.max(wishLength, 1)) * c.speed : 0;
    const rate = (wishLength > 0 ? c.acceleration : c.deceleration) * control * dtSeconds;
    for (const [axis, target] of [['vx', targetX], ['vz', targetZ]]) {
      const delta = target - s[axis];
      s[axis] = Math.abs(delta) <= rate ? target : s[axis] + Math.sign(delta) * rate;
    }
    // AC10: at rest the result must be EXACTLY zero, not an asymptote, or the character
    // creeps forever after the key comes up.
    if (wishLength === 0 && Math.hypot(s.vx, s.vz) < c.restEpsilon) { s.vx = 0; s.vz = 0; }
  }

  if (wishLength > 0) { s.facingX = wishX / wishLength; s.facingZ = wishZ / wishLength; }

  // ── vertical ────────────────────────────────────────────────────────────────
  s.vy -= c.gravity * dtSeconds;
  s.x += s.vx * dtSeconds;
  s.y += s.vy * dtSeconds;
  s.z += s.vz * dtSeconds;

  if (s.y <= c.groundY) {
    const wasAirborne = !s.grounded;
    s.y = c.groundY; s.vy = 0;
    s.grounded = true; s.jumpsUsed = 0; s.airDashesUsed = 0;
    if (wasAirborne) events.push({type: 'movement:land', at: [s.x, s.y, s.z]});
  } else s.grounded = false;

  return {state: s, events, dashing: s.timeMs < s.dashUntilMs,
    invulnerable: !!s.lastEvasion && s.timeMs < s.lastEvasion.endsAtMs};
}

/**
 * AC11 — the check a SERVER runs. The client sends a window; this decides whether to honour it.
 *
 * It never trusts a field it can derive: the window's length, and when the next one may start,
 * both come from the server's own copy of the config. A client that sends a longer window, an
 * earlier dash than its cooldown allows, a replayed or skipped sequence, or a timestamp from
 * the future is rejected with a reason.
 */
export function validateEvasionWindow(window, {config = DEFAULT_MOVEMENT, previous = null, nowMs = null, toleranceMs = 50} = {}) {
  const c = config.schema === MOVEMENT_SCHEMA && Object.isFrozen(config) ? config : validateMovementConfig(config);
  const fail = (reason, detail = {}) => ({ok: false, reason, ...detail});
  if (!window || window.schema !== EVASION_SCHEMA) return fail('schema');
  if (window.claim !== 'damage-negation' || window.authority !== 'client-feel') return fail('claim');
  for (const key of ['sequence', 'inputSequence']) {
    if (!Number.isSafeInteger(window[key]) || window[key] < 1) return fail('sequence-shape', {key});
  }
  for (const key of ['startedAtMs', 'endsAtMs', 'durationMs', 'earliestNextMs']) {
    if (!finite(window[key]) || window[key] < 0) return fail('timestamp-shape', {key});
  }
  // Length and cooldown are the server's to decide, not the client's to declare.
  // Compared with an epsilon, not strict equality: these timestamps accumulate from a running
  // simulation clock, so an honest client's endsAtMs - startedAtMs lands on 139.99999999999977
  // rather than 140. Exact comparison here rejects honest clients, which is worse than useless.
  const EPSILON_MS = 1e-6;
  const off = (actual, expected) => Math.abs(actual - expected) > EPSILON_MS;
  if (off(window.durationMs, c.dash.invulnerableMs)) return fail('duration-not-configured', {declared: window.durationMs, expected: c.dash.invulnerableMs});
  if (off(window.endsAtMs - window.startedAtMs, window.durationMs)) return fail('window-inconsistent');
  if (off(window.earliestNextMs - window.startedAtMs, c.dash.cooldownMs)) return fail('cooldown-not-configured', {declared: window.earliestNextMs - window.startedAtMs, expected: c.dash.cooldownMs});
  if (previous) {
    if (window.sequence !== previous.sequence + 1) return fail('sequence-gap', {expected: previous.sequence + 1, got: window.sequence});
    if (window.startedAtMs < previous.earliestNextMs) return fail('cooldown-violated', {earliest: previous.earliestNextMs, got: window.startedAtMs});
  } else if (window.sequence !== 1) return fail('sequence-gap', {expected: 1, got: window.sequence});
  if (nowMs !== null && window.startedAtMs > nowMs + toleranceMs) return fail('future-dated', {nowMs, startedAtMs: window.startedAtMs});
  return {ok: true, reason: null, coversMs: [window.startedAtMs, window.endsAtMs]};
}

/** Was damage at `atMs` covered by a window the server already accepted? */
export function evasionCovers(window, atMs) {
  return !!window && finite(atMs) && atMs >= window.startedAtMs && atMs < window.endsAtMs;
}

/**
 * AC9 — install as an engine system. Edge detection for jump and dash lives here so the pure
 * step stays pure; `input` is the same held-key Set the SDK's data rules already use.
 */
export function installMovement(engine, {entity = 'player', input = new Set(), orientation = null, config = DEFAULT_MOVEMENT, keys = {}} = {}) {
  const c = validateMovementConfig(config);
  const bind = {forward: ['w', 'ArrowUp'], back: ['s', 'ArrowDown'], left: ['a', 'ArrowLeft'], right: ['d', 'ArrowRight'],
    jump: [' ', 'Spacebar'], dash: ['Shift', 'shift'], ...keys};
  const held = new Set();
  let state = null;
  const basis = () => {
    const b = orientation?.getMovementBasis?.() ?? orientation;
    return Array.isArray(b?.forward) && finite(b.forward[0]) ? {forward: b.forward.slice(0, 2), right: b.right.slice(0, 2)} : DEFAULT_BASIS;
  };
  const down = (names) => names.some((k) => input.has(k));
  const remove = engine.registerSystem({id: 'movement', phase: 'simulate', run(scene, dt, {events}) {
    const target = scene?.findEntity?.(entity);
    if (!target?.components?.transform) return;
    if (!state) { const [x, y, z] = target.components.transform.position; state = createMovementState({x, y, z, config: c}); }
    const edge = (names) => names.some((k) => input.has(k) && !held.has(k));
    const frame = {
      forward: (down(bind.forward) ? 1 : 0) - (down(bind.back) ? 1 : 0),
      strafe: (down(bind.right) ? 1 : 0) - (down(bind.left) ? 1 : 0),
      jump: edge(bind.jump), dash: edge(bind.dash), basis: basis(),
    };
    held.clear(); for (const k of input) held.add(k);
    const result = stepMovement(state, frame, dt, c);
    state = result.state;
    const [px, py, pz] = target.components.transform.position;
    if (px !== state.x || py !== state.y || pz !== state.z) scene.updateTransform(entity, {position: [state.x, state.y, state.z]});
    for (const event of result.events) events?.emit?.('game:movement', event);
    return result;
  }});
  return {
    config: c, authority: MOVEMENT_AUTHORITY,
    get state() { return state ? {...state} : null; },
    get lastEvasion() { return state?.lastEvasion ?? null; },
    dispose() { remove?.(); state = null; held.clear(); },
  };
}
