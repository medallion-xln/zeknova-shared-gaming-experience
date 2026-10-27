# ZekNova Engine · Migration Roadmap (ZGE-00 → ZGE-09)

Governing rule: **ZekNova stays playable at every commit.** Each milestone replaces one domain behind an interface, guarded by a contract test and a feature flag in the project manifest; the bundle keeps running under a compatibility plugin until the last domain leaves it. No milestone performs an all-at-once rewrite.

Effort units: engineer-weeks (ew) for a team of 2–3 senior engineers who know this codebase. Assumptions: no original TypeScript sources recovered; Three.js r185 kept; PHP backend kept through ZGE-06; Sentinel kernel remains external.

Dependency chain: ZGE-00 → 01 → 02 → {03, 04} → 05 → 06 → 07 → 08 → 09 (03 and 04 may run in parallel after 02).

---

## ZGE-00 · Baseline & architecture certification — **this document set**
Completion: `docs/engine/*` written; certification evidence in `CERTIFICATION_RESULTS.md`; test baseline 83/86 recorded; blockers C1–C10 logged. Done except for the user-decided fixes below.
Immediate pre-ZGE-01 hygiene (≤1 ew, user approval needed because it touches the golden gate): commit or revert the bundle timeout patch and re-pin hashes; rotate keys in `.env.production`; make the Sentinel collector opt-in; delete the 4 phantom bridge imports.

## ZGE-01 · Engine kernel extraction
1. **Objective** — a `@zge/core` kernel (Engine, World, Clock, Scheduler, EventBus, registries, Plugin loader, Lifecycle guards, Metrics, RNG, Snapshot) that boots an empty world headless and in-browser, plus a `zeknova-compat` plugin that hosts the existing bundle under the kernel so ZekNova runs unchanged.
2. **Dependencies** — ZGE-00; decision on bundle hash gate.
3. **Reuse** — `PhysicsWorld` accumulator pattern (clock), `AdaptiveSimulationDirector` tier table (scheduler), `createStartupCover`/startup stages (lifecycle), `RenderPerformanceDirector` sampling (metrics), director `install/dispose` convention (plugins), `Game.js` bridge handling (compat).
4. **New** — kernel packages in TypeScript with esbuild; `ProjectManifest`; `kernel.guard()`; `engine.status`; headless runner; dev overlay (metrics/status/entity dump); CLI `zge run|test`.
5. **Extract** — `main.js` bootstrap → manifest-driven plugin list (the 24 try/catch installs become plugins); `Game.js` → compat plugin; `window.ZekNovaSource`/`globalThis.ZekNova*` → resources (kept as aliases behind a flag for one milestone).
6. **Interfaces** — `Engine`, `World`, `System`, `Plugin`, `Resource`, `Metrics`, `Snapshot` (see `ENGINE_1_ARCHITECTURE.md` §4).
7. **Risks** — director ordering is implicit today (10-deep Sentinel chain); compat plugin must drive the bundle's `animate` without changing frame pacing; 61 globals have unknown external readers (Sentinel collector reads `ZekNovaGame`).
8. **Tests** — kernel unit tests (clock determinism, scheduler tiers, guard timeouts, dispose ordering); contract test: "ZekNova under kernel" reaches `gameplay-ready` with same startup diagnostics, same 13 enemies / 336 trees, same save payload shape; restart test: `engine.dispose(); engine.boot()` leaves zero orphaned plugins (fixes C4).
9. **Done when** — `zge create empty && zge run` renders an empty lit scene at fixed 60 Hz; ZekNova boots through the kernel with Node test suite ≥ 83/86 and browser smoke (launch, move, save, restore) green; `engine.metrics.snapshot()` replaces hidden `<output>`s; zero `globalThis.ZekNova*` reads inside `@zge/*`.
10. **Effort** — 4–6 ew.

## ZGE-02 · Rendering, physics and asset pipeline
1. **Objective** — single Three.js instance behind `RenderBackend`; `@zge/assets` with cache/LOD/budgets; `@zge/physics` promoted to authority with `PhysicsBackend` interface; fixed-step simulation with interpolation; deterministic replay runner.
2. **Dependencies** — ZGE-01.
3. **Reuse** — `src/game/physics/*` (becomes authoritative), `model-runtime-c96327ba.js` loader logic (de-duplicated), `model-lod-manifest.js`, LOD build scripts, quality tiers, `PerformanceFixtures`.
4. **New** — `RenderBackend` + component mirroring (`Transform`, `MeshRef`, `Animator`, `Light`, `Camera`); `AssetManager`; `PhysicsBackend`; Rapier spike + benchmark; input journal; replay CLI.
5. **Extract** — renderer creation out of bundle `initialize` (compat plugin injects the kernel's renderer/canvas); seven `?v=` imports → one asset manager; `PhysicsRuntimeBridge` wrappers → authoritative systems for projectiles/knockback/character movement (bundle movement stays until ZGE-03 but reads physics results).
6. **Interfaces** — `RenderBackend`, `AssetManager`, `PhysicsBackend`, `InputJournal`, `Replay`.
7. **Risks** — the GLTF hang (C5) must be understood, not re-wrapped: instrument loader queue, KTX2 worker pool and `configureKtx2Loader` renderer dependency before de-duplicating; moving physics authority can change feel (knockback, projectile hits) — gate with fixture replays; WebGPU device-loss handling.
8. **Tests** — asset cache: each GLB fetched once per session (vs 11× today); no `Multiple instances of Three.js` warning; physics: 60 Hz determinism across render cadences (existing test) + replay equality over a recorded 60 s input log; perf fixtures: p95 within ±10 % of ZGE-00 baseline per scene; GLTF timeout path produces a `degraded` status, never a hang.
9. **Done when** — all above green in CI headless + browser; `?wasm` decision recorded by benchmark; C3 and C5 closed or root-caused with a tracked issue.
10. **Effort** — 6–8 ew.

## ZGE-03 · Reusable gameplay systems
1. **Objective** — construction, combat, missions, player controller and camera as generic `@zge/gameplay-*` systems driven by game data; ZekNova content (C-category) moves to `games/zeknova`.
2. **Dependencies** — ZGE-02 (components, physics authority).
3. **Reuse** — `Buildings.js` table + bundle placement/utility logic; `CombatResult` schema, feedback directors, `BossSystem`/`BossEncounterDirector`; `Missions.js` DSL + `CampaignPlan.js`; `Player.js` rank table; `MechAssist`, `OfficerRank`, `GameReset` layered reset.
4. **New** — `Construction`, `Damage`, `Projectile`, `Encounter`, `Objective`, `CharacterController` systems; scene/prefab serialization (JSON, versioned); data-table validation.
5. **Extract** — from bundle: `Buildings`, weapons/projectiles/damage, boss manager, mission tracking, player movement/camera, HUD data bindings. Each behind a feature flag (`gameplay.construction = "engine" | "bundle"`), with a contract test comparing observable outputs.
6. **Interfaces** — `ComponentSchema` (reflection), `Prefab`, `SceneFile`, objective/encounter DSL types.
7. **Risks** — bundle gameplay has hidden coupling (195 patches; `initialize` 18 layers): extraction must be behaviour-driven via QA states and fixture replays; save schema v5 must migrate v1–4; XP persistence (C6) decided here.
8. **Tests** — campaign feasibility suite (existing) runs against engine systems; QA states 1–12 missions + 12 bosses reach `BOSS_ACTIVE` and `DEFEATED` headless with scripted agents; construction contract: same cost deduction/utility status as bundle for all 17 types; save round-trip v4→v5→v4-compatible read.
9. **Done when** — all gameplay flags default to `engine`; bundle gameplay code paths unreferenced by ZekNova build; C6 closed.
10. **Effort** — 10–14 ew.

## ZGE-04 · World simulation and multiplayer infrastructure
1. **Objective** — `@zge/terrain` chunked world (height-grid tiles, biome map, streaming), `@zge/world-gen` from WorldClaw, `@zge/persistence` with explicit results and migrations, `@zge/net` transport interface with the PHP room plugin and the tested recovery state machine.
2. **Dependencies** — ZGE-02; can overlap ZGE-03.
3. **Reuse** — height sampler (JS/WASM), spatial hash, `environment-runtime.js` placement, WorldClaw pipeline, `api/save.php` merge rules, `MultiplayerClient.js`, `GameReset.js`.
4. **New** — chunk index + streaming budget; `Store`/`Transport` interfaces; HTTP store (non-keepalive, result-returning, retry) fixing C2; room-merge pure functions; presence/interp components; optional WebSocket transport spike.
5. **Extract** — terrain generation and placement from bundle; save/multiplayer clients from bundle.
6. **Interfaces** — `TerrainSampler`, `ChunkProvider`, `Store`, `Transport`, `MergePolicy`.
7. **Risks** — PHP file-lock backend remains the production store; changing save transport must preserve `operationId`/revision semantics; world streaming changes tree/rock ids used by saves.
8. **Tests** — persistence certification (existing) re-pointed to the real client; outage test (9 s block → recovery) automated in browser; chunk streaming fixture at 3× current world size within frame budget; merge-policy property tests.
9. **Done when** — autosave failure surfaces as `degraded` with retry and never silently drops (C2 closed); world size configurable; multiplayer client has one implementation.
10. **Effort** — 6–9 ew.

## ZGE-05 · AI and extensibility framework
1. **Objective** — `@zge/ai` (perception, knowledge, legality, policies BT/utility/planner, memory, coordinator, command bus with authority tiers) and a stable plugin API; `@zge/ai-sentinel` adapter preserving current R0 behaviour and tests.
2. **Dependencies** — ZGE-03 (gameplay commands exist), ZGE-04 (persistence for memory).
3. **Reuse** — all `*Integration.js`, `azl/*` contracts, MCTS worker, `StrategicAI`, adaptive worker, governance registries and 45 tests.
4. **New** — `CommandBus` + tokens; BT/utility runners; `ForwardModel` interface; `AgentMemory`; `Coordinator`; `WorldDirector`; `MissionGenerator`; plugin manifest validation; hot reload.
5. **Extract** — the 10-deep integration chain from `main.js` into one plugin with declared `requires`; Forest command handlers → commands on the bus; `ForestDefensiveCommandIntegration` v1 deleted.
6. **Interfaces** — `Agent`, `Observation`, `Policy`, `Proposal`, `CommandBus`, `AuthorityTier`, `ModelAdapter`, `Plugin` (stable).
7. **Risks** — authority regressions (an R0 adapter gaining execution by accident): enforce at bus with tests; governance evidence hashes must still verify.
8. **Tests** — all 45 Sentinel/AZL tests green against the adapter; bus rejects R0 execution; canary/kill-switch scenario replayable headless; BT/utility NPCs reproduce scripted behaviour on fixtures (no gameplay regression in QA states).
9. **Done when** — engine runs with `ai-sentinel` absent; scripted NPCs are policies, not `switch` strings; plugin API frozen at 1.0-rc.
10. **Effort** — 8–12 ew.

## ZGE-06 · ZekNova migration and compatibility certification
1. **Objective** — ZekNova runs entirely on `@zge/*` + `games/zeknova`; the bundle, reconstruction artifacts, golden-hash tests and compat plugin are deleted; persisted progress (v1–4 saves, profiles, rooms) remains loadable.
2. **Dependencies** — ZGE-03, 04, 05.
3. **Reuse** — everything above; `docs/QA_GAMEPLAY_STATES.md` as acceptance script.
4. **New** — migration tooling for live `data/` files; release manifest with content hashes (behavioural certification replaces byte certification).
5. **Extract/delete** — D-category list in `SYSTEM_EXTRACTION_MATRIX.md`.
6. **Interfaces** — none new; API freeze.
7. **Risks** — feel/balance drift accumulated over milestones; production Medallion auth path untestable locally (needs staging).
8. **Tests** — full campaign (12 missions, 12 bosses) headless by agents + manual playthrough; perf fixtures ≤ baseline p95; save migration corpus from `data/`; multiplayer two-client session.
9. **Done when** — `assets/index-02987539.js` removed from the tree; CI green; release candidate reproducible from source (`zge build` → hashed bundle).
10. **Effort** — 4–6 ew (+ playtest time).

## ZGE-07 · Game editor and SDK
Objective: editor per `EDITOR_SPECIFICATION.md` (P0 then P1), `@zge/cli`, typed SDK docs, templates. Dependencies: ZGE-06 (stable API). Reuse: WorldClaw editor, physics debug, fixtures. Tests: editor operations scriptable via CLI; scene round-trip; inspector reflection coverage 100 % of shipped components. Done when a scene can be authored, saved, played and profiled without code. Effort: 10–14 ew.

## ZGE-08 · Independent second-game validation
Objective: a small game (e.g. arena survival or a colony-lite) built by someone outside the engine team using only the SDK, no ZekNova imports. Dependencies: ZGE-07. Tests: builds from template in < 1 day; uses ≥ 1 plugin from each tier (render, physics, assets, gameplay, ai); no engine source changes required. Done when the second game ships to a URL and the resulting issues are triaged into the SDK. Effort: 3–4 ew engine support + the external build.

## ZGE-09 · Developer preview readiness
Objective: versioned packages, docs site, examples, CI with headless certification, security review of PHP/persistence adapters, licensing. Dependencies: ZGE-08. Done when a public `0.1.0-preview` tag exists with changelog, and the ZekNova production deployment runs on it. Effort: 3–5 ew.

---

## Totals and sequencing
| Milestone | Effort (ew) | Parallelism |
|---|---|---|
| ZGE-01 | 4–6 | — |
| ZGE-02 | 6–8 | — |
| ZGE-03 | 10–14 | ‖ ZGE-04 |
| ZGE-04 | 6–9 | ‖ ZGE-03 |
| ZGE-05 | 8–12 | — |
| ZGE-06 | 4–6 | — |
| ZGE-07 | 10–14 | — |
| ZGE-08 | 3–4 | — |
| ZGE-09 | 3–5 | — |
| **Total** | **54–78 ew** (≈ 6–9 months for 3 engineers) | |

No completion percentages are claimed for future milestones; ZGE-00 is complete per this document set.


## Bounded execution ledger through ZGE-09

The original milestone forecast above is retained unchanged. Subsequent explicit implementation prompts used narrower acceptance boundaries and different scope sequencing; this ledger records those results without declaring the forecast's broad deletion/release targets complete.

| Execution milestone | Evidence-backed result | Remaining broader gate |
|---|---|---|
| ZGE-01 | Kernel/compat/render/native/reference/mock foundation, 38 engine tests; report records bounded/partial status | Real neural inference and broader migration remain separate |
| ZGE-02 | Acknowledged v4 transport, asset coalescing/watchdogs/lifecycle work, 58 tests | Embedded Three and historical GLTF attribution unresolved |
| ZGE-03 | Reusable gameplay/asset ownership groundwork, 83 tests | No complete live construction authority port |
| ZGE-04 | 106 tests, 702 Node/390 browser bounded parity, world schema and local authority gateway | Full live effects/writers/server authority not certified |
| ZGE-05 | 140 tests, connected source 3D world/events/missions/rewards, Node server fixture | PHP durability, history scaling, V4 execution migration, live writer closure |
| ZGE-06 | Actual isolated PHP/SQLite transaction host for existing JS runtime; two browsers and process-crash recovery; reversible read-only v4 projection; bounded runtime checkpoint tails and exact 1k/10k/100k event archive replay; 167 engine tests | Existing production PHP/legacy authority, complete aid/economy/utility/health/rank/campaign port, full v4 execution migration, production identity/throughput/retention/build/owner release gates |
| ZGE-07 | Versioned membership/session/connection hardening, private source ConstructionPort and quarantine, isolated forward/rollback V4 branch, audited corruption recovery, authenticated 100k-event HTTP backfill, expiry/reload/reauth/restart browser certificate; 191 engine tests | Complete live writer disablement/effects/aid/mission parity and execution migration remain NO-GO; supervised host, per-player progression, operational/remote identity and reproducible build/release gates remain |
| ZGE-08 | Private supervised persistent world workers, SQL generation fencing, independent actors/private placement XP/rank/progress, 14-category recovery, isolated backup/restore and SQLite FULL rollback; 221 engine tests; 2,048 actual HTTP gameplay commands at 1–8 clients | Live authority remains LEGACY; full live writer/aid/V4 closure, sustained/remote capacity, full-volume exhaustion, production identity/operations/build/owner release gates remain |

| ZGE-09 | Foreground whole-stack self-recovery and DB-identity guard; monotonic stage profiling, bounded fair/crash-safe admission and quota batching; 251 engine tests; 600-second managed mixed soak, exact replay of 3,192 commands and 9,768 events archive audit, real disposable-volume ENOSPC recovery; source capture of 79 files / 64 tests repeatable ESM and permission-aware local tool APIs | Live LEGACY retained; complete aid/writer/V4 closure, original-game build/assets/lifecycle, longer/remote operations, mandatory credential rotation and owner production release gates remain |

See ZGE_06_IMPLEMENTATION_REPORT, SOURCE_WRITER_COVERAGE, PHP_MULTIPLAYER_CERTIFICATION, V4_SAVE_MIGRATION, WORLD_HISTORY_SCALING and ZGE_07_IMPLEMENTATION_PROMPT. Live ZekNova construction remains LEGACY. No bundle deletion, deployment, credential rotation or golden re-pinning is authorized by these bounded results.


## ZGE-10 bounded execution addition

The public `@zge/sdk` preview now owns versioned local scene/project/transaction/proposal contracts and composes the existing kernel/assets. Studio provides actual pointer selection and X/Z manipulation, hierarchy/inspector, local save/reload, atomic undo/redo, mock diff approval and isolated simulation. Orbital Outpost consumes public package exports only. The clean public package builds independently; final engine suite is 263/263, legacy 83/86 with unchanged golden failures, and all nine prior browser regression scripts pass.

Operational work retains PHP/SQLite single-writer authority and adds observational worker heap/GC telemetry plus asynchronous benchmark sampling. A retained 180-second synchronous control reproduces client timing artifacts; the longer 900-second managed run and exact resource/replay results are recorded in SUSTAINED_OPERATIONS_ZGE_10.md and the verification manifest. This is bounded local certification, not a population/SLA/leak-free claim. Live LEGACY and production NO-GO remain.

Next: ZGE-11 SDK/schema/reflection hardening, stronger project/editor workflows, independent developer validation and longer/remote operational attribution. Original source/assets, complete live writer/aid/V4 parity, TLS/identity, mandatory owner credential rotation/post-rotation checks and owner release approval remain open. Historical forecasts above are unchanged.


## ZGE-11 bounded execution addition

Public SDK preview11 adds packaged declarations/strict TypeScript consumption, v1→v2 project migration, declarative component reflection/typed errors, portable JSON assets/prefabs and stronger history/lifecycle contracts. Studio now has actual orbit/pan/zoom/projection and X/Y/Z move/rotate/scale controls, cancellation/snapping, hierarchy/component/resource workflows, complete portable project files and isolated debugger. Signal Garden installs public packages outside the monorepo and runs a Studio-edited project independently. Final engine tests are269/269; legacy83/86 retains the same three golden failures; all nine prior browser regressions pass.

The20-minute complete-service soak retains single PHP/SQLite durable authority and exactly replays6378 commands/19861 events. It records one admission-busy response whose original command retried successfully, no transport failures/restarts, and p99 121.42ms. Isolated9000-move class snapshots show stable runtime/array/map/set counts and code-space growth, while the sustained worker heap tail remains positive. These are bounded local/editor/staging results, not a leak-free, population/SLA or production certificate.

ZGE-12 should deepen human usability/accessibility, project/model/schema workflows, independent consumer maintenance and retained-heap/storage/scheduling attribution. Live LEGACY, original aid/writer/V4 parity, source/build/assets/licensing, production identity/TLS/operations, mandatory owner credential rotation/post-rotation verification and release approval remain open. Historical forecasts and prior execution evidence are preserved.

## ZGE-12 bounded execution addition

Public SDK preview12 adds static GLB2 triangle custody/rendering, atomic local transform batches and validation/version tightening. Indexed/virtualized hierarchy and stable keyboard/import workflows support documented100/500/1000/5000mixed-entity bounds on real WebGPU/WebGL. Three clean packed consumers run edited exported projects independently; existing Signal Garden/Outpost compatibility remains. This is automated external-developer validation, not human usability or full accessibility certification.

Engine279/279 plus final27public retests pass; legacy83/86 retains the same3golden failures. Strong heap-root paths, allocation samples and weak probes support bounded active ownership, with full-service retention still inconclusive. The1500.003s/9900request managed staging workload exactly replays7972commands/24817events. WAL/FULL, quotas and single-writer authority stay intact; rare storage/OS attribution and outer manual restart boundary remain explicit.

Live LEGACY and production NO-GO remain. Human/accessibility/richer asset/rule/editor scope, original gameplay clipping/input/save/auth/full campaign, complete aid/writer/V4/economy/health/utility/repair parity, original source/assets/licensing, identity/TLS/operations, owner credential rotation and owner release remain open. Prior milestone evidence/forecasts are preserved. See ZGE_12_IMPLEMENTATION_REPORT.md and ZGE_13_IMPLEMENTATION_PROMPT.md.

## ZGE-13 bounded execution addition

The source-world continuous-input stall is reproduced and diagnosed: it is admission-gate concurrency (`movement<=8`, `<=2`/actor) plus the serial in-flight guard plus single-writer SQLite `FULL` commit, surfaced by naive per-keystroke movement. It is fixed by bounded intent pacing in `MovementSampler` (normalize diagonals, never replace an in-flight receipt, population-aware interval) — no client prediction, no command coalescing, no quota increase. Forced-100ms sampling yields 278/594 failed receipts; bound pacing drives 429s to zero, at a residual 8-player input→visible p99 of ~2.7 s that is retained as an explicit authority-preservation limit.

Beacon Haven is a cohesive independent Studio+SDK game (terrain, imported multi-mesh GLB shelters, player, three collectibles, build-with-cost, one-shot interact, objective, save/export, visual+audio feedback) that runs end-to-end from a clean public-SDK install and restores exactly. Hierarchical multi-mesh flat-base-color GLB import is added as an explicit `hierarchy` opt-in (`preview13`) that preserves the ZGE-12 strict API; textures/rigs/animation remain unclaimed. A typed, atomic, versioned visual rule editor (`move/collect/build/interact/goal`) rejects executable-JS rule kinds and isolates authoring from simulation and durable authority. The 320 px reflow failure is resolved (document width 320 at 320 viewport). Legacy construction clipping, modal input isolation, save-ID stability and visible auth recovery are fixed via owned UI/transport with real physical input; natural full campaign remains partial.

Engine284/284 and public SDK30/30 pass; legacy83/86 retains the same three golden mismatches. A 900.0 s managed mixed soak records5903 requests (e2e p50/p95/p99 29.3/199.7/652.7 ms, exact replay) and attributes the tail to admission-queue wait (p99 343 ms) and worker IPC (p99 177 ms); the rare `databaseOpen` spike stays unattributed. Editor 24-switch retention keeps zero old-engine references. This is automated developer-workflow certification; no human usability, no screen-reader conformance, and no real provider inference.

Live LEGACY and production NO-GO remain. Movement tail, textures, natural campaign, operational (fsync/paging) attribution, human/assistive-technology accessibility, complete aid/writer/V4/economy/health/utility/repair parity, original source/assets/licensing, identity/TLS/operations, owner credential rotation/post-rotation checks and owner release remain open. See ZGE_13_IMPLEMENTATION_REPORT.md and ZGE_14_IMPLEMENTATION_PROMPT.md.

## ZGE-14 bounded execution addition (IN PROGRESS, PARTIAL)

The ZGE-13 residual "8-player input→visible p99 ≈ 2.7 s" is re-measured with a dedicated instrumented matrix (`scripts/zge14-input-matrix.mjs`) and found to be **an artifact of the 185 s sustained-burst + collision-accumulation test**, not a steady-state latency. Across 1/2/4/8 players × none/50ms-delay/loss/reorder, the steady-state 8-player tail is **input→ack p99 254 ms / input→visible p99 266 ms** with **zero 429s** in every case; the only rejections are legitimate `collision` refusals (3 at 8p). Loss/reorder fault modes push p99 to ~472/484 ms and ~506/516 ms respectively — still sub-second. Per-stage attribution (`request-metrics.php` `stagesMs`) shows the tail is **dominated by per-transaction worker IPC (p99 ~17 ms), not single-writer `synchronous=FULL` fsync (`COMMIT` p50 0.24 ms)**. A dedicated fixed-tick movement-batching protocol is documented as safe and feasible (see `MULTIPLAYER_INPUT_PROTOCOL.md`) but **left version-gated OFF** — it is not implemented, per the custody rule against weakening a preserved authority path without stronger need.

A bounded, proven-verified base-color texture subset is added to the SDK: embedded PNG/JPEG ≤1 MiB each / ≤4 MiB total (base64-encoded in the portable model to stay under the 1 MiB asset-JSON cap), `TEXCOORD_0` UVs, `baseColorTexture`/`normalTexture`, `alphaMode` (`OPAQUE`/`BLEND`/`MASK`) + `alphaCutoff`, and `MeshStandardMaterial` rendering. A hostile/corrupt corpus test rejects external-URI images, non-PNG/JPEG mimes, out-of-range texture sources, baseColorTexture-without-UV, and MASK-without-alpha. Named provenance defaults to `unknown` redistribution; the compatible model source format remains `zge.static-model.v1`. Rigs/animation/morphs/compressed textures remain a separate, unclaimed contract.

A `frameTimings()` renderer instrument (rAF histograms p50/p90/p95/p99, draw-call/triangle counters, and an honest `timestamp-query`-feature availability flag) is added to separate presentation rate from render throughput, answering item 4 without overclaiming real GPU timestamps.

Engine **287/287** and public SDK **33/33** pass; legacy **83/86** retains the same three golden mismatches. Item 2 (natural 12-mission campaign), item 5 (rare `databaseOpen`/`COMMIT` spike fsync/paging attribution), item 6 (human usability + WCAG focus/name/role), and item 7 (real AI provider) remain **open** — the first is legacy-custody-gated, the latter two require resources unavailable to this automated session (a consenting human tester; an authorized provider + approved secret path). **Verdict: PARTIAL.**

Live LEGACY and production NO-GO remain unchanged. See ZGE_14_IMPLEMENTATION_REPORT.md.

## ZGE-15 immersive play mode addition (PARTIAL)

A source-owned camera director (`packages/sdk/src/camera.js`, exported as `createCameraDirector`/`MODES`) registers as a `render`-phase system and delivers three presentation-only rigs — isometric (orthographic, 45°/40°), over-the-shoulder (perspective fov 58 + shoulder offset + mouse-look), third-person (perspective fov 50 chase/orbit) — with `follow`/`setLook`/`setTransitionDuration` and a `viewport.directCamera(pose)` bridge that swaps ortho↔perspective and drives the single active camera. ZekNova Studio's Play button now enters immersive fullscreen (`examples/studio/play-mode.js`): editor chrome collapses, native fullscreen (full-window fallback), a minimal HUD (objective + 1/2/3/C camera selector + pause dialog), pointer lock on first canvas click, Escape pause, and Return-to-Editor — all without mutating the authored scene (verified byte-for-byte). Seamless ~350 ms mode switching keeps `stepNumber` stable and world `revision 0` (no sim restart, no reload, no teleport, no duplicate cameras).

Engine **294/294**, SDK **40/40**, legacy **83/86** (same 3 golden). Verified on WebGPU and WebGL in Beacon Haven and Studio. **Verdict: PARTIAL** — camera collision/occlusion (Phase 9), physical pointer-lock mouse-look, camera-relative movement (Phase 7), a full-frame benchmark (Phase 11) and camera preset persistence (Phase 12) remain open. Production + live-authority remain NO-GO. See ZGE_15_IMPLEMENTATION_REPORT.md.
