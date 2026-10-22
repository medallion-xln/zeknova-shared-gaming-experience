# ZGE-00 · Live Game Certification Results

Session: 2026-10-20 06:23–06:51 UTC (local clock 2026-10-19 23:23) · Server: `npm run dev` → `php -S 127.0.0.1:8790`, `ZEKNOVA_ENV=local` (demo auth) · Browser: Playwright-driven Chrome 155, macOS, 10 cores, DPR 2, viewport 1200×897, 120 Hz display, WebGPU available.
Legend: **OBSERVED** = measured in this session. **EXTRAPOLATED** = inferred from code or partial evidence. **NOT TESTED** = out of reach in this session.

---

## 0. Test-suite baseline (Node)
| Metric | Value |
|---|---|
| Files run | 86 (`tests/*.test.mjs` 40, `tests/*.test.cjs` 45, `picasso-performance-report.mjs`) |
| Pass / fail | **83 / 3** |
| Failures | `runtime-reconstruction`, `renderer-ownership-certification`, `runtime-graphics-context` — all `ERR_ASSERTION` golden hash `7a9cdfee…` ≠ working tree `25665bd8…` |
| Wall time | < 6 s total; slowest `officer-rank-parity` 1.5 s |
| `npm run check` | passes (regex parity against bundle text) |
| Browser tests in repo | none |

Note: `npm test` is a single `&&` chain and stops at the first hash failure, so the documented gate currently reports red.

---

## 1. Launch and first playable frame — OBSERVED
Login (PHP demo session): enrollment form → `POST /api/session.php` 201 → "Crew cleared" → LAUNCH.

| Run | Mode | Click → first `startup-stage` | Click → `gameplay-ready` | World build (`elapsedMs`) | Backend |
|---|---|---|---|---|---|
| 1 (cold) | default | 9.7 s | **10.3 s** | 582 ms | WebGPU |
| 2 (warm reload) | default | 7.2 s | **7.5 s** | 232 ms | WebGPU |
| 3 (QA boss) | `?demo=1&boss=1` | — | playable (probe at ~90 s) | — | WebGPU |
| 4 | `?safe=1` | 10.1 s | **10.3 s** | 293 ms | WebGL 2 |
| In-page restart | `bridge.dispose()` → `bridge.start()` | — | **1.7 s** | 128 ms | WebGPU |

Interpretation: 7–10 s of every launch is **before** the world starts (bundle fetch/parse 1.4 MB, 51 dynamic imports, WebGPU adapter/device init, integration chain). World generation itself is 0.2–0.6 s. Startup diagnostics always report `wasm:"disabled-for-diagnostics"`.

Console at first playable (run 1): 5 errors (4× 404 missing bridge modules, 1× collector `ERR_CONNECTION_REFUSED`), 7 warnings (`Multiple instances of Three.js`, 3× `Multiple active KTX2 loaders`, `THREE.Clock deprecated`, bridges-unavailable, collector backoff). **Zero uncaught exceptions, zero unhandled rejections** (probe on `error`/`unhandledrejection`).

## 2. World generation — OBSERVED
`terrain-ready: 336 trees · 48 rock formations`; later overlay reports 70 rocks (desert 25, highlands 22, arctic 15, forest 4, wetlands 4), 54 residents (24 villagers, 30 travellers), 98 environment obstacles, 1,573 scene meshes, 1,118 geometries, 664 materials, 213 textures, 7.7 M scene triangles. Biomes initialised as five x-bands (`Biomes.js` / bundle).

## 3. Player movement and camera — OBSERVED
`player.setControl("forward", true)` for 1.5 s: 15.25 m travelled (configured 10.2 m/s → 15.3 m expected), final y 9.09 vs terrain 9.08 (grounded), camera position changed (follow confirmed). Strafe moved 1.1 m in 0.7 s. Movement is camera-relative (heading rotates with the explore camera).
First attempt returned 0 m because the **pause menu had opened on its own** (`game.paused:true`, "SIMULATION PAUSED · Field command interface"); resuming via the menu button restored input. Cause not isolated (likely window blur/visibility handling under automation). EXTRAPOLATED.

## 4. Physics and collision — OBSERVED
Largest environment obstacle (r = 3.62 m). Player placed 1.2 m outside, pushed in each of 4 control directions for 0.7 s: moved 6.38 / 0.26 / 1.45 / 2.31 m, final distance to centre 10.8 / 5.04 / 5.21 / 5.93 m, **no penetration** in any direction; the direction aimed at the obstacle was clamped to 0.26 m. `terrain.blockedAt` exists on the bundle's terrain prototype (not reachable by name from the instance).
Shadow physics (`ZekNovaPhysics.report()`): fixedHz 60, 15 bodies, avg 1.1–1.3 contacts/step, 0.053 ms/step, 29–38 clamped frames over the session. Determinism of the shadow world: covered by `physics-world.test.mjs` (same outcome at 60 Hz vs 30 Hz render cadence). Authoritative loop: variable dt — determinism NOT TESTED and not expected.

## 5. Asset loading and animation — OBSERVED
Officer rig: `{"rank":"ensign","ready":true,…weaponMounts voidsting/singularity/thunderclaw, animations rifleBrace/carryHeavyWeapon}`. Enemies: 13/14 `hqLoaded:true` (burrower uses fallback). Residents: 9 HQ loaded, 45 fallback visible. Network: every referenced GLB returned 200. **Duplicate fetches:** `zeknovan-juggernaut-walk.{medium,low}.glb` ×11, `zeknovan-juggernaut-run.glb` ×11, `model-runtime-c96327ba.js` ×3 distinct `?v=` variants within 10 minutes; `basis_transcoder.wasm` ×3.

### 5.1 GLTF `loadAsync()` hang — root cause status
- Evidence available: uncommitted diff adds `Promise.race` 45 s timeouts around `loader.loadAsync` in `model-runtime-c96327ba.js` and `model-runtime.js`; bundle `loadAOEnvironment` races `player.hqReady` with a 3 s timer; `initialize` races `loadAOEnvironment()` with a 20 s `'ao-timeout'`; enemy/juggernaut loaders `await this.environmentReady`.
- Readiness chain (bundle): `player.hqReady → loadAOEnvironment → environmentReady → loadJuggernautModel/loadEnemyModel`. One stuck GLB parse on the serial queue previously blocked the entire chain.
- In this session no timeout fired (all stages completed, no "HQ asset timeout" warning), so the hang did **not reproduce**.
- Verdict: **mitigated, not fixed.** No root-cause record exists in docs or tests; the mitigation lives only in uncommitted minified edits that also break the golden-hash gate. Plausible contributing causes (EXTRAPOLATED): seven independent loader/queue instances contending for KTX2 transcoder workers, and `configureKtx2Loader()` depending on `globalThis.ZekNovaGame.renderer` existing at first load.

## 6. Combat and enemies — OBSERVED
Nearest living enemy (burrower, 206.25 hp) at 6 m; six `game.attack()` calls → 190.25 hp (−16). `ZekNovaCombatResults.snapshot().resultCount` 24, feedback snapshot has `feedback/reactions/audio`. Enemies attack the player continuously: player health observed at 1, 17, 18, 28, 46, 14, 10 at different probes; the HUD showed **Health 1** at first playable with ten juggernaut patrols on the local map. Living-enemy cap: 85 `spawnEnemy(true, role)` calls added 0 living enemies (count stayed 13) — spawn is gated by rules not documented in source.

## 7. Construction and resources — OBSERVED
`buildings.select("power")` → site search with `isValidSite(type,x,z,terrain)` found a site at 3 m → `place({x,z,y}, resources, terrain)` returned a record (health 1000, uuid id). Resources deducted exactly per `src/game/Buildings.js`: minerals 24, iron 8, biomass 8, credits 12. `utilityNetworkStatus`: `operational:1, disconnected:0`. Scene group children 3. Harvest/mine loop also ran (32 trees harvested by session end, resources rising).

## 8. Missions, objectives, bosses — OBSERVED
Mission 1 ("grid" / "Bring the lights online") active; `BossEncounterDirector` state `WAITING_FOR_PREREQUISITES` with 8 missing objectives listed. QA state `?demo=1&boss=1`: `ZekNovaGameplayState.snapshot()` → `{kind:"boss", bossId:"desert_sunscar_colossus"}`; boss manager `active:true`, HQ model loaded, phase advanced to `phase_3` (276/818 then 156/818 hp) with "Solar Aegis" shield telegraph. Boss arena frame sample: 106.9 fps, p50 8.3 / p95 16.6 / p99 24.8 / max 149.7 ms, 104 draw calls, 2.35 M tris, heap 373 MB.

## 9. Saving, loading, restoration — OBSERVED (with a defect)
- Explicit `game.save()`: 811 ms (800 ms debounce + request). Payload 4,885 B, schema v4, keys `version,user,biomeSeed,player,resources,indicators,buildings,phase,civilizationScore,worldProgress,missionStats,combat,diplomacy,updatedAt`.
- Server files written: `save-*.json` (personal), `team-*.json` (shared), `room-*.json`, `profile-*.json`.
- **Defect — silent autosave loss.** PHP log shows the last `POST /api/save.php` at 23:29:37; afterwards the client issued ~90 save POSTs that never reached the server (Playwright shows them with no response). Controlled experiment with the identical 4,883-byte body: `fetch(…, {keepalive:true})` → `TypeError: Failed to fetch` in 1 ms; `fetch(…, {keepalive:false})` → **200 `{revision:24}`**. The bundle's save is `fetch(... keepalive:!0 ...)` inside `try{…}catch{}`, so the player sees no error. Mechanism (EXTRAPOLATED): Chrome's shared in-flight keepalive budget (64 KB) exhausted by earlier keepalive requests that never completed; once exhausted every later keepalive fetch is rejected for the life of the page. Whether plain (non-automated) Chrome reaches the same state needs confirmation, but the code path is identical.
- Restore after full reload: building restored with identical id and position; resources matched except production drift (energy +446 from the new Solar Grid, biomass −3.3); `missionStats` 12 keys; 32 harvested trees. **Player XP 596 → 12** (XP is not in the save schema; rank progression lives in `profile-*.json`).

## 10. Multiplayer connection and recovery — OBSERVED
Baseline: `POST /api/multiplayer.php` ~1/s, 200; room file revision 36→54 during session; "1 UNIQUE PLAYER ONLINE". Outage test: endpoint aborted (`connectionrefused`) for 9 s → 7 failed attempts, game stayed unpaused and interactive; after unblocking, 7 successful posts within 8 s. Presence/room re-established without reload. Note: `tests/network-recovery-certification.test.mjs` exercises `src/multiplayer/MultiplayerClient.js`, which the bundle does not use; the live client is a different implementation.

## 11. Performance under increasing entity counts — PARTIAL
| Scene | fps (mean) | p50 | p95 | p99 | max | draw calls | tris | heap |
|---|---|---|---|---|---|---|---|---|
| First playable (streaming, modal open) | 83.2 | 9.4 | 17.7 | 25.1 | 110 | 308 | 4.98 M | 359 MB |
| Steady state, 13 enemies | 116–118 | 8.3 | 9.2–9.3 | 10.3–16.6 | 25 | 259–292 | 2.66 M | 378 MB |
| +15 / +45 / +85 spawn calls (cap held at 13 living) | 118.7 / 109.4 / 116.2 | 8.3 | 9.2 / 16.4 / 9.3 | 9.5 / 17.1 / 16.6 | 25 / 58 / 33 | 280–292 | 2.66 M | 366–379 MB |
| Boss arena (QA) | 106.9 | 8.3 | 16.6 | 24.8 | 150 | 104 | 2.35 M | 373 MB |
| Safe mode (WebGL 2, no models) | 81.4 | 8.9 | 17.1 | 17.6 | 59 | 313 | 0.21 M | 89 MB |

Built-in overlays over a longer window (1,800 samples): average 13.4 ms, median 9.1, p95 24.9, **p99 49.6, worst 250 ms**, 397 frames >16.7 ms, 6 frames >100 ms; Picasso stress test recorded MIN_OBSERVED_FPS 4.1 during streaming. Entity scaling beyond the enemy cap is NOT TESTED (spawn API gated); the `?performanceFixture=` materializer is the supported path and was not run in this session.

## 12. Repeated initialization, shutdown, restart — OBSERVED
`ZekNovaLegacyBridge.dispose()`: 823 ms, `ZekNovaGame → null`, `disposed:true`, old renderer object retained by the old instance, one canvas remains. `bridge.start(user)`: new `Game` instance, gameplay-ready in 1,672 ms, building restored, 8→12 enemies, WebGPU. Heap 350 → 336 → 341 MB (no growth over one cycle; multi-cycle leak NOT TESTED). Renderer memory after restart: geometries 621→511, textures 102→9 (new renderer).
**Defect:** every src director still references the disposed instance after restart — `ZekNovaGraphics.graphics.game`, `registry.game`, `CombatFeedback.director.game`, `CombatResults.publisher.game`, `FirstFifteen.game`, `Music.director.game`, `RelationsPanel.game` all `!== globalThis.ZekNovaGame`. HUD still renders (bundle-owned), but src overlays, combat feedback and telemetry are orphaned. Restart is therefore only safe via full page reload.

## 13. Failure isolation — OBSERVED
- Missing optional modules (4× 404) → warning, game continues.
- Sentinel collector endpoint down → warning + backoff, game continues.
- Multiplayer endpoint down → game continues.
- `?safe=1` → WebGL 2, no GLB models/environment, playable in 10.3 s.
- Static imports at the end of `main.js` (`Stage2FRuntimeCollectorBinding.js`, `sentinel-grid/live-parity/runtime-collector/Stage2FExactProviderBridgeSafe.js`) are the only non-guarded dependencies: a missing file there would blank the page (EXTRAPOLATED from `main.js` comment and ES module semantics).

## 14. Summary of defects found in certification
| # | Severity | Finding | Evidence |
|---|---|---|---|
| C1 | Critical | Golden-hash gate red; uncommitted edits to minified bundles | §0 |
| C2 | Critical | Silent autosave loss via keepalive fetch + swallowed error | §9 |
| C3 | High | Two Three.js instances, 7 model-runtime instances, 11× duplicate GLB downloads | §5 |
| C4 | High | In-page restart orphans all src directors | §12 |
| C5 | High | GLTF hang mitigated by timeouts only; no root cause | §5.1 |
| C6 | Medium | Player XP not persisted | §9 |
| C7 | Medium | p99 25–50 ms and 100–250 ms spikes during streaming; 5 M triangles at first frame | §11 |
| C8 | Medium | Player repeatedly at 1 HP at spawn (10 juggernaut patrols near start) | §6 |
| C9 | Low | 4× 404 bridges, collector polling errors, deprecated `THREE.Clock` | §1 |
| C10 | Low | Pause menu opened without user input under automation | §3 |
