# Camera Director Architecture

## Purpose

One reusable, presentation-only camera controller that decouples the *choice* of camera pose from the *rendering* of it. The director lives in the source-owned SDK (`packages/sdk/src/camera.js`); a presentation adapter (`packages/sdk/src/three.js`) applies its output to a single active Three.js camera.

## Hard invariant

The director **reads** a followed entity's transform and **publishes** a pose. It never mutates authoritative state — player coordinates, mission state, inventory, world revision, persistent resources, network authority, or entity ownership. A dedicated test (`packages/sdk/test/zge15.test.mjs`) asserts the scene serializes byte-for-byte identically before and after `follow`/`setLook`/`update`.

## Components

- **`resolveRig(mode, targetPos, look, targetTransform)`** — a pure function: in → pose out. No closure state, no renderer reference. Unit-testable in isolation.
- **`resolveOcclusion(target, cameraPos, entities, targetId, clearance)`** — a pure, read-only ray/AABB slab test that slides the camera in front of a blocker; mutates nothing.
- **`validateCameraPreset(preset)` / `CAMERA_PRESET_SCHEMA`** — a data-only, versioned camera-settings contract (`zge.camera.presets.v1`).
- **`createCameraDirector(engine, {preset, collision, collisionClearance})`** — the stateful controller. Registers as a `render`-phase system (`engine.registerSystem({id:'camera:director',phase:'render',…})`) so it computes a pose once per frame after simulation steps. Holds mode, target id, base/pointer look offsets, an in-flight transition, per-mode rig overrides, and a collision toggle.
- **`viewport.directCamera(pose)`** — the adapter sink. Applies `position`/`target`/`projection`/`fov`/`orthoScale` to the active camera; swaps orthographic↔perspective; disables `OrbitControls` while directed so the editor gizmo never fights the rig.

## Movement basis, occlusion, and presets (Phases 7/9/12)

- `getMovementBasis()` / `bindMovementBasis(holder)` output a camera-relative `{forward:[fx,fz], right:[-fz,fx]}` ground basis so WASD moves into/away-from screen; the single movement system stays the single writer (the camera only supplies the basis).
- `resolveOcclusion` is applied post-`resolveRig` every frame (toggle `setCollision`), sliding past colliders with a `clearance` standoff, actor excluded — still presentation-only.
- `applyPreset`/the `preset` constructor option apply a validated `zge.camera.presets.v1` contract (default mode, enabled modes, per-mode distance/pitch/fov/sensitivity/pitch limits/transition duration); presets live on the project's `camera` field and round-trip unchanged.

## Pose contract

```js
{
  projection: 'perspective' | 'orthographic',
  position: [x, y, z],        // camera eye
  target:   [x, y, z],        // look-at point
  fov: number | undefined,    // perspective only
  distance: number,
  orthoScale: number | undefined, // orthographic half-height
}
```

## Lifecycle

```
Play:  createCameraDirector(simEngine) → follow(controlledEntity) → frame loop:
       director.update() → viewport.directCamera(pose) → viewport.render()
Stop:  director.dispose() (removes the registered system, clears listeners)
```

The director is disposed on Return-to-Editor and re-created on each Play. No stale render loops or duplicate cameras (the director owns no `THREE.Camera`; it only describes one).

## Why a render-phase system

`engine.frame()` runs `input` systems, then the fixed clock tick (simulate/physics/post), then `render`-phase systems. Registering the director at `render` means its pose reflects the simulation state at that exact tick, and it never entangles with the deterministic fixed step (`step()` skips render systems, so tests stay deterministic).

## Extension points

New rigs are added as another branch in `resolveRig` plus a `DEFAULT_RIG` entry and a `MODES` string. Collision/occlusion (Phase 9) is a post-`resolveRig` clamp via `resolveOcclusion`; camera presets (Phase 12) layer per-mode rig overrides on the same branch, so the pure rig math stays deterministic.
