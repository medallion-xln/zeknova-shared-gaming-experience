# ZGE-00 · Current State Audit

Audit date: 2026-10-19 · Repository: `zeknova-shared-gaming-experience` · Branch `main` @ `138220f`
Scope: forensic audit of what exists, what runs, and what is duplicated, incomplete or obsolete. Every claim below names the file, test, log or runtime probe it came from. Phase 2 measurements live in `CERTIFICATION_RESULTS.md`.

---

## 1. Repository integrity

| Item | Observed |
|---|---|
| Branch / HEAD | `main` @ `138220f4909b3fd6a3e0dd2e62ebab63785336d7` ("larest updates 10/3/26", 2026-10-03) |
| History | 16 commits total, 2026-07-15 → 2026-10-03. No tags, no other branches, no stashes, one worktree. |
| Remote | `origin` → `github.com/medallion-xln/zeknova-shared-gaming-experience` |
| Tracked modifications | `assets/index-02987539.js` (+3/−3), `assets/model-runtime-c96327ba.js` (+8/−2), `assets/model-runtime.js` (+9/−3), `.DS_Store`; submodule `stable-fast-3d` has local changes |
| Untracked | `.cursor/`, `.lingcode/`, `PLAY_README.md`, `start-local.mjs` |
| Concurrent processes | One PHP dev server on `127.0.0.1:8080` (pid 25577) serving a **different** project (`~/Desktop/medallionxln.apache`). No writer on this repository. Port 8790 was free and was used for certification. |
| Toolchain | Node v22.22.2, PHP 8.5.9, `three@0.185.0` (devDependency), `esbuild@0.25`, `@gltf-transform/cli`. No Vite/TypeScript/test runner in `node_modules` (150 packages). |
| Build command | **None.** `npm run dev` = `php -S` (`scripts/dev.mjs`). What is committed is what runs. |
| Tests | 85 Node test files (`tests/*.test.mjs` ×40, `tests/*.test.cjs` ×45) + 23 "portability report" scripts + 2 report scripts. All are pure-Node unit/contract tests; **zero browser tests** (no Playwright/Puppeteer/jsdom dependency). |
| Deployment | Apache shared hosting at `medallionxln.com/zeknova/` (`README.md` §Deploy, `.htaccess`, `index.php`). File-backed JSON persistence in `data/` under `flock`. |
| Prod vs dev | `ZEKNOVA_ENV=local` → `ZEKNOVA_AUTH_MODE=demo` (`api/bootstrap.php:54-56`); production reads the shared Medallion XLN PHP session cookie. Local uses the same PHP code path. The Node `start-local.mjs` stub returns `user:null` to `POST /api/session.php`, which `src/ui/LoginPage.js:66` rejects ("server did not return an active officer profile") — **the untracked no-PHP path cannot enlist a player** (static analysis; not browser-verified because the documented PHP path was used). |

### 1.1 Secrets on disk
`.env.production` exists in the working tree with live-looking DeepSeek and OpenAI keys. It is git-ignored (`.gitignore: .env.*`) and not tracked, but it sits inside the web root that `README.md` says to upload "contents of" to Apache; `.htaccess` denies `.env*` only if `mod_authz_core`/`mod_access_compat` is active. **Rotate the keys and move them out of the deploy package.** Values are deliberately not reproduced in this document.

`src/game/Stage2FRuntimeCollectorConfig.js` commits a bearer token and a hard-coded loopback endpoint (`http://127.0.0.1:43127`) that every production page load polls every 5 s (`Stage2FRuntimeCollectorBinding.js`). Observed at runtime: `ERR_CONNECTION_REFUSED` on every poll, ~25 console errors per 10-minute session.

### 1.2 Release-reproducibility blocker — status: **REGRESSED, not resolved**
`docs/RUNTIME_RECONSTRUCTION_CONTRACT.md` pins the runtime to two golden SHA-256 hashes and `tests/runtime-reconstruction.test.mjs` enforces them. The working tree no longer matches:

| File | Golden (HEAD) | Working tree |
|---|---|---|
| `assets/index-02987539.js` | `7a9cdfee…6dab` | `25665bd8…d115` |
| `assets/model-runtime-c96327ba.js` | `e6af33cd…26d0` | `1d438e04…7713` |

Consequence: `runtime-reconstruction`, `renderer-ownership-certification` and `runtime-graphics-context` tests **fail** (3 of 86). The `npm test` chain aborts at `runtime:reconstruct:test`. The uncommitted diff is the ZEK-04.1 "GLTF hang" mitigation (see §3.9). The "reconstructed runtime" in `src/runtime-reconstructed/compat/segments/*.js` is **not readable source**: it is the minified bundle cut into eight byte-exact slices and re-concatenated by `scripts/build-reconstructed-runtime.mjs`. It proves bytes, not understanding.

### 1.3 Lost original sources
`README.md` §Important files lists `src/main.ts`, `src/game/Terrain.ts`, `src/game/Player.ts`, `src/game/Buildings.ts`, `src/game/Simulation.ts`, `src/ui.ts`. **No `.ts` file and no Vite/tsconfig has ever been committed** (`git log --all -- '*.ts' vite.config.* tsconfig.json` is empty). The only copy of the core game is the 1.4 MB minified bundle. This is the single largest architectural fact in the repository.

---

## 2. What is actually implemented, and who owns it

### 2.1 Two code layers
| Layer | Location | Size | Role |
|---|---|---|---|
| Generated runtime (authoritative) | `assets/index-02987539.js` (4,479 lines, 1.4 MB, Three.js r185 **inlined**), `assets/model-runtime-c96327ba.js` (1,881 lines), `assets/environment-runtime.js` (1,431 lines), `assets/model-runtime.js` | ~7.8 K minified lines, 383 classes | Renderer, scene, terrain, player, enemies, buildings, simulation, missions, bosses, HUD, multiplayer client, save client, MCTS advisor worker |
| Readable source | `src/**` 130 files / 19,616 lines (excluding `runtime-reconstructed`) | | Login shell, bootstrap (`main.js`, 579 lines, 51 dynamic imports, 31 `console.warn` fallback guards), 40+ "director" modules that **observe and decorate** the bundle through `globalThis.ZekNovaGame` |

Ownership facts established by grep and runtime probe:
- `src/game/Game.js:91` imports the bundle; the bundle publishes `globalThis.ZekNovaLegacyBridge{start,dispose}` and `globalThis.ZekNovaGame`.
- The bundle reads **none** of `window.ZekNovaSource` (0 matches). `src/world/Biomes.js`, `Enemies.js`, `Buildings.js`, `Collision.js`, `Terrain.js`, `Player.js` are **duplicated constants** that the bundle has inlined ("FOREST AO", "ZekNovan Stalker", "Solar Grid", "sunscar_fastball" all present in bundle text). `scripts/check-source.mjs` keeps them in agreement by regex-matching the minified text — this is the entire "source parity" mechanism. README's claim that these modules "are consumed by the live game" is **false**.
- `src/multiplayer/MultiplayerClient.js` is unused by the bundle (0 matches for its method names); the bundle has its own client, `sessionStorage` key `zeknova.multiplayer.client.v1`.
- The bundle itself is a **stack of 195 prototype reassignments over 91 methods** (`zR.prototype.initialize` overridden 18×, `dispose` 16×, `updateEnemies` 12×, `spawnEnemy` 6×, 39 explicit wrap-and-override chains, 425 `zk*` patch identifiers). It was grown by appending patches to a minified file, not by rebuilding from source.
- Readable directors reach into **77 distinct fields** of the bundle's `Game` object (`buildings`, `bossManager`, `enemies`, `player`, `ui`, `simulation`, `terrain`, … `_ffDistance`). Five of them monkey-patch bundle methods (`PhysicsRuntimeBridge` ×4, `StrategicAI`, `IdentityIntegration`, `GameModeDirector`, `AdaptiveSimulationDirector`). This untyped field set is today's de-facto engine API.
- The source publishes **61 `globalThis.ZekNova*` globals** and 18 frozen `AUTHORITY` objects. 73 of 130 source files (12,013 lines, 61 %) are Sentinel Grid / AZL / Prime / Goban / Picasso / WorldClaw / live-parity governance scaffolding, all R0 (observe-only).

### 2.2 Frame loop
`animate=()=>{…}` in the bundle: `requestAnimationFrame`, `delta = min(clock.getDelta(), 0.05)`, variable timestep. Update order extracted from the bundle: `resolveWaterTraversal → updateProjectiles → updateEnemyProjectiles → updateEnemies → updateResourceInteraction → updateExploreCamera → applyDiplomacyEffects → processEnemySpawning → updateHud → findNearest{Resource,Tree,PowerUp,Rock}`, then `renderer.render`. **No fixed timestep in the authoritative loop.** The fixed-step `src/game/physics/PhysicsWorld.js` (60 Hz accumulator, deterministic ordering) runs on **its own second rAF loop** (`PhysicsRuntimeBridge.tick`), mirrors bundle actors as *kinematic* bodies and re-detects projectile hits by wrapping `updateProjectiles`/`updateEnemyProjectiles`/`bossManager.pool.update`. Two loops, two notions of time, one authoritative mover (the bundle).

### 2.3 Rendering
`new WebGPURenderer({antialias:true, alpha:false, forceWebGL: zkForceWebGL})` (bundle `initialize()`). WebGPU is default; `?webgl` or `?safe` force the WebGL 2 backend; Three's own fallback handles missing `navigator.gpu`. Runtime-verified: WebGPU backend on Chrome 155; WebGL 2 in safe mode. Quality tiers low/balanced/high (`docs/PERFORMANCE.md`), overlaid by `AdaptiveSimulationDirector` quality tiers Ultra…Emergency (second, independent quality controller).

**Two copies of Three.js load at runtime.** The bundle inlines r185; `environment-runtime.js` and `model-runtime-c96327ba.js` import `./vendor/three.module.min.js`. Browser console: `THREE.WARNING: Multiple instances of Three.js being imported.` plus repeated `Multiple active KTX2 loaders`. The bundle imports `model-runtime-c96327ba.js` under **seven different `?v=` cache-busters** → seven module instances, seven `GLTFLoader`/`KTX2Loader` pairs, seven serial queues, no shared GLB cache. Observed: `zeknovan-juggernaut-walk.*.glb` downloaded **11 times** in one session.

### 2.4 Assets
211 GLB files / 193 MB in `assets/models` (20 models with high/medium/low LOD variants, 151 single-tier). All 99 paths referenced by code exist. Largest village pieces are 4–7 MB each. `assets/ASSET_REGISTRY.json` referenced by `PLAY_README.md` **does not exist**. Two authored MP3 scores (14 MB). Rust/WASM core (`rust/zeknova-core`, 137 lines: height sampling + rock spatial hash) is **disabled by default** (`zkDisableWasm = safe || !params.has("wasm")`); runtime reports `wasm: "disabled-for-diagnostics"`. `stable-fast-3d/` is a 1.7 GB Python submodule (image→mesh research tool) unrelated to the runtime.

### 2.5 Backend
`api/*.php` (1,711 lines): session/enrollment, `save.php` (per-user personal save + per-team shared world merged by stable id under `flock`, schema v1–4, 3,000-building cap), `multiplayer.php` (one JSON room per team, 1 Hz client polling, 20 s presence TTL, chat), `progression.php`, `reset.php`, `ai-advisor.php` (server-side DeepSeek/OpenAI proxy with per-user quota and memory files), `leaderboard.php`, `teams.php`. No SQL, no WebSockets, no rate limiting, no server-authoritative combat (README acknowledges all four).

---

## 3. System inventory

Readiness = engine-reuse readiness today (1 = none, 10 = drop-in). "Verified" = exercised in Phase 2 browser certification.

| # | System | Actual files / owner | Works | Tested | Verified in browser | Debt | Reuse | Readiness |
|---|---|---|---|---|---|---|---|---|
| 3.1 | Rendering | Bundle (Three r185 inlined, WebGPURenderer); `RenderPerformanceDirector`, `RuntimeGraphicsContext`, `RenderModelRegistry`, `VisualThemeManager`/Picasso (src) | Yes | Fixture/ownership tests only (hash-gated, currently failing) | WebGPU + WebGL2 fallback, 83–118 fps, 260–310 draw calls, 2.6–5 M tris | Two Three instances; renderer created inside `Game.initialize`; no scene/sim separation | Three.js itself; LOD manifest; quality tiers | 3 |
| 3.2 | Physics | Bundle: terrain height-grid + 2-D radius checks (`blockedAt`, `walkHeightAt`, spatial hash). `src/game/physics/*` (9 files, ~230 lines): fixed-step world, swept spheres, capsule/sphere/AABB narrowphase, 6-iter impulse solver, projectile sweeps | Bundle collision works; src world is a shadow | `physics-world.test.mjs` (determinism, sweep, beam, cone) passes | Collision: no penetration in 4-direction push test; src world tracks 15 bodies at 0.05 ms/step | Dual authority; actors are kinematic mirrors; no rigid-body dynamics in gameplay; variable dt in authoritative loop | `PhysicsWorld`, `CollisionWorld`, `Broadphase`, `Narrowphase`, `ProjectilePhysics`, `CharacterController` are clean, dependency-free and **the best engine seed in the repo** | 6 |
| 3.3 | World / terrain | Bundle: 161×161 `Float32Array` height grid, 5 fixed biome bands, 336 trees / 48–70 rocks, `environment-runtime.js` village/foliage placement, 10 m spatial hash. `src/world/Terrain.js`, `Biomes.js` duplicates. `src/worldclaw/*` (~6 K lines) is a **separate** deterministic world-spec generator gated by `?worldclaw=1` | Yes (single 180 m map, no streaming/chunks) | `check`, `worldclaw.test.mjs` | World ready in 0.2–0.6 s after engine load | Hard-coded 180 m world; biome = x-band; no chunking; WorldClaw output has no authority over live scene | Height-grid sampler (JS + Rust), spatial hash, WorldClaw spec/placement/validator pipeline | 4 |
| 3.4 | Player | Bundle `Player` class (controls, capsule, boat, flight flag, weapons, HQ rig). `src/game/Player.js` = rank table only | Yes | `officer-rank*.test` | Moved 15.25 m in 1.5 s at 10.2 m/s, grounded, camera follows; input via `player.setControl` | Camera-relative movement coupled to camera object; weapons/rank/HUD interleaved | Control-intent pattern (`setControl`) | 3 |
| 3.5 | NPCs | Bundle: enemy roster (6 roles), 15 Hz decisions, residents (54 villagers/travellers), juggernaut patrols, commissioning groups. `AdaptiveSimulationDirector` + blob Web Worker tiering (T0–T4, R0 advice only) | Yes | `adaptive-simulation-director.test` | 13 living enemies (cap enforced: 85 spawn calls added 0), residents 54, tier population T0 13/T1 15/T2 4/T4 36 | Spawn gating undocumented; behaviours are `switch` state strings inside `updateEnemyUnit` (overridden 6×) | Tier scheduler concept; worker classifier | 3 |
| 3.6 | Combat | Bundle: weapons (voidsting/singularity/thunderclaw), projectiles pools, `attack()`, `specialAttack()`, `damageWeaponTarget()`. src: `CombatResult` (read-only publisher), `CombatFeedbackDirector`, `CombatReactionDirector`, `CombatAudioDirector`, `BossSystem` (12 boss configs), `BossEncounterDirector` (state machine), `BossCombat` | Yes | zek20/21/22, boss-encounter, combat-result tests pass | `game.attack()` damaged burrower 206→190; 24 combat results published; boss "Sunscar Colossus" active phase 3, 104 draw calls | Combat rules in bundle; src only observes; boss "manager" is bundle | Boss config data model; combat-result event schema; feedback director pattern | 4 |
| 3.7 | Construction | Bundle `Buildings` class (select/isValidSite/place/utility graph/bridges/boats). `src/game/Buildings.js` = 17-type cost table duplicate | Yes | `check` | Placed Solar Grid via API: site search, costs deducted exactly (24/8/8/12), utility network `operational:1`, record persisted & restored with same id | Rules split between bundle and duplicated table; utility graph tied to Three groups | Cost/prereq table; utility graph concept | 4 |
| 3.8 | Missions | `src/game/CampaignPlan.js`, `Missions.js`, `BossSystem.js` (12 missions × 5 biomes, objectives DSL `biomeVisit/biomeBuilding/boss/…`) + bundle mission catalog (titles inlined in bundle, e.g. "Power the landing zone" is **not** in src) | Yes | 9 campaign tests pass | Mission 1 objectives tracked; QA states `?demo=1&boss=N` work | Two mission catalogs (src DSL + bundle titles/labels) | Objective DSL + `objectiveComplete` evaluator | 5 |
| 3.9 | Animation / assets | `model-runtime-c96327ba.js` (20 loaders, serial queue, GLTF+KTX2+Meshopt, SkeletonUtils clone), `model-lod-manifest.js`, `scripts/build-model-lods.mjs`, `audit-model-animations.mjs` | Yes | `audit:animations` | Officer rig ready (`zeknovaOfficerRig.ready:true`), enemy HQ models swapped in, residents 9 HQ + 45 fallback | **GLTF hang**: root cause unknown; mitigated by `Promise.race` 45 s/3 s/20 s timeouts patched into minified bundles (uncommitted); 7 loader instances; 11× duplicate downloads | LOD manifest + loader queue pattern (once deduplicated) | 3 |
| 3.10 | Audio | `MusicDirector` (authored MP3 score), `CombatAudioDirector` (procedural WebAudio), bundle SFX | Yes | `music-director.test` | Score armed (`zeknovaMusic:"authored-score-v1"`) | Procedural SFX; no spatial audio graph | Music director pattern | 3 |
| 3.11 | Multiplayer | Bundle client → `api/multiplayer.php` (1 Hz POST, presence TTL 20 s, world merge). `src/multiplayer/MultiplayerClient.js` unused duplicate; `network-recovery-certification.test` tests the *unused* src client | Yes (small co-op) | Test covers unused client | Blocked endpoint 9 s → 7 failed, gameplay unpaused, 7 successes in 8 s after unblock | Polling; file lock; no server authority; no delta sync; test covers wrong code | Recovery state machine (src) | 3 |
| 3.12 | Persistence | Bundle save client (`localStorage` mirror + `fetch … keepalive:true` swallowed errors) → `api/save.php`; `GameReset.js`; schema v4 | Partially | `persistence-session-certification` (Node) passes | Restore after reload: building same id, resources ✓, **player XP not persisted (596→12)**. **Silent save loss**: all keepalive saves after 23:29:37 rejected (`Failed to fetch`); identical body without keepalive → 200 rev 24. See `CERTIFICATION_RESULTS.md` §9 | `keepalive` + `catch{}`; 10 localStorage keys (123 KB); no migration framework beyond version list | Save/merge-by-stable-id concept | 3 |
| 3.13 | AI / Sentinel / AZL | `azl/*` (adapter v2, contracts), `src/game/*Integration.js` chain (Identity → Perception → Knowledge → Observation → Legality → PrimeShadow → Commands → Executor R1 canary), `StrategicAI` (MoE-PUCT in bundle worker), `SentinelGoban*`, `sentinel-grid/` (5,350 files, 52 MB, mostly JSON evidence; kernel lives **outside the repo** at `~/Desktop/sentinel-grid`) | Observe-only (R0); recommendations never dispatched | 45 contract/integration tests pass | `zeknovaPrimeAuthority:"r0-awaiting-human-authorization"`, advisories 352, collector `rejected` | 12 K lines of governance code load on every page; hard-coded collector endpoint; order-dependent 10-deep integration chain in `main.js` | Perception-event, knowledge-ledger, legality-mask, shadow-policy schemas; MCTS worker; authority tiers | 5 (as contracts), 2 (as runtime) |
| 3.14 | UI | Bundle HUD (ids), `HudDirector` (re-tiers by CSS classes), `MissionClarityDirector`, `PauseMenuDirector`, `FirstFifteenDirector`, `TeamChat`, `MessageCenter`, `RelationsPanel`, 16 CSS files | Yes | mission-clarity test | HUD, pause menu, onboarding, boss bar, theme selector all rendered | DOM-id coupling to bundle; overlay directors re-scan DOM on timers | None directly | 2 |
| 3.15 | Performance | `RenderPerformanceDirector`, `PerformanceFixtures` (6 frozen scenes + 2 combat), `PerformanceFixtureMaterializer` (`?performanceFixture=`), adaptive budget, hidden `<output>` telemetry | Yes | zek16–19 tests (hash-gated) | Overlays live: frame p99 49.6 ms, worst 250 ms during streaming | Metrics only via hidden DOM text; no exported profiler API | Fixture-based perf harness is genuinely good | 6 |
| 3.16 | Tooling | `?physicsDebug`, `?worldclaw=1` editor (`WorldClawEditor.js`), `?demo=1&mission/boss=N`, `?quality=`, `?safe`, `?webgl`, `?wasm`, `?qaRank=` | Yes | worldclaw test | QA states + safe mode verified | No inspector, no console, no scene serialization; WorldClaw cannot write to live world | WorldClaw spec/validator/critic pipeline | 3 |
| 3.17 | Security | PHP: team-scoped writes, 403 on cross-team, 413 cap, `flock`. Client: trusts server session; all gameplay client-authoritative | Partially | — | — | Client-authoritative combat/economy; committed tokens; keys in deploy dir; `(0,eval)(source)` in portability reports | Team-scoping pattern | 2 |

---

## 4. Duplicated, incomplete, broken, obsolete

**Duplicated**
- Constants: biomes, enemies, buildings, collision radii, rank table, boss configs in `src/` **and** inlined in bundle (regex-checked).
- Three.js r185: inlined in bundle + vendor module.
- Model runtime: 7 module instances via `?v=` imports; `model-runtime.js` (7.7 K) vs `model-runtime-c96327ba.js` (69.8 K).
- Multiplayer client: bundle + unused `src/multiplayer/MultiplayerClient.js`.
- Quality controllers: bundle tiers (low/balanced/high) + `AdaptiveSimulationDirector` (Ultra…Emergency).
- Physics: bundle 2-D collision + src fixed-step shadow world.
- Mission catalog: src DSL + bundle titles/labels.
- Forest command integration v1 + v2 both loaded (`main.js` imports both; only v2 installed).

**Incomplete**
- GLTF hang root cause (timeouts only). PLAY_README claims a fix; the diff shows `Promise.race` guards.
- `?wasm` path untested in this audit; disabled by default.
- Four gameplay bridges referenced by `main.js` do not exist (`HarvestRewards`, `BossReplaySettings`, `StructureDesign`, `DefenseTowers`) → 4×404 every load.
- `assets/ASSET_REGISTRY.json` missing.
- Player XP not in save schema.

**Broken (as of working tree)**
- Golden-hash certification (3 tests) — regressed by uncommitted bundle patch.
- Autosave under Chrome keepalive budget exhaustion (silent, session-long).
- `start-local.mjs` enrollment path (static analysis).
- In-page `bridge.dispose()/start()` restart orphans every src director (all bound to the disposed `Game`).

**Obsolete / transitional**
- `src/runtime-reconstructed/**` (byte slices), `artifacts/runtime-reconstruction/`.
- `docs/governance/evidence/w0p-source-inventory/assets/index-02987539.js` (a third copy of the bundle, 1.1 MB).
- `Archive.zip`, `stable-fast-3d/` submodule (1.7 GB) — not part of the runtime.
- `sentinel-grid/live-parity/` 5,307 JSON evidence files committed to the game repo.

---

## 5. Evidence index
- Hashes: `shasum -a 256 assets/*.js` vs `git show HEAD:…` (this audit, §1.2).
- Bundle ownership: `grep` counts in §2.1; `node` prototype-override census (195/91/39).
- Runtime: Playwright session 2026-10-20T06:25–06:51Z, Chrome 155, WebGPU; logs and screenshots moved to `/tmp/zge00-playwright-evidence/` (outside the repo).
- Tests: `/tmp/zeknova-tests.log` — 86 files, 83 pass, 3 fail (hash), total wall time < 6 s.
- Server: `/tmp/zeknova-php.log`; `data/{save,team,room,profile}-*.json` written during the session.
