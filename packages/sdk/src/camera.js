/**
 * Camera Director — presentation-only camera controller.
 *
 * Owns the *choice* of camera pose (mode, target, orientation, projection, fov)
 * without driving any renderer directly. It reads an authoritative target's
 * transform and an optional pointer-look state, and publishes a single
 * `desired` pose object each frame. A presentation adapter (see three.js
 * `directCamera`) applies that pose to one active camera immediately before
 * rendering.
 *
 * Invariants (custody): the director NEVER mutates authoritative entity
 * transforms, mission state, inventory, world revision, persistent resources,
 * network authority, or entity ownership. It is presentation-only. It writes
 * nothing to the scene; it only reads `findEntity(...).components.transform`.
 *
 * Rig conventions:
 *   - `isometric`: orthographic, 45° yaw, 35–50° pitch downward, fully zoomable.
 *   - `over-shoulder`: perspective, tight shoulder offset, mouse yaw + pitch.
 *   - `third-person`: perspective, centered behind the target, orbiting.
 */
const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const MODES = Object.freeze(['isometric', 'over-shoulder', 'third-person']);

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(arrA, arrB, t) { return arrA.map((a, i) => lerp(a, arrB[i], t)); }
function angleLerp(a, b, t) {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return a + d * t;
}

/** A spherical offset resolved from yaw/pitch/distance. Pure, no state. */
function spherical(yaw, pitch, distance) {
  const cp = Math.cos(pitch);
  return {
    x: distance * cp * Math.sin(yaw),
    y: distance * Math.sin(pitch),
    z: distance * cp * Math.cos(yaw),
  };
}

/**
 * Read-only camera occlusion: slide the camera along the target→camera ray so it
 * does not pass inside a box collider. Purely presentation — returns a replacement
 * position and mutates nothing.
 *
 * Uses the slab method for ray↔axis-aligned-box intersection. Each candidate
 * collider box is `position ± halfSize·scale`. The target entity is excluded
 * (never occludes its own camera). Returns the nearest blocking t∈(0,1); the
 * camera is clamped to `clearance` in front of the first hit.
 */
function resolveOcclusion(target, cameraPos, entities, targetId, clearance = 0.35) {
  let dirx = cameraPos[0] - target[0];
  let diry = cameraPos[1] - target[1];
  let dirz = cameraPos[2] - target[2];
  const dist = Math.hypot(dirx, diry, dirz);
  if (!(dist > 1e-6)) return { position: cameraPos, hit: false };
  dirx /= dist; diry /= dist; dirz /= dist;

  let nearest = Infinity;
  for (const e of entities) {
    if (e.id === targetId) continue;
    const c = e.components?.collider;
    const t = e.components?.transform;
    if (!c || !t || !c.halfSize) continue;
    const cx = t.position[0], cy = t.position[1], cz = t.position[2];
    const hsx = c.halfSize[0] * (t.scale?.[0] ?? 1);
    const hsy = c.halfSize[1] * (t.scale?.[1] ?? 1);
    const hsz = c.halfSize[2] * (t.scale?.[2] ?? 1);
    // Slab test for AABB [cx-hsx,cx+hsx]×[cy-hsy,cy+hsy]×[cz-hsz,cz+hsz].
    const tmin = (() => {
      let lo = 0, hi = dist;
      const slab = (o, d, hs) => {
        if (Math.abs(d) < 1e-9) { if (o < -hs || o > hs) return -1; return 0; }
        let t1 = (-hs - o) / d, t2 = (hs - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        return { t1, t2 };
      };
      const sx = slab(target[0] - cx, dirx, hsx);
      if (sx === -1) return -1; if (sx) { lo = Math.max(lo, sx.t1); hi = Math.min(hi, sx.t2); if (lo > hi) return -1; }
      const sy = slab(target[1] - cy, diry, hsy);
      if (sy === -1) return -1; if (sy) { lo = Math.max(lo, sy.t1); hi = Math.min(hi, sy.t2); if (lo > hi) return -1; }
      const sz = slab(target[2] - cz, dirz, hsz);
      if (sz === -1) return -1; if (sz) { lo = Math.max(lo, sz.t1); hi = Math.min(hi, sz.t2); if (lo > hi) return -1; }
      return lo;
    })();
    if (tmin >= 0 && tmin < nearest) nearest = tmin;
  }

  if (!Number.isFinite(nearest)) return { position: cameraPos, hit: false };
  const slide = nearest - clearance;
  if (slide <= 0) return { position: target.slice(), hit: true };
  return {
    position: [target[0] + dirx * slide, target[1] + diry * slide, target[2] + dirz * slide],
    hit: true,
  };
}

/**
 * Compose a camera pose for a given rig and a target position.
 * @param {'isometric'|'over-shoulder'|'third-person'} mode
 * @param {[number,number,number]} targetPos
 * @param {{yaw:number,pitch:number,distance:number}} look orientation state (radians)
 * @param {{rotation:number[]}|null} targetTransform follow target's transform (for facing)
 */
export function resolveRig(mode, targetPos, look, targetTransform) {
  const yaw = look.yaw, pitch = look.pitch, dist = look.distance;
  if (mode === 'isometric') {
    // Snap toward 45° increments so the view reads as a clean axonometric angle.
    const snap = Math.PI / 4;
    const yawIso = Math.round(yaw / snap) * snap;
    const pitchIso = clamp(pitch, 35 * DEG, 50 * DEG);
    const d = clamp(dist, 4, 120);
    const off = spherical(yawIso, pitchIso, d);
    return {
      projection: 'orthographic',
      position: [targetPos[0] + off.x, targetPos[1] + off.y, targetPos[2] + off.z],
      target: targetPos.slice(),
      fov: undefined,
      distance: d,
      orthoScale: Math.max(4, d * 0.8),
    };
  }
  const perspective = { projection: 'perspective', target: targetPos.slice() };
  if (mode === 'over-shoulder') {
    // Target facing around +Y axis (rotation[1]); shoulder sits to its side.
    const facingYaw = targetTransform ? targetTransform.rotation[1] : yaw;
    const shoulderSide = 0.65; // meters
    const camYaw = facingYaw + Math.PI + yaw;
    const camPitch = clamp(pitch + 10 * DEG, 5 * DEG, 40 * DEG);
    const d = clamp(dist, 1.2, 4);
    const off = spherical(camYaw, camPitch, d);
    // Shoulder offset resolved perpendicular to facing.
    const sideX = Math.sin(facingYaw + Math.PI / 2) * shoulderSide;
    const sideZ = Math.cos(facingYaw + Math.PI / 2) * shoulderSide;
    return {
      ...perspective,
      position: [targetPos[0] + sideX + off.x, targetPos[1] + 0.7 + off.y, targetPos[2] + sideZ + off.z],
      fov: 58,
      distance: d,
    };
  }
  // third-person: centered behind, orbiting around the target.
  const camYaw = yaw;
  const camPitch = clamp(pitch, 5 * DEG, 60 * DEG);
  const d = clamp(dist, 2, 25);
  const off = spherical(camYaw, camPitch, d);
  return {
    ...perspective,
    position: [targetPos[0] + off.x, targetPos[1] + off.y, targetPos[2] + off.z],
    fov: 50,
    distance: d,
  };
}

const DEFAULT_RIG = Object.freeze({
  isometric: { yaw: 45 * DEG, pitch: 40 * DEG, distance: 13 },
  'over-shoulder': { yaw: 0, pitch: 14 * DEG, distance: 2.2 },
  'third-person': { yaw: 0, pitch: 20 * DEG, distance: 7 },
});

/**
 * Versioned camera-preset contract (data-only, no executable scripts). Projects
 * may embed a `camera` block so authored camera settings travel with the project.
 * Schema: `zge.camera.presets.v1`.
 *
 * Fields (all optional; missing values fall back to the rig defaults):
 *  - defaultMode: 'isometric'|'over-shoulder'|'third-person'
 *  - enabledModes: subset of the three modes
 *  - followDistance, elevation, offset, fov, orthoScale: per-mode numbers
 *  - sensitivity: mouse-look radians per pixel
 *  - pitchLimits: [min, max] pitch radians
 *  - smoothing, transitionDuration: seconds
 */
const CAMERA_PRESET_SCHEMA = 'zge.camera.presets.v1';

function validateCameraPreset(value) {
  if (value == null) return null;
  const p = { ...value };
  if (p.schema !== CAMERA_PRESET_SCHEMA) throw new Error(`camera preset must be ${CAMERA_PRESET_SCHEMA}`);
  if (p.defaultMode != null && !MODES.includes(p.defaultMode)) throw new Error('invalid camera defaultMode');
  if (p.enabledModes != null) {
    if (!Array.isArray(p.enabledModes) || !p.enabledModes.every(m => MODES.includes(m))) throw new Error('invalid camera enabledModes');
  }
  for (const key of ['followDistance', 'elevation', 'offset', 'fov', 'orthoScale', 'sensitivity']) {
    if (p[key] != null && !Number.isFinite(p[key])) throw new Error(`camera ${key} must be finite`);
  }
  if (p.pitchLimits != null && (!Array.isArray(p.pitchLimits) || p.pitchLimits.length !== 2 || !p.pitchLimits.every(Number.isFinite))) throw new Error('camera pitchLimits must be [min,max]');
  for (const key of ['smoothing', 'transitionDuration']) {
    if (p[key] != null && (!Number.isFinite(p[key]) || p[key] < 0)) throw new Error(`camera ${key} must be non-negative`);
  }
  return p;
}

/**
 * Create a camera director. Requires the SDK engine api (with `registerSystem`,
 * `events`, and `world.findEntity`) so it runs as a `render`-phase system.
 *
 * @param {{registerSystem:Function, events:{on:Function}, world:{findEntity:Function}}} engine
 * @param {{transitionDuration?:number}} [options]
 */
export function createCameraDirector(engine, options = {}) {
  let transitionDuration = Number.isFinite(options.transitionDuration)
    ? clamp(options.transitionDuration, 0, 2)
    : 0.35;
  // Presentation-only collision sliding: enabled by default, can be disabled.
  let collision = options.collision !== false;
  const collisionClearance = Number.isFinite(options.collisionClearance)
    ? clamp(options.collisionClearance, 0.05, 2)
    : 0.35;

  let mode = 'isometric';
  let targetId = null;
  // Per-mode rig overrides from an authored preset (data-only).
  let rigOverrides = {};
  let enabledModes = MODES.slice();
  let presetSensitivity = null;
  let presetPitchLimits = null;
  let presetSmoothing = null;
  // Base rig look (per mode), plus live pointer-look deltas.
  let baseLook = { ...DEFAULT_RIG.isometric };
  let pointerYaw = 0;
  let pointerPitch = 0;
  let pointerDistance = null;
  if (options.preset) applyPresetData(options.preset);

  // Transition state.
  let fromPose = null;
  let toPose = null;
  let transitionStart = -1;
  let lastPose = null;
  let movementBasisHolder = null;

  const listeners = new Set();
  const emit = (type, data) => { for (const fn of [...listeners]) { try { fn(type, data); } catch { /* non-authoritative */ } } };

  // Read-only list of collidable entities (never mutated).
  function collidableEntities() {
    try { return engine.world.entities?.() ?? []; }
    catch { return []; }
  }

  function applyCollision(pose) {
    if (!collision || !pose) return pose;
    const t = pose.target;
    if (!t) return pose;
    const occ = resolveOcclusion(t, pose.position, collidableEntities(), targetId, collisionClearance);
    if (!occ.hit) return pose;
    return { ...pose, position: occ.position, distance: Math.hypot(occ.position[0]-t[0], occ.position[1]-t[1], occ.position[2]-t[2]) };
  }

  function currentLook() {
    const ov = rigOverrides[mode] ?? {};
    return {
      yaw: (ov.yaw ?? baseLook.yaw) + pointerYaw,
      pitch: (ov.pitch ?? baseLook.pitch) + pointerPitch,
      distance: ov.distance ?? (pointerDistance ?? baseLook.distance),
    };
  }

  // Resolve the per-mode base look (defaults merged with authored overrides).
  function baseRig(nextMode) {
    const d = DEFAULT_RIG[nextMode];
    const ov = rigOverrides[nextMode] ?? {};
    return {
      yaw: ov.yaw ?? d.yaw,
      pitch: ov.pitch ?? d.pitch,
      distance: ov.distance ?? d.distance,
    };
  }

  function applyPresetData(preset) {
    if (preset == null) return;
    const p = validateCameraPreset(preset);
    if (!p) return;
    if (p.defaultMode) mode = p.defaultMode;
    if (p.enabledModes) enabledModes = p.enabledModes.slice();
    presetSensitivity = p.sensitivity ?? presetSensitivity;
    presetPitchLimits = p.pitchLimits ?? presetPitchLimits;
    presetSmoothing = p.smoothing ?? presetSmoothing;
    if (p.transitionDuration != null) transitionDuration = clamp(p.transitionDuration, 0, 2);
    for (const m of MODES) {
      const per = p[m] ?? {};
      const override = {};
      if (per.distance != null) override.distance = per.distance;
      else if (per.followDistance != null) override.distance = per.followDistance;
      if (per.pitch != null) override.pitch = per.pitch;
      else if (per.elevation != null) override.pitch = per.elevation;
      if (per.yaw != null) override.yaw = per.yaw;
      if (Object.keys(override).length) rigOverrides[m] = override;
    }
    baseLook = { ...baseRig(mode) };
  }

  function targetTransform() {
    const target = targetId ? engine.world.findEntity(targetId) : null;
    const t = target?.components?.transform;
    return t;
  }

  function computePose(now) {
    const t = targetTransform();
    if (!t) return lastPose;
    const pos = t.position;
    const pose = applyCollision(resolveRig(mode, pos, currentLook(), t));

    if (!fromPose || !toPose) return pose;

    const total = transitionDuration * 1000;
    const elapsed = now - transitionStart;
    if (elapsed >= total || total <= 0) {
      fromPose = toPose = null;
      return pose;
    }
    const u = clamp(elapsed / total, 0, 1);
    const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // easeInOutQuad
    // Projection swaps at the midpoint of the transition.
    return {
      projection: eased < 0.5 ? fromPose.projection : toPose.projection,
      position: mix(fromPose.position, pose.position, eased),
      target: mix(fromPose.target, pose.target, eased),
      fov: (fromPose.fov != null && toPose.fov != null) ? lerp(fromPose.fov, toPose.fov, eased) : toPose.fov,
      distance: lerp(fromPose.distance ?? toPose.distance, pose.distance ?? toPose.distance, eased),
      orthoScale: (fromPose.orthoScale != null && toPose.orthoScale != null)
        ? lerp(fromPose.orthoScale, toPose.orthoScale, eased) : toPose.orthoScale,
    };
  }

  const api = {
    setMode(next) {
      if (!MODES.includes(next)) throw new Error(`unknown camera mode "${next}" (expected ${MODES.join('|')})`);
      if (!enabledModes.includes(next)) throw new Error(`camera mode "${next}" is disabled by the project preset`);
      if (next === mode) return api;
      const old = mode;
      mode = next;
      const t = targetTransform();
      const base = t ? t.position : [0, 0, 0];
      fromPose = lastPose ?? resolveRig(old, base, currentLook(), t);
      baseLook = { ...baseRig(next) };
      pointerYaw = pointerPitch = 0;
      pointerDistance = null;
      toPose = resolveRig(next, base, currentLook(), t);
      transitionStart = performance.now();
      emit('change', { mode: next, from: old });
      return api;
    },
    get mode() { return mode; },
    follow(entityId) {
      targetId = entityId == null ? null : String(entityId);
      if (targetId != null) {
        baseLook = { ...baseRig(mode) };
        pointerYaw = pointerPitch = 0;
        pointerDistance = null;
        fromPose = toPose = null;
        transitionStart = -1;
      }
      emit('follow', { target: targetId });
      return api;
    },
    get target() { return targetId; },
    setTransitionDuration(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 2) throw new Error('transition duration must be 0..2 seconds');
      transitionDuration = seconds;
      return api;
    },
    get transitionDuration() { return transitionDuration; },
    /** Presentation-safe pointer-look deltas (radians). No scene mutation. */
    setLook(yaw, pitch, distance) {
      if (Number.isFinite(yaw)) pointerYaw = yaw;
      if (Number.isFinite(pitch)) pointerPitch = pitch;
      if (Number.isFinite(distance)) pointerDistance = distance;
      return api;
    },
    /** Compute and commit this frame's desired pose. Returns the pose. */
    update(now = performance.now()) {
      const pose = computePose(now);
      if (pose) lastPose = pose;
      if (movementBasisHolder) {
        const b = api.getMovementBasis();
        movementBasisHolder.forward = b.forward;
        movementBasisHolder.right = b.right;
      }
      return pose;
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Bind a mutable holder ({forward:[fx,fz], right:[rx,rz]}) the director updates each `update()`. */
    bindMovementBasis(holder) {
      if (holder && typeof holder === 'object') {
        movementBasisHolder = holder;
        const b = api.getMovementBasis();
        holder.forward = b.forward; holder.right = b.right;
      }
      return api;
    },
    /**
     * Camera-relative ground movement basis. `forward` points from the camera
     * toward the target, projected onto the ground (the direction the camera is
     * looking); `right` is its +90° companion (turn right from `forward`).
     * Both are unit-length in the (x,z) plane. This is what WASD should adopt
     * so that W = away from/into screen, D = screen-right. Presentation-only:
     * it reads the last computed pose and mutates nothing.
     */
    getMovementBasis() {
      const t = targetTransform();
      if (!t) return { forward: [0, 1], right: [-1, 0] };
      const pose = lastPose ?? computePose();
      if (!pose) return { forward: [0, 1], right: [-1, 0] };
      // forward = (target - camera) projected to ground, normalized.
      let fx = pose.target[0] - pose.position[0];
      let fz = pose.target[2] - pose.position[2];
      const len = Math.hypot(fx, fz) || 1;
      fx /= len; fz /= len;
      // right = forward rotated +90° around +Y: R_y(+90)·(x,z) = (−z, x).
      return { forward: [fx, fz], right: [-fz, fx] };
    },
    /** Toggle occlusion sliding (presentation-only). */
    setCollision(enabled) {
      collision = !!enabled;
      return api;
    },
    get collision() { return collision; },
    /** Apply a versioned camera preset (data-only) at runtime. */
    applyPreset(preset) {
      applyPresetData(preset);
      baseLook = { ...baseRig(mode) };
      pointerYaw = pointerPitch = 0;
      pointerDistance = null;
      emit('preset', { mode, defaultMode: mode });
      return api;
    },
    get enabledModes() { return enabledModes.slice(); },
    get sensitivity() { return presetSensitivity; },
    get pitchLimits() { return presetPitchLimits; },
    get smoothing() { return presetSmoothing; },
  };

  const system = engine.registerSystem({
    id: 'camera:director',
    phase: 'render',
    run: () => { const pose = api.update(); emit('frame', pose); },
  });

  api.dispose = () => system();

  return api;
}

export { MODES, resolveOcclusion, CAMERA_PRESET_SCHEMA, validateCameraPreset };
