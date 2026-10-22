# ZGE-01 Implementation Report — Matrix-Game 4 Architecture Integration

Date: 2026-10-20 · Baseline HEAD `138220f` (unchanged; nothing committed) · Status: **PARTIAL** (all engine/compat/rendering/neural deliverables implemented and verified; real neural inference is a separate, unmet gate by design).

Evidence classes: **IMPL** = implemented code · **AUTO** = Node tests (`npm run test:engine`, 38/38) · **BROWSER** = Playwright-verified · **PLAN** = documented, not built.

## ZGE-01A Baseline protection — done
HEAD `138220f`; working tree carried the pre-existing uncommitted bundle timeout patch plus `docs/engine/`; no concurrent writers (only this session's harness and the Playwright MCP held the repo cwd); PHP on :8080 belongs to another project; legacy suite baseline 83/86 (3 golden-hash failures); upstream pinned at `c7a88bfc` in `/tmp/matrix-game-upstream`.

## ZGE-01B Engine kernel — IMPL + AUTO
`packages/core` — `EngineKernel` (create/initialize/start/pause/resume/stop/dispose, guards, systems, diagnostics, snapshot), `EngineClock` (owned fixed-step with interpolation, max catch-up, pause; **delegated** mode that never steps), `LifecycleManager` (explicit state table, idempotent, atomic), `PluginManager` (deps, optional deps, cycle/missing/duplicate rejection, failure isolation, reverse disposal, subset `reinstall` with dependent refusal), `EngineMetrics` (counters/gauges/timers p50–p99, errors, recoveries, transitions), `EngineEvents` (owned subscriptions, isolated handler errors), `World` (minimal). JS ESM + `index.d.ts`; zero dependencies. 14 tests.

## ZGE-01C Legacy compatibility — IMPL + AUTO + BROWSER
`packages/zeknova-compat` — `LegacyRuntimeHost` (uses `src/game/Game.js` unchanged; ownership diagnostics), director registry (37 plugins: 6 pre-runtime/runtime + 31 post-runtime, verbatim port of the `main.js` chain with declared `requires/optional`, restart classification), `installZekNovaCompat()` (inventory, `inPageRestartable()`, `restartDirectorLayer()`, `requestFullPageRestart()` + auto-launch marker), leak probe. `src/main.js` rewritten from 579 lines to a 62-line kernel bootstrap; authentication/login untouched. 5 tests + browser certification (`ENGINE_LIFECYCLE_CERTIFICATION.md`, `ZEKNOVA_COMPATIBILITY_RESULTS.md`).

## ZGE-01D Renderer contracts — IMPL + AUTO + BROWSER
`packages/rendering` — contracts (`RenderBackend`, `SceneCaptureBackend`, `NeuralRenderBackend`, frame/metadata schemas with versioned extensions), `NativeRenderer` (shared legacy renderer, no new context), `ReferenceRenderer` (clean capture, overlay filter, metadata), `FramePreprocessor` (upstream-compatible geometry, tensor normalisation, envelope). 7 tests; browser: 1280×720 capture at ~11 ms on WebGPU with complete metadata.

## ZGE-01E Neural rendering foundation — IMPL + AUTO + BROWSER (mock)
`packages/neural-rendering` — `NeuralRenderer` (capture → backend → bounded display queue → presenter; backpressure, stall, discontinuity resets, finite session budget, HUD-sync `neural:presented`), `FrameSequencer`, `RenderSession`, `BoundedQueue`, `PresentationController` (NATIVE/REFERENCE/NEURAL, mock always labelled), `MockNeuralBackend` (functional, temporal state, fault injection), `MatrixGame4Adapter` (upstream HTTP contract + proposed bridge; loopback-only), `CanvasPresenter`, `detectLocalCapabilities`, engine plugin. 11 tests incl. a loopback test service; browser: 131/131 mock frames presented in order, fallback verified.

## ZGE-01F Browser verification — BROWSER
Launch, movement, collision, combat, construction, missions/boss, persistence (unchanged defect), multiplayer recovery, native rendering, WebGL safe mode, neural-absence fallback, plugin lifecycle, leak probe — all recorded in `ZEKNOVA_COMPATIBILITY_RESULTS.md`.

## Measurements (same machine, Chrome 155, WebGPU, click-anchored)
| Metric | Legacy main.js (HEAD) | Kernel main.js | Note |
|---|---|---|---|
| Warm click → gameplay-ready | 321 / 262 ms | 293 / 306 ms | ZGE-00's 10.3 s / 7.5 s were contaminated by tool latency between probe and click; superseded |
| Kernel initialize (38 plugins) | — | 1,451–1,602 ms | post-runtime directors install after gameplay-ready |
| Steady fps / p99 | 115.7–117.8 / 10.4–16.8 ms | 117.7–118.2 / 14.8–15.2 ms | no regression |
| Kernel per-frame cost (p99) | — | 0.10 ms | delegated loop + metrics |
| Capture overhead | — | 10.8–11.2 ms per 1280×720 capture; p99 25 ms at 10 captures/s | zero when NATIVE |
| Director-layer restart | — | 165–187 ms, Δ listeners 0 | 9 directors |
| Full-page restart | — | auto-launch at 543 ms, ready +374 ms | marker consumed once |
| Heap | 116–157 MB (bench) | 121–151 MB (bench); 345–382 MB in long sessions | no kernel-attributable growth |

## Changes outside `packages/` and `docs/`
`src/main.js` (kernel bootstrap; Sentinel collector opt-in; restart marker), `package.json` (`test:engine` script), `tests/sentinel-prime-r1-readiness.test.mjs` and `scripts/check-source.mjs` (source path re-pointed to the director registry; assertions identical; the registry carries the original per-director fallback warnings in `FALLBACK_WARNINGS` and logs them on install failure), `packages/zeknova-compat/src/directors.js` hosts the Prime controller text. Temporary benchmark files (`index.legacy.html`, `src/main.legacy.js`) were deleted after measurement. No bundle, API, PHP or deployment file was modified.

## Historical failures, classified
- Golden-hash tests ×3: pre-existing, unchanged, user decision pending.
- Keepalive autosave loss (C2): pre-existing, reproduced again, unchanged (not in ZGE-01 scope; hotfix candidate).
- GLTF hang mitigation: untouched (ZGE-02).
- Player XP persistence (C6): untouched (ZGE-03).
- New in ZGE-01 and fixed before completion: mixed time base and stream-id mismatch in `NeuralRenderer` (found in browser, fixed, tested); `FirstFifteenDirector` leak (found by probe, reclassified page-only, documented for ZGE-02).

## Security
No secrets printed or copied. `.env.production` keys and the committed collector token remain exposures the owner must rotate (ZGE-00 §1.1). Collector now opt-in. Inference endpoints loopback-only by default; mock always labelled; no credentials in the browser; dev panel and probe only behind `?zge=`.

## Not done / blocked
Real Matrix-Game 4 inference (no NVIDIA/Linux host, no weights by instruction); WHEP video path; bridge service; pixel-exact PIL parity; teardown for 16 page-only directors; whole-engine dispose in browser.
