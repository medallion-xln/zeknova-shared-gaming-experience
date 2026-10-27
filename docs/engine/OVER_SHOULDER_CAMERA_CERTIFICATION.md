# Over-the-Shoulder Camera Certification

## Rig

`resolveRig('over-shoulder', …)` → `projection: 'perspective'`, `fov: 58`, distance 1.2–4 m, a ±0.65 m lateral shoulder offset plus +0.7 m elevation, camera yaw biased behind the target's facing (`rotation[1]`) with mouse-look yaw/pitch deltas (pitch clamped 5–40°).

## Verified

- **Projection/fov**: `viewport.cameraState()` reports `perspective` and the pose carries `fov: 58`.
- **Shoulder offset + elevation**: the eye lands beside and above the target (in Studio, a ~[−3.35, 2.09, −2.00] eye for a target at [−4, 0.5, 0] — beside and behind, not centered).
- **Facing awareness**: the rig reads the target transform's `rotation[1]`, so the shoulder sits to one side of the facing vector rather than a fixed world side.
- **Mouse-look delta plumbing**: `setLook(yaw, pitch)` alters the rig's orientation without mutating the scene.

## Boundary

- Physical pointer-lock mouse-look is wired but not browser-certified (headless Playwright cannot produce a trusted pointer-lock gesture) — marked open, not claimed.
- The target's facing is read from `transform.rotation[1]`; the existing movement rules do not yet rotate the character to face its velocity (Phase 7 — camera-relative movement + facing), so the shoulder reference frame is currently the authored rotation, which is `0` in the example worlds.

## Evidence

`docs/engine/evidence/zge15/studio-over-shoulder.png` (150 KB) — close cinematic framing of the same player position, distinct from the wide isometric and chase framings.
