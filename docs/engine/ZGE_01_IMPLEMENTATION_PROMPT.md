# ZGE-01 — Engine Kernel Extraction · Implementation Prompt

Use this prompt to start ZGE-01. It assumes `docs/engine/*` from ZGE-00 has been read. Do not start it before the user has decided the three ZGE-00 hygiene items (bundle hash gate, `.env.production` keys, collector opt-in).

---

## ROLE
You are the ZekNova Engine kernel team (Principal Engine Architect, Developer Tools Engineer, QA/Performance Engineer). You are building `@zge/core` and the `zeknova-compat` plugin inside `/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience`.

## NON-NEGOTIABLES
1. ZekNova must remain playable at every commit (`npm run dev` → enlist → launch → move → save → reload → restored).
2. Do not edit `assets/index-02987539.js`, `assets/model-runtime*.js` or `assets/environment-runtime.js`. The compat plugin hosts them; it does not patch them.
3. No new `globalThis.ZekNova*` globals. Existing ones may be *aliased* by the compat plugin behind `manifest.compat.legacyGlobals = true`.
4. TypeScript for everything under `packages/`; build with the already-installed `esbuild`; no new runtime dependencies beyond `three`.
5. Every optional dependency goes through `kernel.guard()`; no bare `Promise.race` timeouts.
6. Record measurements, never estimates, in `docs/engine/ZGE_01_RESULTS.md`.

## INPUTS (read first)
- `docs/engine/CURRENT_STATE_AUDIT.md` §2 (ownership), §4 (duplicates)
- `docs/engine/RUNTIME_ARCHITECTURE.md` §1 (startup sequence), §3 (dependency graph)
- `docs/engine/ENGINE_1_ARCHITECTURE.md` §4 (kernel contracts), §6 (lifecycle), §7 (compat strategy)
- `docs/engine/CERTIFICATION_RESULTS.md` §1, §9, §12 (baselines you must match or beat)
- `src/main.js`, `src/game/Game.js`, `src/game/physics/PhysicsWorld.js`, `src/game/AdaptiveSimulationDirector.js`, `src/game/RenderPerformanceDirector.js`

## DELIVERABLES
### D1 `packages/core` (TypeScript)
- `Engine` (`use/boot/start/pause/step/stop/dispose/snapshot/restore`), `World` (entities, typed component stores, `query`, resources), `Clock` (fixed 1/60 s accumulator, ≤5 substeps, alpha; ported from `PhysicsWorld.step`), `Scheduler` (phases `input|simulate|physics|post|render`; tiers T0–T4 with the interval table from `AdaptiveSimulationDirector.SIMULATION_TIERS`), `EventBus` (typed), `Plugin` loader (validates `requires`, installs in order, disposes in reverse), `Lifecycle` with `guard(name, promise, {timeoutMs, fallback})` and `engine.status` table, `Metrics` (per-system ms, counts; `snapshot()`), `RNG` resource (seeded, e.g. the `pn` mulberry-style generator the bundle uses), `Snapshot` (JSON of entities/components/resources).
- Headless entry (`packages/core/src/headless.ts`) that runs the pipeline without a renderer under Node 22.
- Unit tests under `packages/core/test/` using `node:test`: clock determinism (60 vs 30 Hz cadence → identical state), scheduler tier skipping, guard timeout → `degraded`, dispose order, snapshot round-trip.

### D2 `packages/render-three` (minimal)
- `RenderBackend` over `three/webgpu` with WebGL 2 fallback; creates the canvas; renders an empty lit scene with a free camera. Full component mirroring is ZGE-02; here only `Transform` + `DebugMesh`.

### D3 `games/zeknova/compat` — `zeknova-compat` plugin
- Imports the bundle exactly as `Game.js` does today (including the session-restore fetch shim, which you may keep as-is inside the plugin).
- Drives `ZekNovaGame.animate` from the kernel's `render` phase (kernel owns rAF); pause/step come from the kernel.
- Exposes bundle state as read-only resources: `LegacyGame`, `LegacyPlayer`, `LegacyEnemies`, `LegacyBuildings`, `LegacyTerrain`, `LegacySimulation` (adapters over the 77 fields listed in CSA §2.1).
- Wraps each of the 24 director installs from `src/main.js` as plugins with declared `requires` (preserve the Sentinel chain order: Identity → Perception → Knowledge → Observation → Legality → PrimeShadow → Commands → Executor → Parity → Closure). Install/dispose must be symmetric.
- `legacyGlobals` alias flag defaults to `true` for this milestone.

### D4 `zge.project.json` manifest + `packages/cli`
- Manifest fields: `name`, `engine`, `plugins[] {id, enabled, options}`, `render {backend: 'webgpu'|'webgl2'|'auto'}`, `compat {legacyGlobals}`, `features {}` (flags for later milestones).
- CLI: `zge run` (esbuild watch + dev server; keep PHP dev server for API), `zge test` (node:test + headless certification), `zge create empty`.

### D5 Developer overlay
- Replaces hidden `<output>` telemetry: metrics table (per-system ms, fps percentiles, draw calls, heap), `engine.status` guard table, entity/resource dump. Toggle `?zge=overlay`.

### D6 Certification
- `packages/testing`: headless runner + browser smoke (Playwright is acceptable as a devDependency) with these checks and recorded numbers:
  1. Empty world: boots headless and in-browser; fixed-step tick count = elapsed × 60 ± 1.
  2. ZekNova under kernel: `gameplay-ready` diagnostics equal to today (`trees 336`, `rocks 48`, `models true`, `environment true`), 13 living enemies at steady state, same save payload keys, startup time ≤ CR §1 baseline (10.3 s cold / 7.5 s warm).
  3. Restart: `engine.dispose()` then `engine.boot()` → every plugin re-bound to the new game (assert no `plugin.game === oldGame`), heap within ±10 % after 3 cycles.
  4. Node suite: ≥ 83/86 passing (the 3 hash tests are governed by the user's ZGE-00 decision).
  5. Zero `globalThis.ZekNova*` reads inside `packages/`.

## OUT OF SCOPE (do not start)
Asset manager, physics authority, render mirroring beyond debug meshes, gameplay extraction, scene serialization, editor UI, Sentinel adapter rewrite, save transport fix (R03 may be hot-fixed separately by the user).

## ACCEPTANCE REPORT
`docs/engine/ZGE_01_RESULTS.md` with: measured startup/restart/heap numbers vs ZGE-00 baselines, test pass counts, list of plugins with `requires`, remaining globals, and open questions for ZGE-02.
