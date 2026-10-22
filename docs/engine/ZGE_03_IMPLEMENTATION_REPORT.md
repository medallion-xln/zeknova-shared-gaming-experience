# ZGE-03 — Engine authority extraction and independent world runtime

Date: 2026-10-20 (America/Los_Angeles). HEAD `138220f4909b3fd6a3e0dd2e62ebab63785336d7`, unchanged. **PASS for the bounded milestone; NO-GO for production gameplay authority transfer.** Nothing committed or staged.

ZekNova Engine now executes construction/resource transactions independently of the game: terrain and circle occupancy validation, costs, placement/removal, events, save/restore, reverse rollback and deterministic replay. `npm run demo:engine` starts an owned fixed-step world, creates an entity, places a shelter, rejects overlap, restores and replays identical state, then disposes. The browser example uses the same public APIs. Its recursive production import graph contains neither ZekNova gameplay content nor the minified runtime.

Live ZekNova keeps its existing gameplay loop. Construction is LEGACY by default; `?construction=shadow` evaluates detached inputs and calls the legacy mutator exactly once. Live ENGINE installation is explicitly rejected. Engine construction authority is certified only in the independent fixture. Mission and combat packages are pure evaluators with typed contracts; they do not claim complete legacy mission/boss/damage parity or live authority.

## Baseline and integrity

Before edits: recorded HEAD/status, file digests and active process inventory. Other agent processes were associated with another repository; no concurrent writer to this checkout was observed. All 16 existing files modified during this milestone are listed in `evidence/zge03/file-inventory.json`, with a separate created-file list. Earlier uncommitted bundle timeout patches, source changes, untracked packages/docs and submodule state were preserved. The authoritative minified bundle's SHA-256 is unchanged from turn start (`25665bd856768b89f2283f6e44a8f93efafe074f9d0fcace5efd8296c991d115`). Readable model/environment modules were intentionally edited; vendor bundles, golden hashes, API code, production configuration and credentials were not edited.

Measured baseline: **engine 58/58**; **legacy 82/85 test files**, rather than treating the historical 83/86 as a fresh measurement. Source structural check and animation audit are separate commands. The three failing files are `renderer-ownership-certification`, `runtime-graphics-context`, and `runtime-reconstruction`, all stopped by existing golden bundle hash expectations. Their hashes were not changed to pass tests. Final legacy result is the same **82/85**, with **0 new failing files**. Source check and animation audit pass (70 runtime assets, 66 clips; six existing corrupt exports remain quarantined).

Exposed production provider credentials and the collector token still require immediate owner-controlled rotation. The initial process audit also inadvertently displayed an unrelated agent's credential-bearing argument; that token requires rotation too. Values are not repeated in these artifacts. Subsequent process checks used names only.

## Implemented ownership and runtime

- Core adds component validation registration, dependency scheduling (`after`), per-system disposal, explicit domain authority, deterministic command order/idempotency, pending/result journal snapshots and timing-state restoration. Restore signals synchronize construction state with the kernel world. No simulation/render objects are shared in the independent world.
- `@zge/gameplay-construction` owns real synchronous transactions in its fixture. A VM contract executes actual legacy construction methods across 48 rank/type/terrain/inventory combinations. Tests cover exact costs, invalid inputs, overlap, failed validation atomicity, removal, rollback/replay, command retries, snapshots, disposal and authority switching. The comparison slice excludes later rank/cooldown/utility/commissioning/multiplayer wrappers; see `CONSTRUCTION_EXTRACTION.md`.
- `@zge/gameplay-missions` exposes prerequisites, objective targets/progress, completion and reward proposals; tests retain all twelve legacy missions and compare threshold outputs from legacy objective values. `@zge/gameplay-combat` exposes guarded damage proposals, ownership validation, health clamp, effects and death events. Armor/defense, projectile simulation and all boss FSMs remain legacy-owned. These are initial generic interfaces/evaluators, not complete combat/mission extractions.
- `AssetService` adds typed canonical IDs, loader registration, in-flight deduplication, parsed caching, owner leases/reference counts, dependency pins, budgeted LRU, cancellation, retry, failed-entry invalidation, metrics and disposal. All readable actor/environment loaders route through one shared GLTF/KTX2 pair. Detached clones preserve skeleton, clip, transform, material, texture and geometry independence under existing aggressive legacy disposal.
- One bounded worker pool replaces two pools. Worker errors, message errors, termination and queued/active deadlines reject outstanding work, clear timers and reset workers. A new request can restart after a generation failure; retries use fresh bytes. Full transcoder initialization recovery is a narrower unresolved case.

## Browser certification

Evidence: real local Chrome process launches, PHP development mode, headless viewport, WebGPU and WebGL safe mode. `scripts/zge03-browser-certification.mjs` records the main battery; `scripts/zge03-browser-followup.mjs` asserts mock/reference, boss and persistence fixtures. Set `PLAYWRIGHT_MODULE` to an installed Playwright entry; no production credentials are used. These scripts create isolated local QA teams/saves.

| Check | Observed result |
|---|---|
| Launch | Kernel reaches running in native WebGPU and WebGL safe mode; twelve missions present |
| Keyboard movement | Approximately 9.0–10.3 m over the one-second input fixtures; scripted QA staging can relocate actors, so these are smoke readings, not calibrated speed benchmarks |
| Collision | Placed Solar Grid sites report occupied through the live terrain obstacle API; independent engine overlap rejects transactionally |
| Combat | Existing health mutation 325 → 320 in ordinary runs; legacy boss damage also decreases health |
| Construction | Four Solar Grid comparisons, exact deductions, one original placement per call; zero shadow mismatches/errors |
| Boss progression | Controlled Sunscar Colossus fixture reaches legacy defeat, grade/reward record and inactive encounter; not a full campaign playthrough |
| Save/restore | Normal-game v4 save acknowledged; XP 777 → 777 after reload; shadow predictions absent from envelope; building IDs survive full-page restart |
| QA save isolation | Boss QA mode deliberately suppresses production saves; persistence certification switches to normal gameplay first |
| Neural/reference | Label explicitly says MOCK, actual reference capture succeeds with zero blank frames; no inference service falls back to NATIVE |
| Restart | Three cycles per main mode plus settled follow-up; 29 restartable directors, no failures; settled follow-up Δ live listeners 0, intervals 0 |
| Console | No uncaught gameplay errors in final runs; four existing missing bridges, Three duplicate/deprecation warnings remain; handled 409 save conflicts appear in two reload samples |

One active neural-fallback sample counted an extra AbortSignal listener while background work was in flight. The settled follow-up (paused world, pending assets drained) measured zero live-listener and interval growth. Detached DOM listeners are reported separately; RAF pending counts fluctuate with sampling. This is not a certification that every page-only UI director can restart.

## Asset and KTX2 findings

Real KTX2 transcodes: sixteen concurrent textures at each pool size 1/2/4/8; repeated four-way GLTF loads/disposal; forced worker death; silent-worker timeout; malformed and unsupported formats; initialization failure; page reload and fresh browser processes, on both backends. Normal work settles; injected faults reject as expected. Death rejects in <2 ms, silent tasks in approximately 2 s (fixture deadline), and fresh-byte retries succeed.

The unmodified vendor pool remains pending at the independent 250-ms worker-death deadline. The replacement conclusively repairs that reproduced non-settlement path. **The historical GLTF initialization hang itself was not reproduced or attributed, and remains unresolved.** See `KTX2_STRESS_RESULTS.md` and raw evidence.

Normal readable runtime: one canonical actor module, one shared loader pair, at most four KTX2 workers (safe mode used one in the sample), no multiple-active-KTX2 warning, no observed normal loader failures. Two Three implementations remain: embedded authoritative bundle and canonical vendored asset implementation. A package import guard prevents introducing another Three module path, but full embedded-copy removal needs its separate build/bundle gate.

Parsed cache samples stay below 64 MiB after eviction (roughly 18–66 MB depending on quality/content), with zero outstanding leases at sampling. The fetch cache has its own 64 MiB budget. Detached-instance memory is additional and not budgeted by the parsed cache. Geometry sharing is deliberately deferred until legacy disposal is lease-aware; do not interpret parsed caching as full GPU resource consolidation or “one parse forever” after LRU eviction.

## Lifecycle investigation

The new shadow adapter is the 29th restartable director. Combat feedback and its registry both disposed the same audio context; removed the duplicate owner call and made audio disposal idempotent, including active voice shutdown. Browser follow-up has no closed-context error, and a new test verifies repeated disposal closes once.

Remaining page-only UI was inspected without changing its gameplay behavior:

| Director | Remaining teardown work |
|---|---|
| Pause menu | Own DOM listeners and music-render timer; route its `zk-dispose` cleanup from a complete registry teardown |
| Mission clarity | Disconnect observer, clear polling timer, release window/keyboard and generated-row listeners |
| HUD | Retain/disconnect MutationObservers, release window/pointer callbacks, clear startup polling and DOM state |
| Team chat | Identity-restore fetch wrapper, own panel/input/gameplay-ready callbacks and pending render state |
| WorldClaw editor | Own button callbacks, editor root and optional materialized-world cleanup; offline director itself is not the UI lifecycle owner |

Full-page restart remains the supported path for these directors and the legacy runtime. No new engine package depends on their lifecycle assumptions.

## Tests and performance limits

Final engine: **83/83**, including all original 58. Legacy: **82/85**, same three golden failures; **NEW_REGRESSIONS=0** in the measured suites. Main and follow-up browser evidence is retained. One concurrent test run during browser stress hit a short worker-fixture timeout and two existing neural wall-clock assertions; the normal-work fixture now has a realistic 1-second deadline and the engine command runs test files serially. The explicit timeout fault test remains short. The contention log is retained rather than hiding it; final serialized suite passes.

Live headless samples are approximately 60 fps, p99 16.8 ms. They are not comparable to ZGE-02's 118–119 fps interactive 120-Hz measurements. No ±10% gameplay frame-budget certification is claimed. Measurable architectural delta: KTX2 pools 2 → 1, maximum normal KTX2 workers 8 → 4, same two Three instances. Native capture overhead remains optional; a mock/reference sample reports ~9 ms median eager capture, with raw stage timings available. No model weights, real neural inference, GPU training or inference downloads were attempted.

## Decision and next milestone

GO for independent engine construction and continued shadow evaluation. NO-GO for live ENGINE construction/combat/missions, full legacy restart, complete Three consolidation or declaring the historical hang solved. Outstanding owner gates: credential rotation, golden-hash provenance/build strategy and any later production save-schema change. `ZGE_04_IMPLEMENTATION_PROMPT.md` scopes broader construction contracts, lease-aware disposal, sustained stress and one-at-a-time UI teardown.

## Requested result

```text
=== ZGE-03 ENGINE EXTRACTION RESULT ===
STATUS=PASS_BOUNDED_WITH_LIMITS
HEAD=138220f4909b3fd6a3e0dd2e62ebab63785336d7
FILES_CREATED=47
FILES_MODIFIED=16
CONCURRENT_WRITER_DETECTED=NONE_OBSERVED
ENGINE_SIMULATION_KERNEL=EXECUTABLE_FIXED_STEP
ENTITY_COMPONENT_SYSTEM=REGISTRATION_DEPENDENCIES_SNAPSHOTS
AUTHORITATIVE_SYSTEMS=CONSTRUCTION_FIXTURE; READABLE_ASSET_SERVICE
SHADOW_SYSTEMS=OPTIONAL_LIVE_CONSTRUCTION; EXISTING_PHYSICS_AI_OBSERVERS
LEGACY_SYSTEMS=LIVE_GAMEPLAY_PHYSICS_COMBAT_MISSIONS_BOSSES
ASSET_MANAGER=ENGINE_SERVICE_WITH_LEASES_AND_BUDGETS
PARSED_ASSET_CACHE=ENABLED_LRU; DETACHED_CLONES
THREE_JS_INSTANCES=2
MODEL_RUNTIME_INSTANCES=1_CANONICAL_ACTOR_MODULE
KTX2_WORKER_STRESS=PASS_INJECTED_FAILURES_BOUNDED
GLTF_HANG_ROOT_CAUSE=UNRESOLVED
CONSTRUCTION_EXTRACTION=EXECUTABLE; FIXTURE_AUTHORITY_CERTIFIED
MISSION_INTERFACES=PURE_EVALUATOR_ONLY
COMBAT_INTERFACES=PURE_EVALUATOR_ONLY
STANDALONE_ENGINE_DEMO=NODE_AND_BROWSER_PASS
PERSISTENCE_COMPATIBILITY=V4_PRESERVED; XP_777_RESTORED
NATIVE_RENDERING=WEBGPU_AND_WEBGL_VERIFIED
NEURAL_FALLBACK=NATIVE_VERIFIED; MOCK_ONLY
RESTART_SAFETY=29_DIRECTORS; SETTLED_LISTENER_INTERVAL_DELTA_0
ENGINE_TESTS=83/83
LEGACY_TESTS=82/85; SAME_3_GOLDEN_FAILURES
NEW_REGRESSIONS=0_IN_MEASURED_SUITES
PERFORMANCE_DELTA=WORKERS_8_TO_4; FPS_NOT_COMPARABLE
UNRESOLVED_BLOCKERS=LIVE_PARITY; EMBEDDED_THREE; HISTORICAL_HANG; UI_TEARDOWN; OWNER_GATES
NEXT_MILESTONE=ZGE_04
GO_NO_GO=GO_BOUNDED_EXTRACTION; NO_GO_LIVE_AUTHORITY_TRANSFER
```
