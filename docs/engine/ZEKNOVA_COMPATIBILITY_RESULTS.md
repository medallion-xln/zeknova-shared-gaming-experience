# ZekNova Compatibility Results (ZGE-01C/F)

All results from the Playwright browser session unless marked AUTOMATED. The authoritative bundles were **not modified** (`git diff --stat assets/` unchanged from ZGE-00: only the pre-existing uncommitted timeout patch).

## Director inventory (37 plugins; 31 post-runtime)
| Phase | Plugins | Restart class |
|---|---|---|
| pre-runtime | legacy-gameplay-bridges, legacy-source-modules, legacy-styles, team-chat, hud-director | page-only |
| runtime | legacy-runtime (`src/game/Game.js` unchanged, `failurePolicy: fatal`) | page-only |
| post-runtime, in-page restartable (9) | music, campaign-finale, boss-encounter, physics-bridge, live-parity, live-parity-closure, forest-scenarios, prime-policy-evaluation, strategic-ai | disposable, no page-only dependents, 0 listener leak measured |
| post-runtime, disposable but excluded (12) | render-performance, adaptive-runtime, strategic-state-clock, identity, perception, knowledge, faction-observation, forest-actions, observation-legality, prime-shadow, relations-panel, forest-commands-v2 | disposable, but page-only plugins (graphics-ownership, picasso-visual, prime-executor) depend on them → `reinstall()` refuses |
| post-runtime, page-only (10) | first-fifteen (leaks 5 listeners), graphics-ownership, worldclaw, pause-menu, mission-clarity, combat-feedback, game-mode, prime-executor, goban-shadow, picasso-visual | no complete teardown |

## Gameplay regression battery (kernel-hosted)
| Area | Result | Detail |
|---|---|---|
| Movement + camera | pass | 9.09 m / 1.5 s at the ZGE-00 reference point (player in boat mode); 1.56 m / 1.5 s at the new team's spawn (water drag at that spot — same value in native and neural-mock runs); camera followed; grounded |
| Collision | pass | 4-direction push into r = 3.62 m obstacle: no penetration |
| Combat | pass | juggernaut 309 → 292 HP via `game.attack()`; +3 combat results published |
| Construction | pass | fresh team correctly short on iron/credits; after a QA resource grant: Solar Grid placed, costs 24/8/8/12 deducted, utility `operational:1` |
| Persistence | **unchanged (pre-existing defect C2)** | autosave keepalive POST → `Failed to fetch`; identical body without keepalive → 200 revision 24; building restored after full-page restart; 18 `zeknova.*` localStorage keys |
| Multiplayer recovery | pass | endpoint refused 8 s → 8 failures, game unpaused, kernel errors 0; 6 successes in 7 s after |
| Missions / bosses | pass | mission 1 objectives tracked; `?demo=1&boss=1` → Sunscar Colossus active (768 HP), QA state global present, 119.5 fps |
| Safe mode | pass | `?safe=1` → WebGL 2 backend, NATIVE presentation, 38 plugins, 90.8 fps |
| Sentinel collector | opt-in | `dataset.sentinelCollector = "disabled"` by default; the ~25 `ERR_CONNECTION_REFUSED` errors per session from ZGE-00 are gone; `?sentinelCollector=1` restores it |
| Console | unchanged minus collector | 4 pre-existing 404s (phantom bridges), `Multiple instances of Three.js`, 3× KTX2 loader warnings, `THREE.Clock` deprecation |

## Presentation modes
| Mode | Result |
|---|---|
| NATIVE | default; `NativeRenderer` reports shared instance, `ownsContext:false`, backend webgpu/webgl2, draw calls; zero capture cost |
| REFERENCE | one capture 1280×720 in 56 ms (first) / 11 ms (steady), metadata complete, 100 % non-black |
| NEURAL (mock) | 132 captured / 131 generated / 131 presented / 0 stale over ~18 s at 10 fps; latency p50 90 ms, p95 101 ms; queue max depth 1/4; presented events ordered with simulation time; overlay 864×480 with badge "NEURAL (MOCK — not model inference)"; frame p99 25 ms vs 15 ms native (capture ≈ 11 ms × 10/s); movement continued |
| NEURAL fallback | forced backend stall → NATIVE within 3.5 s (reason recorded), overlay hidden, game unpaused, movement intact |
| NEURAL with absent service | `?neural=matrix-game-4` with nothing on :8025 → guard `degraded (Failed to fetch)`, session `failed`, presentation NATIVE, 38 plugins, 117.6 fps |

## Preserved behaviours
Bootstrap and authentication (`LoginPage.js` untouched), `Game.js` untouched, mission/boss behaviour, multiplayer and persistence pathways, Prime R1 controller surface (`status/dryRun/killSwitch` only — governance test re-pointed to the registry with identical assertions), `window.ZekNovaSource`, all `globalThis.ZekNova*` publications.

## Legacy Node suite
86 files: 83 pass, 3 fail — the same three golden-hash tests as ZGE-00 (bundle working-tree hash ≠ pinned). `npm run check` passes. `sentinel-prime-r1-readiness` passes after re-pointing (it had read `src/main.js`).

## ZGE-02 addendum (2026-10-20)
- Director inventory is now 39 plugins (+2 pre-runtime: `persistence-transport`, `asset-consolidation`) + the presentation plugin = 40 started. Restart classes: 28 disposable/in-page restartable, 11 page-only (see `ENGINE_LIFECYCLE_CERTIFICATION.md` §4).
- Persistence: the keepalive defect is fixed at the fetch boundary (`PERSISTENCE_INTEGRITY.md`); XP survives save/restore.
- Assets: import map collapses the six `model-runtime` variants to one instance; GLB duplicates 31→20 requests for 15→20 unique files; KTX2 duplicate-loader warnings 3→1; transcoder wasm 2→1.
- Regression battery re-run on the kernel entry: all pass (startup 232–301 ms warm; 118.8 fps; keyboard movement 8.2 m/s). Console unchanged minus the collector errors.
