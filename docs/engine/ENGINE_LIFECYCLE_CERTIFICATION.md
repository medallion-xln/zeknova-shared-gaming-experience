# Engine Lifecycle Certification (ZGE-01)

Three evidence classes are kept apart: **AUTOMATED** (Node `node:test`, `npm run test:engine`), **BROWSER** (Playwright-driven Chrome 155, macOS, WebGPU, PHP dev server `127.0.0.1:8790`, session 2026-10-20 07:43–08:05 UTC), **NOT TESTED**.

## 1. Kernel lifecycle — AUTOMATED (14/14)
| Requirement | Test | Result |
|---|---|---|
| Engine starts without ZekNova; empty world initialises | "engine starts without any game content…" | pass |
| Deterministic clock (60 vs 30 Hz identical state; catch-up bounded; reproducible via ManualTimeSource) | two clock tests | pass |
| Delegated mode never steps (no second authority) | "delegated clock mode never steps systems" | pass |
| Plugins run in dependency order; optional deps only when present | "plugins run in dependency order…" | pass |
| Missing requirement / cycle / duplicate rejected with actionable errors | "invalid plugin dependencies are rejected…" | pass (`PluginError` carries `missing`, `cycle`, `duplicate`) |
| Failure isolation (dependents skipped, fatal policy) | "plugin failure is isolated…" | pass |
| Duplicate initialise/start/pause/resume do no work | "duplicate initialization…" | pass |
| Shutdown disposes subscriptions, systems, guards, handles | "shutdown disposes owned resources…" | pass (`events.total === 0`) |
| Restart of kernel-owned systems without duplicate subscriptions | "restart works for kernel-owned systems…" | pass |
| Guards degrade/fail with fallback | "guard: timeout and failure…" | pass |
| Event handler errors isolated; owner release | "event handler errors are isolated…" | pass |
| Snapshot/restore; metrics | two tests | pass |

Flakiness: 1 timing-sensitive neural test failed once in ~15 suite runs before the teleport test was changed to poll; 0 failures in the 8 runs after. Engine suite wall time ≈ 2.5 s.

## 2. Compatibility plugin lifecycle — AUTOMATED (5/5, fake legacy environment)
Registry integrity (37 entries, unique ids, deps exist, every entry classified disposable/page-only, 31 post-runtime entries in the exact `main.js` order); ZekNova boots through the kernel with install order == main.js order, delegated clock, single installs, dataset flags; in-page restart covers only the safe subset and `reinstall()` refuses dependents; full-page restart marker set/consumed once; a failing director (identity) isolates (runtime still ready, dependents skipped, unrelated directors start); no officer → refused; second in-page runtime start → refused.

## 3. Browser certification
| Check | Result | Evidence |
|---|---|---|
| Launch through kernel | **pass** | 38/38 plugins `started`, lifecycle `running`, clock `delegated`, 0 kernel errors, 0 uncaught errors/rejections, all 26 ZGE-00 dataset flags present, legacy globals present, `window.ZekNovaSource` preserved |
| Runtime ownership | **pass** | `ZGE.ownership()`: runtime/time/physics/gameplay/persistence/multiplayer/render = legacy bundle; bridge present; backend webgpu |
| Startup (click-anchored, warm, same machine) | **no regression** | legacy main.js 321 / 262 ms → kernel 293 / 306 ms click→gameplay-ready; kernel `initialize` (all 38 plugins incl. post-runtime directors) 1,451–1,602 ms; safe mode 354 ms; boss QA 348 ms |
| Steady-state frame (5 s samples) | **no regression** | legacy 115.7–117.8 fps, p99 10.4–16.8 ms; kernel 117.7–118.2 fps, p99 14.8–15.2 ms; kernel per-frame cost p99 **0.10 ms** |
| Director-layer in-page restart | **certified for 9 directors** | dispose+reinstall 165–187 ms, 0 failures, rebinding to live game verified (music, physics handle, relations panel), leak probe Δ listeners **0**, Δ intervals 0 |
| First-fifteen director | **reclassified page-only** | 5 window/button listeners leak per teardown (measured twice, reproduced in isolation); source adds anonymous listeners never removed |
| Full-page restart path | **certified** | `requestFullPageRestart()` → marker → reload → auto-launch 543 ms after navigation → gameplay-ready 374 ms after auto-click; 38/38 plugins; fingerprint complete; placed building restored |
| Legacy in-page runtime restart (`bridge.dispose()/start()`) | **not certified, by design** | 16 page-only directors (no teardown or page-only dependents); the host refuses a second in-page `start()` and routes to full-page restart |
| Memory | no growth attributable to kernel | heap 345–382 MB in game sessions (ZGE-00: 307–382 MB); kernel/presentation objects negligible; multi-cycle leak NOT TESTED |
| Stop/dispose of the whole engine in browser | NOT TESTED | disposing would dispose page-only directors with incomplete teardown; covered in Node only |

## 4. ZGE-02 addendum — lifecycle re-certification (2026-10-20)
- Leak probe now weak-references targets and counts only window/document and DOM-connected elements; listeners on nodes a director removed are reported as `detached`, not leaks.
- `FirstFifteenDirector.teardown()` fixed (Δ 0, was 5). `GameModeDirector.dispose()` added (identity-guarded method restore). Teardowns added for `graphics-ownership`, `combat-feedback`, `prime-executor`, `goban-shadow`, `picasso-visual`.
- **In-page restartable: 28 directors** (was 9). Page-only: `persistence-transport`, `asset-consolidation`, `legacy-gameplay-bridges`, `legacy-source-modules`, `legacy-styles`, `team-chat`, `hud-director`, `legacy-runtime`, `worldclaw`, `pause-menu`, `mission-clarity`.
- BROWSER: 3 × full 28-director restart cycles — live listeners Δ 0, intervals Δ 0, workers 9 → 9, 0 failures, 1.1–1.4 s per cycle; isolated reinstall of game-mode, picasso-visual, first-fifteen and the 12-director Sentinel chain all Δ 0; wrappers restored and re-wrapped by the new instances; rebinding verified. AUTO: 5-cycle test (`compat.test.mjs`).
- Full-page restart re-verified with XP restoration (806 → 806).
