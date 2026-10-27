# Third-Person Camera Certification

## Rig

`resolveRig('third-person', …)` → `projection: 'perspective'`, `fov: 50`, distance 2–25 m, centered **behind** the target (offset = spherical(yaw, pitch, distance) from the target), pitch 5–60°, orbiting via pointer-look yaw.

## Verified

- **Projection/fov**: `cameraState()` reports `perspective`; pose `fov: 50`.
- **Centered-behind / chasing**: the eye is directly along the offset vector from the target (in Studio, a [−4, 2.89, 6.58] eye for target [−4, 0.5, 0] — straight up the +Z axis behind the default-facing target, 7 m back, elevated).
- **Orbit**: `setLook(yaw)` rotates the camera around the target without changing the target or scene.
- **Distance range**: `setLook(…, distance)` clamped to `[2, 25]`.

## Boundary

No collision-aware placement (Phase 9) — the chase camera does not pull in to avoid tunneling through walls. Known open item.

## Evidence

`docs/engine/evidence/zge15/studio-third-person.png` (105 KB) — the chase framing of the same player location.
