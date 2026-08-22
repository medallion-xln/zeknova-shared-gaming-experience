# Picasso Visual Diffuser Expert

Picasso is Sentinel Grid's R0 appearance-only expert. It converts a requested visual style into a deterministic, immutable runtime profile; `VisualThemeManager` applies that profile to renderer exposure/tone mapping/fog, render materials, grading metadata, and VFX metadata. It has no gameplay dispatch surface.

## Runtime architecture

```text
visual request
  -> SentinelExpertRouter (visual capability allowlist)
  -> Picasso (cached style profile / optional async style-target adapter)
  -> VisualThemeManager
  -> Three.js renderer (WebGPU when present, WebGL2 fallback)
```

Diffusion is an asset-preparation operation. `Picasso.prepareTheme()` may call an optional adapter once per theme/context cache key. A missing, rejected, or over-budget adapter produces the deterministic shader fallback. Neither Picasso nor the manager performs diffusion inference in a render loop.

## Authority contract

All `can*` fields in `PICASSO_AUTHORITY` are permanently `false` at R0, including gameplay dispatch, world mutation, missions, physics, collision, combat outcomes, saves, economy, and multiplayer synchronization. `SentinelExpertRouter` only accepts:

- `visual_style`
- `diffusion`
- `material_generation`
- `environment_art`
- `vfx_design`
- `gaussian_splat`

Combat strategy, mission progression, NPC control, world mutation, physics, collision, economy, saves, and multiplayer synchronization return no route. A future authority increase requires a separate gate and must not modify this R0 expert in place.

## Themes and vertical slice

The selector exposes ZekNova Default, Anime, Cartoon preview, Cinematic / Ultra Realistic, Ultra Realistic preview, and Alien Dream preview. The validated first slice is ZekNova Default, Anime, and Cinematic / Ultra Realistic.

Scene traversal identifies and styles player meshes, settlement meshes, the Drowned Tremor arena, Spore Cantor projectiles, and Arc Gunner electrical effects. Dynamic content can request a non-frame-based refresh by dispatching `zeknova:visual-refresh`. Theme changes emit `zeknova:visual-theme-changed` with immutable material, VFX, and environment profiles for renderer subsystems.

## Gaussian splats

`VisualThemeManager.splatLayer` is a dedicated Three.js `Group`. Every layer and child is marked `zkVisualOnly`, `sceneryOnly`, `authoritativeGeometry:false`, and `collisionEnabled:false`. Splats may depict distant scenery, structures, vegetation, atmosphere, or boss-arena dressing. Canonical Three.js meshes remain the only collision/world geometry.

## Performance and compatibility

- Profiles and prepared style targets are cached by deterministic theme/context keys.
- Existing materials are updated only on theme selection or explicit visual refresh.
- No per-frame diffusion or theme traversal is installed.
- Particle caps are 90 (Anime), 120 (Default), and 160 (Cinematic).
- Cinematic splats are capped at two layers.
- WebGPU is detected when present and WebGL2 remains the fallback.
- `measureFrameBudget()` measures browser FPS, JS heap when exposed, and renderer geometry/texture counts.

Observed automated stress runs traversing 250 materials for 300 switches averaged 0.148–0.162 ms per switch on the implementation machine. Heap deltas ranged from -89 KB to +3.31 MB because garbage collection is nondeterministic; the automated smoke budget rejects average switches above 5 ms or heap growth above 32 MB. Use `ZekNovaVisualThemeManager.measureFrameBudget({ durationMs: 3000 })` in an authenticated browser session for device-specific FPS and renderer memory.

Run `npm run test:picasso` and `npm test` for verification.

The next visual milestone is to tune Cartoon and Alien Dream against the same five targets, add approved reusable outline/iridescence shader passes, and validate representative splat assets at low/medium/high LOD before removing their preview labels.
