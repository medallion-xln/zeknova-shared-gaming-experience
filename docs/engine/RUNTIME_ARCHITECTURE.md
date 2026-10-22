# ZGE-00 · Runtime Architecture (as built)

This document reconstructs how ZekNova actually starts and runs today, from `index.html` to the first playable frame, and names every module on that path. Source of truth: `src/main.js`, `src/game/Game.js`, `src/ui/LoginPage.js`, `api/*.php`, and the minified bundle (identifiers quoted as the bundle uses them).

---

## 1. Initialization sequence

```
index.html  (meta zeknova-build 2026-08-27-score1)
  └─ <script type=module src="./src/main.js?v=score1">
       ├─ [static] import LoginPage.js
       ├─ [static] import ./game/Stage2FRuntimeCollectorBinding.js   ← unguarded, polls 127.0.0.1:43127 every 5 s
       ├─ [static] import ../sentinel-grid/live-parity/runtime-collector/Stage2FExactProviderBridgeSafe.js  ← unguarded
       └─ launch()
            1. loadGameplayBridges()   5 dynamic imports, 4 missing → warn (HarvestRewards, BossReplaySettings, StructureDesign, DefenseTowers)
            2. runLoginPage(root)      GET /api/session.php → {user|null, auth{mode:demo|medallion}}
                 demo:      enrollment form → POST /api/session.php (201) → "LAUNCH"
                 medallion: Medallion widget (/cdn/medallion-auth.js) → reload → enrolled → "LAUNCH"
            3. loadGameStyles()        6 stylesheets injected
            4. Promise.all(28 dynamic imports)  Game, Player, Enemies, Missions, Buildings, Terrain, Collision, Biomes,
                                                MultiplayerClient, MessageCenter, TeamChat, StrategicAI, RelationsPanel,
                                                + 15 Sentinel/AZL integration modules
               window.ZekNovaSource = Object.freeze({...})   ← published, never read by the bundle
            5. TeamChat.install/mount ; HudDirector.arm()
            6. new Game().start({user})
                 ├─ createStartupCover()  (stages: engine → world → ready)
                 ├─ importRuntimeWithSession(assets/index-02987539.js?v=automatic-boss-physics1)
                 │     fetch is temporarily monkey-patched so the bundle's GET /api/session.php sees the already-authenticated user
                 │     bundle top-level: Three.js r185 inline, 383 classes, 195 prototype patches applied in order
                 │     publishes globalThis.ZekNovaLegacyBridge = freeze({ start(user), dispose() })
                 ├─ bridge.start(user)
                 │     new zR (Game)  →  initialize()  [overridden 18×; each layer awaits the previous]
                 │        ├─ renderer = new WebGPURenderer({antialias, forceWebGL: ?safe|?webgl}); await renderer.init()
                 │        ├─ wasm: import ./wasm/zeknova_core.js only if ?wasm     (stage "wasm")
                 │        ├─ terrain = new PR (height grid 161×161, trees, rocks, spatial hash)   (stage "terrain", "terrain-ready")
                 │        ├─ player = new Player (procedural mesh; hqReady = import model-runtime… loadEnsignModels())
                 │        ├─ buildings, simulation, missions, diplomacy, AO state (localStorage), bossManager
                 │        ├─ load save: GET /api/save.php?team=…  → apply buildings/worldProgress/missionStats
                 │        ├─ multiplayer client: POST /api/multiplayer.php every ~1 s
                 │        ├─ zkAOInitialize layer: environmentReady = race(loadAOEnvironment(), 20 s)
                 │        │      loadAOEnvironment: race(player.hqReady, 3 s) → import environment-runtime.js → createAreaEnvironment()
                 │        ├─ enemies: spawnEnemy ×3 (delay 2) → loadEnemyModel/loadJuggernautModel after environmentReady
                 │        ├─ animate() loop starts; HUD built by id
                 │        └─ dispatch "zeknova:gameplay-ready" {elapsedMs, wasm, safeMode, models, environment, trees, rocks}
                 └─ startup.finish(); dispatch "zeknova:ready"
            7. 24 try/catch director installs, in order:
                 FirstFifteenDirector → MusicDirector → CampaignFinale → RenderPerformanceDirector →
                 {RuntimeGraphicsContext, RenderModelRegistry, PerformanceFixtureController, Materializer} →
                 AdaptiveSimulationDirector (+ blob worker) → WorldClawEditor (?worldclaw=1) → PauseMenuDirector →
                 MissionClarityDirector → {CombatResultPublisher, CombatReactionDirector, CombatAudioDirector, CombatFeedbackDirector} →
                 GameModeDirector → BossEncounterDirector → PhysicsRuntimeBridge (2nd rAF loop) → StrategicStateClock →
                 IdentityIntegration → PerceptionEventIntegration → FactionKnowledgeIntegration → FactionObservationIntegration →
                 ForestDefensiveActionIntegration → ObservationLegalityIntegration → PrimeShadowIntegration (+ runLocalShadow) →
                 RelationsPanel → ForestDefensiveCommandIntegrationV2 → SentinelPrimeExecutor + R1 canary (awaited) →
                 LiveParityIntegration → LiveParityClosureIntegration → ForestObjectiveScenarioIntegration →
                 SentinelPrimePolicyEvaluationIntegration → StrategicAI.install (awaited) → SentinelGobanShadowIntegration →
                 {VisualThemeManager, Picasso, PicassoCombatCertification, SentinelExpertRouter}
```

Measured: steps 1–5 ≈ 7–10 s (dominated by bundle fetch/parse and WebGPU init), step 6 world build 0.2–0.6 s, step 7 runs after gameplay-ready and is not on the critical path to the first frame.

## 2. Participating modules (startup critical path)
| Order | Module | Blocking? | Failure effect |
|---|---|---|---|
| 1 | `src/main.js` | yes | page blank |
| 2 | `src/ui/LoginPage.js` + `api/session.php` (+ `api/bootstrap.php`) | yes | "Login service unavailable" |
| 3 | `src/game/Stage2FRuntimeCollectorBinding.js`, `sentinel-grid/…/Stage2FExactProviderBridgeSafe.js` | yes (static import) | page blank if missing |
| 4 | 28 dynamic imports | yes (`Promise.all`) | `launch()` rejects → fatal screen |
| 5 | `src/game/Game.js` | yes | fatal screen |
| 6 | `assets/index-02987539.js` | yes | fatal screen |
| 7 | `assets/wasm/zeknova_core.js` | no (opt-in) | JS fallback |
| 8 | `assets/model-runtime-c96327ba.js` (×7 instances) | partially (3 s race) | procedural player/enemies |
| 9 | `assets/environment-runtime.js` | partially (20 s race) | bare terrain |
| 10 | `api/save.php`, `api/multiplayer.php`, `api/progression.php` | no | offline play, no persistence |
| 11 | `src/game/*Director.js` ×24 installs | no | feature missing, warning |

## 3. Dependency graph (ownership and shared state)

```
                 ┌──────────────────────────────── globalThis ────────────────────────────────┐
                 │ ZekNovaLegacyBridge  ZekNovaGame  ZekNovaAuth  ZekNovaStartupDiagnostics      │
                 │ ZekNovaPhysics  ZekNovaGraphics  ZekNovaCombatResults  ZekNovaCombatFeedback   │
                 │ ZekNovaSentinelPrimeR1  ZekNovaRelationsPanel  ZekNovaVisualThemeManager …(61) │
                 └───────────────▲───────────────────────────▲────────────────────────────────┘
                                 │ writes                     │ reads 77 fields, patches 5 methods
   assets/index-02987539.js ─────┘                            └───── src/game/*Director.js, src/game/*Integration.js
   (Game zR, Terrain PR, Player, Buildings, Simulation,                      │
    Missions, BossManager, HUD, save client, mp client,                       │ DOM ids / CSS classes
    MCTS worker)                                                              ▼
          │ dynamic import (7 ?v= variants)                           bundle HUD <div id=…>
          ├─► model-runtime-c96327ba.js ──► vendor/three.module.min.js (2nd Three)
          ├─► environment-runtime.js  ──► vendor/three.module.min.js
          └─► wasm/zeknova_core.js (opt-in)
   api/*.php ◄── fetch (session, save keepalive, multiplayer 1 Hz, progression, ai-advisor)
   localStorage (10 keys) ◄── bundle + directors        sessionStorage ◄── multiplayer client id, boss run
```

Shared mutable state has **no single owner**: the bundle's `Game` instance is mutated by the bundle, by `PhysicsRuntimeBridge` (knockback, projectile removal, player health), by `GameModeDirector`, `StrategicAI`, `IdentityIntegration` and `AdaptiveSimulationDirector` (method wrapping), and indirectly by DOM-driven directors.

## 4. Failure propagation
- Hard failures (page blank / fatal screen): `main.js` module graph, the 28-import `Promise.all`, bundle import, `bridge.start` rejecting (no user), WebGPU **and** WebGL both unavailable.
- Soft failures (warn and continue): every director, missing bridges, collector, multiplayer, save (silently — see certification §9), model timeouts (3 s / 20 s / 45 s races).
- Restart: `bridge.dispose()` nulls `ZekNovaGame` and disposes the bundle game; directors are not re-bound (verified), so the only lifecycle-safe restart is `location.reload()` (which `GameReset.js` uses).

## 5. Time and loops
| Loop | Owner | Step | Notes |
|---|---|---|---|
| Render/simulation | bundle `animate` | variable, clamped 50 ms | Authoritative; paused → render only |
| Shadow physics | `PhysicsRuntimeBridge.tick` | fixed 1/60 s accumulator, ≤5 substeps | Kinematic mirrors; wraps three bundle update methods |
| Enemy AI | bundle | 15 Hz decisions, interpolated | `AdaptiveSimulationDirector` recommends tiers only |
| Adaptive director | rAF sampler | per frame | Quality tier + save batching + HUD throttle |
| Multiplayer | bundle client | ~1 s | POST room snapshot |
| Autosave | bundle save client | 800 ms debounce | keepalive fetch |
| Strategic AI | blob Web Worker | per request | UCT MCTS ≤128 sims depth 6 |
| Sentinel collector | `setInterval` 2 s bind + 5 s sample | — | Loopback endpoint |

## 6. Verdict on "bundles vs source"
The generated bundles **remain authoritative** over every gameplay system. Readable source owns authentication, bootstrap, data tables (duplicated), observation/telemetry, AI governance contracts, a shadow physics world, WorldClaw tooling and UI re-skinning. No readable module can run a frame of ZekNova without the bundle, and the bundle cannot be rebuilt from anything in the repository.
