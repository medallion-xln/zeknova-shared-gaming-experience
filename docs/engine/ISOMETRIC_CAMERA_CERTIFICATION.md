# Isometric Camera Certification

## Rig

`resolveRig('isometric', …)` → `projection: 'orthographic'`, yaw snapped to 45° increments, downward pitch clamped 35–50°, distance 4–120 m, `orthoScale ≈ distance × 0.8`.

## Verified

- **Orthographic projection** is applied by `viewport.directCamera` (asserted `viewport.cameraState().projection === 'orthographic'` in Beacon Haven and Studio).
- **Elevation/pitch**: the eye sits above the target (`position[1] > target[1]`) with a non-zero horizontal standoff (`hypot(dx,dz) > 0`) — the signature axonometric vantage.
- **Stability**: `update()` returns a position equal to the target plus a fixed spherical offset; no jitter (pure function of the target transform + orientation state).
- **Manual zoom** is supported via `setLook(…, distance)`, clamped to `[4, 120]`.

## Boundary

No raycast occlusion (later Phase 9) — the isometric view does not currently hide geometry that would occlude the play area. This is a known open item, not a defect in rig math.

## Evidence

`docs/engine/evidence/zge15/studio-isometric.png` — the orbital-outpost player captured from the elevated orthographic view (the largest frame, 400 KB, consistent with a wide tactical field).
