# ZGE-00 · System Extraction Matrix

Every subsystem in the repository, classified into the five ZGE categories, with its destination in ZekNova Engine 1.0 (package names from `ENGINE_1_ARCHITECTURE.md`). "State" = what exists today (not what is planned). "Work" = what has to happen before it lands in its destination.

Categories: **A** reusable engine core · **B** optional engine module · **C** ZekNova-specific content · **D** compatibility/legacy · **E** missing engine capability.

---

## A. Reusable engine core

| Subsystem | Today (files) | State | Destination | Work |
|---|---|---|---|---|
| Fixed-step physics world | `src/game/physics/PhysicsWorld.js`, `PhysicsBody.js`, `CollisionWorld.js`, `Broadphase.js`, `Narrowphase.js`, `ConstraintSolver.js`, `ProjectilePhysics.js`, `CharacterController.js` | Clean, dependency-free, deterministic ordering, tested (`physics-world.test.mjs`) | `@zge/physics` (reference backend) | Promote from shadow to authority; add AABB/terrain-heightfield shapes; expose `PhysicsBackend` interface so Rapier can replace it |
| Spatial hash | `src/world/Collision.js` `SpatialHash`; bundle 10 m / 18 m hashes; `AdaptiveSpatialIndex` | Three implementations | `@zge/core/spatial` | Keep one (generic 2-D/3-D cell hash with typed keys) |
| Height-grid terrain sampler | `src/world/Terrain.js` (`buildHeightGrid`, `sampleHeightGrid`), `rust/zeknova-core` (same math in WASM) | Pure functions | `@zge/terrain` (core sampler) | Chunk/tile abstraction; keep WASM as optional accelerator behind the same interface |
| Scheduler / tiered update | `AdaptiveSimulationDirector` (T0–T4 intervals, frame budget table), `adaptive-runtime-worker.js` | Recommendation-only today | `@zge/core/scheduler` | Make the tier the *actual* system schedule, not advice; keep budget table |
| Performance capture & fixtures | `RenderPerformanceDirector`, `PerformanceFixtures`, `PerformanceFixtureController`, `PerformanceFixtureMaterializer`, `RuntimeGraphicsContext` | Working; hidden `<output>` reporting | `@zge/devtools/profiler` + `@zge/testing/fixtures` | Replace DOM text with a metrics API (`engine.metrics.snapshot()`), keep frozen-fixture concept |
| Event bus conventions | `zeknova:gameplay-ready`, `zeknova:startup-stage`, `zeknova:visual-refresh`, 61 globals | Ad-hoc `CustomEvent`s on `window` | `@zge/core/events` | Typed event bus owned by `Engine`; globals removed |
| Input intent model | bundle `player.setControl(name, bool)` + `controls{forward,backward,left,right,sprint}` | Works (verified) | `@zge/input` | Action map + device adapters; same intent shape |
| Save envelope & merge-by-id | `api/save.php` merge rules, schema version list, `GameReset.js` layered reset model | Works except keepalive defect | `@zge/persistence` | Versioned envelope, migration registry, transport-agnostic store |
| Recovery state machine | `src/multiplayer/MultiplayerClient.js` (backoff, session-expired, resume) | Tested but unused by game | `@zge/net/transport` | Wire it to the real client |
| Startup diagnostics & stages | `createStartupCover`, `ZekNovaStartupDiagnostics` | Works | `@zge/core/lifecycle` | Lifecycle phases become engine API (`boot/load/ready/run/dispose`) |
| Authority declarations | 18 frozen `AUTHORITY` objects (R0 tiers, `canDispatch:false` …) | Convention | `@zge/core/authority` | One schema, one registry; enforced at the command bus |

## B. Optional engine modules

| Subsystem | Today | State | Destination | Work |
|---|---|---|---|---|
| Rendering adapter (Three.js WebGPU) | bundle renderer setup, LOD manifest, quality tiers, `RenderModelRegistry`, shadow budget | Works; renderer owned by `Game.initialize` | `@zge/render-three` | Renderer created by engine, scene mirrors sim via components; one Three instance |
| Asset pipeline | `model-runtime-c96327ba.js` loaders/queue, `model-lod-manifest.js`, `scripts/build-model-lods.mjs`, `optimize-static-glb.mjs`, `build-ktx2-loader.mjs` | Works; 7 instances; no cache | `@zge/assets` | Single loader registry, ref-counted cache, LOD selection, cancellation, timeouts as policy not patch |
| Construction / utilities | bundle `Buildings` (place, validity, utility graph, bridges, boats) + `src/game/Buildings.js` table | Works (verified) | `@zge/gameplay-construction` | Extract placement validator + utility graph as components; cost table becomes game data |
| Combat framework | bundle weapons/projectiles/damage; `CombatResult` schema; feedback/reaction/audio directors; `BossSystem` config model; `BossEncounterDirector` FSM | Works (verified) | `@zge/gameplay-combat` | Damage pipeline as system; results as events; boss as data-driven encounter FSM |
| Mission/objective DSL | `Missions.js` objective kinds + `objectiveComplete`, `CampaignPlan.js` ladder | Works, tested | `@zge/gameplay-missions` | Generic objective evaluator; ZekNova catalog moves to C |
| Procedural terrain & placement | bundle `PR` generation, `environment-runtime.js`, WorldClaw (`TerrainGenerator`, `SemanticPlacement`, `WorldSpec`, `MissionPlacementValidator`, `WorldCritic`, `WorldRepairDirector`, `WorldStreaming`, `PerformanceBudget`) | Bundle gen works; WorldClaw works offline, no live authority | `@zge/world-gen` | Make WorldClaw spec the authoring format the live world consumes |
| Multiplayer (polled room) | bundle client + `api/multiplayer.php` | Works for small teams | `@zge/net-room` (transport plugin) | Transport interface; room merge rules as pure functions |
| AI integration layer | `IdentityIntegration`, `PerceptionEventIntegration`, `FactionKnowledgeIntegration`, `FactionObservationIntegration`, `ObservationLegalityIntegration`, `PrimeShadowIntegration`, `SentinelPrimeExecutor`, `StrategicAI`/MCTS worker, `azl/*` contracts | Observe-only, heavily tested | `@zge/ai` (+ `@zge/ai-sentinel` adapter) | Perception/knowledge/legality become engine components; Sentinel stays an adapter |
| Audio | `MusicDirector`, `CombatAudioDirector` | Works | `@zge/audio` | WebAudio graph owned by engine; spatialization |
| Visual themes (Picasso) | `VisualThemeManager`, `PicassoRuntimeStyleCompiler`, theme CSS | Works, visual-only | `@zge/render-three/themes` | Material/post override profiles |
| Onboarding, pause, mission clarity UI | `FirstFifteenDirector`, `PauseMenuDirector`, `MissionClarityDirector`, `HudDirector` | Works, DOM-coupled | `@zge/ui-dom` | Rebuild against engine state, not bundle DOM ids |

## C. ZekNova-specific (stays in the game package)

| Content | Files |
|---|---|
| Biomes, enemy roster, building catalog, collision radii, rank progression, mech assist, residents tuning | `src/world/Biomes.js`, `src/game/Enemies.js`, `Buildings.js`, `src/world/Collision.js` (tables), `Player.js`, `MechAssist.js`, `Residents.js`, `OreRegeneration.js` |
| Campaign: 12 missions, 12 bosses, phases/patterns/profiles, finale, officer ranks, commissioning encounters | `CampaignPlan.js`, `Missions.js`, `BossSystem.js`, `BossCombat.js`, `CampaignFinale.js`, `OfficerRank.js`, `GameplayStates.js` |
| ZekNovan diplomacy, aid projects, faction rules, Forest defensive actions/commands/scenarios | bundle diplomacy, `ZEKNOVAN_AID_TYPES`, `ForestDefensive*`, `ForestObjectiveScenarios`, `azl/zeknova-*-contract-*.js` |
| World bible, desert civilisation generator, authored village kits | `src/worldclaw/ZekNovaWorldBible.js`, `DesertCivilization.js`, `assets/models/environment/**` |
| Login shell, Medallion auth, team enrolment, PHP backend | `src/ui/LoginPage.js`, `AuthGate.js`, `api/*.php` |
| Music, HUD copy, theme CSS, cockpit art | `assets/audio/*`, `assets/*.css`, `assets/zeknova-cockpit.webp` |
| QA states and Picasso combat certification data | `GameplayStates.js`, `PicassoCombatCertification.js`, `PicassoCombatLanguage.js` |

## D. Compatibility and legacy (retire on a schedule)

| Item | Why it is legacy | Retire when |
|---|---|---|
| `assets/index-02987539.js` + 195 prototype patches | Only copy of core game; unbuildable | ZGE-06 (after every system has a readable owner behind a contract test) |
| `src/runtime-reconstructed/**`, `artifacts/runtime-reconstruction/`, `scripts/build-reconstructed-runtime.mjs`, golden-hash tests | Byte-level certification of a file that must be replaced | Replace with behavioural certification in ZGE-01; delete in ZGE-06 |
| `src/game/Game.js` fetch monkey-patch of `/api/session.php` | Session injection hack | ZGE-01 (bridge gets an explicit `user` argument it already supports) |
| `window.ZekNovaSource` + duplicated constants + `check-source.mjs` regex parity | Bundle ignores them | ZGE-03 when data tables are the sole owner |
| `?v=` cache-busted multi-imports of `model-runtime-c96327ba.js`, `assets/model-runtime.js` | 7 instances, no cache | ZGE-02 |
| `assets/vendor/three.*` + inlined Three | Two Three instances | ZGE-02 (single `three` dependency) |
| `src/multiplayer/MultiplayerClient.js` (unused) | Tested but not wired | ZGE-04 wires it or deletes it |
| `PhysicsRuntimeBridge` method wrapping (`updateProjectiles`, `updateEnemyProjectiles`, `pool.update`) | Shadow authority | ZGE-02 (physics becomes authoritative) |
| `ForestDefensiveCommandIntegration` v1 (v2 installed) | Superseded | ZGE-05 |
| `Stage2FRuntimeCollectorBinding` static import + hard-coded loopback endpoint/token | Dev-only collector in prod path | ZGE-01 (make opt-in, config-driven) |
| 4 phantom gameplay bridges in `main.js` | 404s every load | ZGE-01 |
| `docs/governance/evidence/w0p-source-inventory/assets/index-02987539.js`, `Archive.zip`, `stable-fast-3d/` submodule, `sentinel-grid/live-parity/*.json` ×5,307 | Repository weight, not runtime | Move to an evidence repo / LFS |
| Dual quality controllers (bundle tiers + Adaptive tiers) | Two owners | ZGE-02 |
| `rust/zeknova-core` WASM (disabled) | Optional accelerator with no measured win | Keep behind `TerrainSampler` interface; decide in ZGE-02 benchmark |

## E. Missing engine capabilities (must be created)

| Capability | Why needed | First milestone |
|---|---|---|
| Engine kernel: `Engine`, `World`, lifecycle phases, typed event bus, single clock with fixed-step + interpolation | Nothing today can run an empty world | ZGE-01 |
| Entity/component/system model (or disciplined OO with component registries) | 77 raw fields + prototype patching is the current API | ZGE-01 |
| Simulation ⇄ render separation (sim state has no Three objects; render mirrors) | Bundle stores sim state in `Object3D.userData` | ZGE-02 |
| Asset manager: registry, cache, ref-count, LOD, cancellation, budgets | Seven loaders, no cache | ZGE-02 |
| Project manifest (`zge.project.json`): systems, plugins, scenes, assets, auth/network config | No way to describe a game | ZGE-01 |
| Scene & prefab serialization (JSON, versioned, diffable) | Live world not serializable; WorldClaw spec is close | ZGE-03/07 |
| Plugin API (`definePlugin({ systems, components, resources, commands })`) | Directors are ad-hoc | ZGE-01 (seed) → ZGE-05 (stable) |
| Command bus with authority tiers | AI/Sentinel R0→R1 needs one gate | ZGE-05 |
| Deterministic replay (seeded RNG, input log, fixed step) | Only MCTS worker is seeded | ZGE-02 |
| Network transport interface + server authority option | Polling PHP only | ZGE-04 |
| Headless mode (Node) for tests and agents | All engine behaviour needs a browser today | ZGE-01 |
| Metrics/profiler API + flame regions | Hidden DOM text | ZGE-01 |
| Editor data model (inspectable components, undo, gizmos) | None | ZGE-07 |
| Stable SDK + versioned public API + docs | None | ZGE-07/09 |
