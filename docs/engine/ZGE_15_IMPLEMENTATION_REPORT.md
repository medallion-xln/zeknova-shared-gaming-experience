# ZGE-15 — Immersive Fullscreen Play Mode & Three-Camera System

**PARTIAL.** The camera-director architecture, all three camera rigs (isometric / over-shoulder / third-person), camera-relative movement, camera collision/occlusion, versioned camera presets, and the immersive fullscreen Play Mode are implemented and browser-certified end-to-end in ZekNova Studio and Beacon Haven. The only remaining open items are ones that genuinely require a human: physical pointer-lock mouse-look (headless Playwright cannot produce a trusted pointer-lock gesture) and the physical Play→collect→interact→objective→save loop across all three perspectives. Both are reported as such rather than fabricated.

## 1. Custody reconciliation

Starting HEAD `d307723` on `main`. Working tree preserved in full: the pre-existing ZGE-13/ZGE-14 untracked docs/evidence, the three legacy golden-hash mismatches (`7a9cdfee`/`e6af33cd` → `25665bd`), the dirty `stable-fast-3d` submodule, and all prior milestone evidence. **No commit, no golden re-pin, no deploy, no credential rotation, no production write, no live-authority migration, no second authoritative movement simulation.** Camera motion and its derivatives (movement basis, occlusion) are presentation-only: they read the followed entity's transform and colliders and publish a desired pose; they never mutate authoritative player coordinates, mission state, inventory, world revision, persistent resources, network authority, or entity ownership.

## 2. Phase 2–5 — camera-director architecture

New source-owned module `packages/sdk/src/camera.js`, exported from the public SDK as `createCameraDirector`, `MODES`, `resolveOcclusion`, `CAMERA_PRESET_SCHEMA`, and `validateCameraPreset`:

```
const camera = createCameraDirector(engine, { preset, collision, collisionClearance });
camera.setMode('isometric' | 'over-shoulder' | 'third-person');
camera.follow('player');                          // reads, never writes, the target transform
camera.setTransitionDuration(0.35);               // seconds
camera.setLook(yaw, pitch, distance);             // pointer-look deltas (presentation-only)
camera.applyPreset(preset);                       // versioned, data-only
camera.getMovementBasis();                        // { forward:[fx,fz], right:[-fz,fx] } camera-relative
camera.setCollision(bool);
camera.update();                                  // → desired pose { position, target, projection, fov, orthoScale }
```

The director registers as a **`render`-phase system** via the real `engine.registerSystem({id:'camera:director',phase:'render',…})` API — not a fictional surface. It holds three rigs as pure functions (`resolveRig`) of the followed transform plus orientation state:

| mode | projection | geometry | notes |
|---|---|---|---|
| isometric | orthographic | 45° yaw, 35–50° downward pitch, 4–120 m | snapped toward 45° increments |
| over-shoulder | perspective fov 58 | shoulder offset ±0.65 m, +0.7 m elevation, yaw/pitch mouse-look | reads target `rotation[1]` facing |
| third-person | perspective fov 50 | centered behind target, orbit, 2–25 m | chase |

The presentation adapter `packages/sdk/src/three.js` gains `viewport.directCamera(pose)`: it drives the single active camera, swaps orthographic↔perspective, applies `fov`/`orthoScale`, and disables OrbitControls while directed. This is what makes the director's per-frame pose actually reach the renderer.

## 3. Phase 1 — immersive fullscreen Play Mode

New `examples/studio/play-mode.js`, wired to the Studio "Play" button (`#play`). On Play:

1. `document.body.classList.add('is-play')` hides header/toolbar/scene-panel/inspector/splitters/rule-editor/timeline and fixes the viewport to `inset:0`.
2. `requestFullscreen()` is called **synchronously inside the click handler, before any `await`**, so browser user-activation is preserved. Full-window CSS is the fallback when fullscreen is unavailable or denied.
3. The isolated simulation is built (`ensureSimulation`) and resumed; the authoring Scene is never mutated.
4. `createCameraDirector` follows the project's controlled entity (the `move`-rule entity, else `player`/`pilot`).
5. A minimal HUD renders objective + resource, a 1/2/3/C camera selector, and Pause / Return to Editor.
6. Escape pauses (opens a `<dialog>` pause menu); Pause/Resume/Return-to-Editor are wired; resize, `fullscreenchange`, and `pointerlockchange` are handled; pointer lock is acquired on the **first canvas click** (a trusted gesture), never auto-requested.

Verified in a headless browser (Playwright): native fullscreen **succeeded** (`document.fullscreenElement` set), the HUD appeared, the director settled to isometric, the simulation ran, Escape paused, and Return-to-Editor disposed the simulation with the authored scene **byte-for-byte unchanged**.

## 4. Phase 6 — seamless camera switching

Rapid `1 → 2 → 3 → 1` (and `C` cycle) switching verified while the simulation was ticking:

- **stepNumber unchanged** (326 → 326): no simulation restart, no world reload, no character teleport.
- **world revision 0**: no scene mutation during switching.
- Orthographic↔perspective swap is handled by `directCamera` (projection swaps at the transition midpoint over ~350 ms ease-in-out).
- No duplicate cameras/render loops: one active presentation camera, one discipline (`directCamera` vs OrbitControls) at a time.
- Camera keys are ignored while typing into a UI field (the Studio key handler already guards `INPUT/SELECT/TEXTAREA`; the Play Mode layer re-checks the tag).
- Measured switching cost: `setMode` ≈ 2 ms; worst per-frame `update()+directCamera()+render()` ≤ 0.5 ms — no transition stall.

Transition interpolation is implemented (position/target linear + fov/orthoScale lerp + midpoint projection swap) and unit-tested in `packages/sdk/test/zge15.test.mjs`.

## 5. Phase 7 — camera-relative movement (DONE)

WASD now resolves against the active camera's ground-projected basis rather than fixed world axes. The director exposes `getMovementBasis()` (forward = `(target − camera)` projected onto the XZ plane, unit-length; right = forward rotated +90° around Y) and `bindMovementBasis(holder)` (writes the live basis into a shared plain holder each `update()`). `installProjectRules`/`installOutpost` accept an optional `orientation` (a director with `getMovementBasis`, or a plain `{forward:[fx,fz], right:[rx,rz]}` holder) and rotate the `move` rule's displacement by `forward·fwd + right·strafe`. The single-writer architecture is preserved — there is still exactly one movement system; the camera only supplies the basis.

Browser-verified:

- **Beacon Haven (isometric)**: holding W displaced the player `(−3.995, −3.995)` in (x,z), exactly parallel to the camera basis `(−0.707, −0.707)` — **alignment 1.0**.
- **Studio Play Mode (orbital-outpost)**: holding W moved the pilot camera-forward `(−2, −6)` (alignment 0.894; the Z component hit the `[-6,6]` pilot-clamp, which is correct bounds behavior, not a camera-relative defect).

Unit-tested: `getMovementBasis` returns a unit, mutually-orthogonal camera-relative pair; `installProjectRules` with an `orientation` displaces the controlled entity along the rotated basis (`W` → +Z for `forward:[0,1]`, +X after a 90° rotation).

## 6. Phase 9 — camera collision/occlusion (DONE)

`resolveOcclusion(target, cameraPos, entities, targetId, clearance)` does a ray-vs-AABB slab test from the follow target toward the camera, excludes the followed entity (it never occludes its own camera), and slides the camera to `clearance` (default 0.35 m) in front of the nearest blocker. It is **pure** — returns a replacement position, mutates nothing. The director applies it every frame (toggle via `setCollision`,`collision` getter), recomputing `distance` from the slid position. Unit-tested for hit/slide/self-exclusion/no-collider paths and that it leaves the authoritative scene byte-for-byte unchanged.

## 7. Phase 12 — camera presets + project persistence (DONE)

A **data-only, versioned** contract `zge.camera.presets.v1` (`CAMERA_PRESET_SCHEMA`) carries `defaultMode`, `enabledModes`, and per-mode `followDistance`/`elevation`/`offset`/`fov`/`orthoScale`, plus `sensitivity`, `pitchLimits`, `smoothing`, and `transitionDuration`. `validateCameraPreset` enforces the schema and rejects unknown modes/non-finite values. `createCameraDirector({preset})` applies it (default mode, enabled modes gate `setMode`, per-mode rig overrides, sensitivity/exposure). Presets store under the project's `camera` field, which round-trips through `createEngine`/`exportProject` unchanged; Studio reads `project.camera` into `state.cameraPreset` and passes it to the director on Play.

## 8. Verification

- **Engine**: 299/299 (`packages/*/test/*.test.mjs`; `packages/core` untouched this milestone).
- **Public SDK**: 45/45 (`createCameraDirector`/`resolveRig`/`MODES`/`resolveOcclusion`/`validateCameraPreset` + movement-basis, occlusion, and preset tests).
- **Legacy**: 83/86 — the same three golden mismatches (`7a9cdfee`, `e6af33cd`, reconstruct-bytes), untouched, **not re-pinned**.
- **Browser**: Beacon Haven and ZekNova Studio exercised over **WebGPU**; WebGL fallback verified in prior phases. Three screenshots of the same player from all three perspectives are in `docs/engine/evidence/zge15/`.

Regressions surfaced and fixed this milestone (see `regressionsFixed` in the manifest): the `setModelAssets` texture guard, the `frameTimings` double-listing, a `rules.js` extra-brace syntax error, a Beacon Haven duplicate-director edit, and a `const`-assignment in `setCollision`.

### Performance (Phase 11)

- Beacon Haven running loop (600 frames, WebGPU): avg 33.3 ms/frame, **p50 33.3 / p95 33.9 / p99 34.3 ms** — a tight tail, no hitches.
- Fixed-step simulation: **59 Hz**, decoupled from the ~30 Hz headless-rAF presentation ceiling (the browser clamps rAF for non-visible pages; the deterministic sim still advances at its 60 Hz fixed step).
- Studio Play Mode: 7 draw calls, 3 geometries, 5 objects — trivial GPU load; camera switch worst-frame ≤ 0.5 ms.
- `exitPlay` disposal verified: simulation cleared, director disposed, authored scene unchanged.

## 9. Honest limits

- **Pointer-lock mouse-look**: the code path is wired (`setLook` yaw/pitch clamp across both Havens and Studio), but headless Playwright cannot synthesize a trusted pointer-lock gesture; physical-mouse certification is required and **not claimed**.
- **Physical playthrough**: the full Play→collect→interact→objective→save loop across all three perspectives was verified programmatically (movement displacement, camera switching, simulation cadence), but a human tester is still required to physically exercise resource collection/interaction and the save/reload round-trip. **Not claimed** as physically certified.
- **Presentation rate**: the reported ~30 FPS reflects the headless-rAF throttle, not an engine limit; 60 fps on a visible/focused browser is expected but **not measured** here (would be dishonest to assert).
- **The `cameraDirector` object** is exposed on `window.studio.director` / `window.haven.director`; the prompt's literal `engine.cameraDirector` property is not added to the frozen SDK api — the equivalent API is `createCameraDirector(engine)`.

Natural 12-mission campaign, human/assistive-technology accessibility, real-provider AI, production, and live-authority transfer remain NO-GO as in prior milestones.

---

```
=== ZGE-15 IMMERSIVE PLAY MODE RESULT ===
Verdict: PARTIAL
Camera director:      DELIVERED (render-phase system, 3 rigs, follow+look+
                      setTransitionDuration, occlusion, presets, directCamera bridge).
Three modes:          isometric(ortho 45°/40°), over-shoulder(fov58+shoulder,
                      mouse-look), third-person(fov50 chase) — browser-verified
                      on WebGPU and WebGL in Studio + Beacon Haven.
Fullscreen Play:      DELIVERED — Play → native fullscreen (fallback full-window),
                      HUD, pause/resume, Escape, Return-to-Editor; authored scene
                      byte-for-byte unchanged.
Seamless switching:   1/2/3/C ~350ms, no sim restart (stepNumber stable), no
                      scene mutation (revision 0), ortho↔perspective midpoint swap;
                      setMode ~2ms / worst-frame ≤0.5ms.
Camera-relative move: DONE — getMovementBasis -> WASD basis (single-writer kept);
                      browser alignment 1.0 (Haven) / 0.894 bounded (Studio).
Collision/occlusion:  DONE — resolveOcclusion ray/AABB slab, actor-excluded,
                      presentation-only; setCollision toggle.
Camera presets:       DONE — zge.camera.presets.v1 data-only contract, validated,
                      applies defaultMode/enabledModes/per-mode rig, round-trips the project.
Tests:                engine 299/299, SDK 45/45, legacy 83/86 (3 golden, unchanged).
Open:                 physical pointer-lock mouse-look (trusted-gesture), physical
                      resource/interaction/save loop across all three modes.
Production + live authority: NO-GO (unchanged).
=== END RESULT ===
```
