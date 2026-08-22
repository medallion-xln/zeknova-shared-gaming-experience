# ZEK-18 Reproducibility Manifest

## Result

`STATUS=PARTIAL`. The reconstructible ownership boundary, six canonical fixture recipes, observable streaming-settled predicate, bounded capture reset, model creation registry, sharing/lifecycle policy, comparison tool, and structural certification are implemented. Matched live staging remains incomplete (`0/6`), so this milestone deliberately does not claim performance certification.

## Writer gate and baseline

- HEAD: `9015537fb0e2b6cc3e2d24901e78b40b5de191e0`
- Worktree dirty before ZEK-18: yes; unrelated work preserved.
- Intended owners were SHA-256 fingerprinted twice across eight seconds; no unexpected change.
- Pre-change `npm test`: PASS. This includes gameplay release, campaign, reconstruction, persistence/session, network recovery, ZEK-16, and ZEK-17.

## Protected runtime

- Compatibility SHA-256: `7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab`
- Model SHA-256: `e6af33cdf1f56c098d16156ce34ff435c7fa7a5490ed640a63c6e5e43ca726d0`
- Generated runtime hand-edited: false.
- Reconstruction parity after implementation: exact bytes.

## Ownership

- Canonical renderer: compatibility runtime.
- Three owners: 2 (embedded compatibility runtime; vendored `three.core.min.js`).
- Cross-runtime object sharing: unsafe for Object3D, Mesh, geometry, material, texture, loaders, renderer, and KTX2 identity semantics.
- Actor loader: model-runtime service, vendored Three owner.
- Environment loader: environment-runtime service, vendored Three owner.
- KTX2 loaders: 2; actor and environment lifecycle owners remain separate. Canonicalizing them is unsafe until their reconstruction boundary exports one shared service.
- Safe bridge: renderer information plus existing scene/camera references, registry, and capture service. It does not export or counterfeit a shared Three namespace.

## Creation, sharing, and lifecycle

- Existing residents, enemies/bosses, buildings, and environment roots are registered at install.
- Future enemy, boss, and building creation is wrapped at the production creation methods.
- Stable family IDs are emitted through `zeknova:model-created`.
- Static environment/buildings are geometry-sharing candidates only. Skinned residents/enemies/bosses retain per-instance rigs and animation mixers.
- Textures are read-only sharing candidates. Per-entity material changes require clone-before-mutation.
- Compatibility objects remain compatibility-disposed; loaded model instances own their `dispose()` lifecycle. The registry never disposes shared geometry/material/texture implicitly.

## Fixtures and settling

`PerformanceFixtures.js` defines six canonical production-state recipes and hashes every field through canonical JSON. `PerformanceFixtureController` settles only after environment/font readiness, no actor/boss model work, and 30 stable observations of resource-entry and renderer-memory signals. The maximum frame bound is a failure guard, not the settled condition.

The live browser smoke verified `data-zeknova-graphics-ownership=explicit-v1` and emitted bounded render telemetry. It was not a fixture match: the live world held 54 residents and 10 enemies, while Scene 1 requires 8 and 4. The evidence file records this as unmatched.

## Commands

```bash
npm run test:zek18
npm run runtime:reconstruct:test
node scripts/compare-performance-baseline.mjs baseline.json candidate.json
```

## Remaining P0 / ZEK-19 recommendation

Build a reconstructible, save-isolated production fixture materializer that owns deterministic actor/projectile creation and cleanup, then capture all six hashes twice and require `matched=6`. Only after that gate should static geometry/material consolidation begin.
