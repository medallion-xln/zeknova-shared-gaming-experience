# ZEK-18B Reproducibility Manifest

## Result

`STATUS=PARTIAL`. The live QA-only materializer is implemented and Mission 1 independently matched twice, but its renderer structure was not reproducible. The required canonical `zek18b-matched-baseline.json` was deliberately not created.

## Safety boundary

- Owner: `PerformanceFixtureMaterializer`.
- Installation requires both localhost and the explicit `performanceFixture` query parameter.
- The canonical `save()` method is replaced by an isolated no-op for the fixture lifetime and restored during destruction.
- Autosave, hazard timers, multiplayer reconciliation, background spawn entry points, projectile entry points, and building insertion are suspended or locked during capture.
- Fixture teardown restores player/camera poses, residents, enemies, buildings, projectiles, save ownership, and multiplayer operation.
- Generated compatibility/model bundles were not edited.

## Production representation

- Residents reuse production world residents and their production HQ models.
- Enemies use the production `spawnEnemy` path and are then assigned deterministic transforms.
- Buildings use the production building manager `addRecord` path.
- Bosses use the production boss-manager encounter path.
- Projectile pressure uses the production enemy projectile pool/path and records deterministic owners.
- Population enforcement removes direct-array commissioning spawns which bypass the standard spawn method.

## Live audit

The initial Mission 1 pair was rejected because direct commissioning appended nine enemies. After adding per-frame population enforcement, two fresh pages produced:

- exact population parity: 8 residents, 4 enemies, 0 bosses, 0 projectiles, 1 building;
- identical materialized state hash: `5401e477ec4023587e1c719dc6345718f1db4757a94fd1f5c35283ee9b56a054`;
- streaming settled: 2/2;
- late-streaming contamination: 0/2;
- material identities and shadow casters: exact;
- meshes: 1415 vs 1424;
- geometries: 758 vs 687;
- textures: 123 vs 117;
- triangles: 7,160,189 vs 7,817,034;
- draw calls: 10,124 vs 10,641.

Because this is material structural variance, not timing noise, `STRUCTURAL_REPRODUCIBILITY=FAIL`. Scenes 2–6 were not promoted to canonical capture after the first mandatory scene failed the pass gate.

## Tests

`test:zek18b` certifies recipe mapping, exact populations, transforms, save isolation, cleanup, and QA gating without hardware timing assertions. ZEK-18 settling tests now require 120 stable observable frames.

## Next corrective scope

Trace the remaining resident/environment asset-residency variance and define a positive "all requested model families registered" barrier. Renderer memory stability alone is insufficient when model requests begin after a quiet gap. Once Scene 1 is structurally exact, repeat all twelve captures and only then create the canonical matched baseline.
