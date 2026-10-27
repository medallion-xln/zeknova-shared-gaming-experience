# Camera Collision and Transitions

## Transitions (implemented & verified)

`createCameraDirector.setMode()` seeds a `fromPose` (last rendered pose) and a `toPose` (new rig default), then `update()` interpolates over `transitionDuration` (default **0.35 s**, clampable 0–2 s) using ease-in-out:

- **position / target**: linear interpolation between `fromPose` and the live target pose.
- **fov / orthoScale**: linear interpolation when both endpoints are perspective/orthographic respectively.
- **projection**: swaps at the transition **midpoint** — the orthographic→perspective handoff is an explicit, monotonic cut at `u = 0.5` rather than a gradual blend (which Three.js can't do across projection types).

Verified: `packages/sdk/test/zge15.test.mjs` asserts that mid-transition (`u ≈ 0.1`) still reports the *from* projection, and post-transition resolves to the target projection. Rapid `1→2→3→1` switching in the browser left `stepNumber` unchanged and `revision 0` — no simulation restart, no world reload, no teleport, no blank frame, no duplicate cameras.

No camera snapping during rapid switching: each `setMode` re-seeds from the current `lastPose`, so consecutive switches chain smoothly instead of snapping back to a default.

## Camera collision / occlusion (Phase 9 — implemented & verified)

`resolveOcclusion(target, cameraPos, entities, targetId, clearance)` in `packages/sdk/src/camera.js` does a **ray-vs-AABB slab test** from the follow target toward the eye and returns a slid position:

- **Actor excluded** — the followed entity's collider never occludes its own camera.
- **Axis-aligned box colliders** — each candidate `position ± halfSize·scale` forms the box; the slab method finds the nearest entry `t` along the ray.
- **Clearance** — the camera rests `clearance` (default **0.35 m**) in front of the first blocker, so it never tunnels into geometry.
- **Presentation-only** — returns a replacement `position` and recomputes `distance`; it never mutates the scene, authoritative transforms, or collider data.

The director applies it every frame after `resolveRig` (toggle via `setCollision(bool)` / `collision` getter, threshold via the `collisionClearance` option). Occluded pose `position` is slid but `target`/`projection`/`fov`/`orthoScale` are preserved.

Verified in `packages/sdk/test/zge15.test.mjs`:

- A box at `[0,5,0]` (halfSize `[1,2,1]`) blocks a straight-up ray → camera slides to `y ≈ 2.65` (3 − 0.35 clearance), still below the box, on the ray.
- No colliders → no hit, position unchanged.
- The target's own collider → excluded, no hit.
- Director-level test asserts occlusion never mutates the authoritative scene (`e.world.serialize()` byte-for-byte unchanged) and `setCollision(false)` disables sliding.



## Mouse orientation after switching

Pointer-look deltas (`pointerYaw`/`pointerPitch`) are reset to zero on each `setMode`, so each mode starts from its own `DEFAULT_RIG` orientation rather than inheriting a stale yaw from the previous perspective. This is verified by the `setMode` reset of `pointerYaw = pointerPitch = 0`.
