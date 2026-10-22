# ZGE-03 — Reusable Gameplay Systems & Asset Ownership · Implementation Prompt

Preconditions: ZGE-02 complete (`ZGE_02_IMPLEMENTATION_REPORT.md`). Owner decisions still open: golden-hash gate, `.env.production` rotation, collector token. Bundles stay untouched unless a change is isolated, justified and regression-tested.

## Objectives
1. **Asset ownership** — route `assets/model-runtime-c96327ba.js` and `assets/environment-runtime.js` through `@zge/assets` via the existing import map (they are readable ES modules): one `GLTFLoader`/`KTX2Loader` pair, one worker pool, a parsed-GLTF cache keyed by URL+LOD that clones scenes per instance (SkeletonUtils) while sharing geometries, and material-ownership rules so per-instance tints do not leak. Close the Three.js duplication by importing the vendor Three only once from the engine and documenting what in the bundle still inlines it.
2. **GLTF hang closure** — build a KTX2 worker-stress fixture (many concurrent transcodes, forced worker termination) under the loader watchdog; either reproduce and fix the non-settling transcode (timeout at the transcoder promise, worker respawn) or document the negative result with the fixture.
3. **Gameplay systems behind flags** — `@zge/gameplay-construction` (placement validator + utility graph), `@zge/gameplay-combat` (damage pipeline, projectiles, boss encounter FSM from `BossSystem`/`BossEncounterDirector`), `@zge/gameplay-missions` (objective DSL evaluator) as kernel systems with contract tests against the bundle's observable outputs; `features.{construction,combat,missions} = "engine"|"bundle"` in the manifest.
4. **Persistence v5** — move XP/officer progression from the `zge` extension into a first-class `player` field with a migration (v4 → v5) readable by the existing PHP (versions list needs an owner-approved one-line change or stays at v4 with the extension).
5. **UI director teardown** — owned-listener refactors for `pause-menu`, `mission-clarity`, `hud-director`, `team-chat`, `worldclaw` so the in-page restartable set reaches every post-runtime director; leak-probe Δ 0 required.

## Acceptance
- `Multiple instances of Three.js` and `Multiple active KTX2 loaders` warnings both gone; one worker pool; each GLB parsed once per session (measure).
- Stress fixture result recorded; watchdog shows 0 stalls in normal play.
- Gameplay flags default to `engine` for at least construction and missions with contract tests green; combat may remain `bundle` if feel regresses (fixture replays within ±10 % of ZGE-02 frame baselines: 118–119 fps, p99 ≤ 10 ms native).
- Engine suite and legacy suite green except owner-governed hash tests; browser smoke (launch, move via keyboard, combat, build, save/ack, restore, restart cycles, safe mode, neural mock, fallback) green.
- ZekNova playable at every commit; no bundle edits.
