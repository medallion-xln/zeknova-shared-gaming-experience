# glTF / GLB asset pipeline — ZGE-13

**Bounded advance from single-mesh triangles (ZGE-12) to hierarchical, multi-mesh flat-material GLB. General glTF is still not claimed.**

## Scope carried from ZGE-12

`inspectGLB` / `engine.importModel` already handled one GLB2 node/mesh, 1–16 triangles, tightly packed `POSITION`/`NORMAL`, uint16/uint32 indices, opaque base color + double-sided state, magic/version/length/chunk-alignment validation, bounds, buffer ownership, finite coordinates, and explicit rejection of external buffers, images/textures, extensions/compression, rigs, animation, morph targets, cameras, and `.gltf` text.

## ZGE-13 addition: `hierarchy` opt-in

`inspectGLB(bytes, { hierarchy: true })` preserves the ZGE-12 strict API by default (the old `inspectGLB(bytes)` still rejects the house GLB) and adds, only when opted in:

- **Multiple meshes** — a scene with several `nodes`, each referencing a primitive.
- **Hierarchical transforms** — parent→child node transforms are baked before import (`scale`, `translation`).
- **Multiple static materials** — flat `pbrMetallicRoughness.baseColorFactor` (double-sided), without texture sampling.
- **Correct bounds + orientation/scale** — parts carry normalized positions; the `shelter`/`relay` instances inherit a common origin and scale.

Images, textures, normals tampering, transparency/alpha-blend, KTX2/compressed textures, skeletal rigs, morph targets, and animation remain **separate, unclaimed** categories. Support is only claimed for the validated subset actually parsed — not for whatever Three.js could theoretically load.

## Data model and ownership

The single `haven.glb` (3 parts, 108 vertices, 36 triangles) imports once as asset `haven-house`, then is instantiated as multiple detached entities (`shelter-0..2`, `relay-house` prefab, `entity-1`). Ownership rules are unchanged from ZGE-12 and reused:

- Shared parsed asset caching via `AssetService` with verified load + SHA-256 coalescing.
- Independent per-instance transforms.
- Material/geometry lifetime owned by the presentation backend, released on registry replacement, project close, and viewport disposal.
- Bounded GPU resource disposal and reference tracking; no new Three.js namespace copies (the SDK shares the single `three/webgpu` instance).

## Tests

- `packages/sdk/test/zge13.test.mjs` — "hierarchical multi-mesh GLB opt-in preserves old strict API, bakes transforms and bounds": asserts `inspectGLB(bytes)` throws for the un-opted-in (strict) case, `inspectGLB(bytes,{hierarchy:true}).parts.length===3`, `vertices===108`, and a baked part position beyond the origin bounds.
- `scripts/zge13-model-performance.mjs` — 30 trials of parse/import/acquire-8-leases on the real `haven.glb`, recording `parts`, `vertices`, `triangles`, and `AssetService.status()`. Measured parse ~sub-ms, import low-single-digit-ms, acquire 8 leases ~0.5 ms.

## Resource ownership / failure / disposal

`scripts/zge13-editor-retention.mjs` alternates 100-entity model scenes and empty worlds 24× per renderer. `liveOldEngines===0` at every checkpoint, asset leases/entries return to 0 on empty scene, and renderer geometries stay constant — bounded disposal without accidental Three.js duplication.

Negative/failure cases (missing dependencies, unsupported extension, invalid geometry, oversized model) are exercised through the existing parser-rejection paths and retained from ZGE-12; each rejects atomically and leaves the project unchanged. Duplicate instance `asset` refs share one load; repeated project switching does not accumulate leases.

## Licensing / provenance

The `haven.glb` is self-authored and declared `CC0-1.0`, `redistribution:'permitted'`, `source:'Self-authored ZGE13 geometry generator'`. The import path always records `license` and `sourceSha256`; **imported third-party assets are never auto-classified as redistributable** — they default to `redistribution:'unknown'`. Source hash records byte custody, not license transfer.

## Charts

`evidence/zge13/charts/model-parse-load.png` (30-trial mean ± 1 stddev), `fps-vs-playable-complexity.png` and `heap-vs-playable-complexity.png` (4/25/100 houses).
