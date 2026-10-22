# @zge/core — Engine Kernel API (ZGE-01)

Status: **implemented** in `packages/core/src/` (JavaScript ESM + JSDoc, public types in `packages/core/src/index.d.ts`). Automated coverage: `packages/core/test/kernel.test.mjs` (14 tests). Browser-verified through `src/main.js` hosting ZekNova (see `ZEKNOVA_COMPATIBILITY_RESULTS.md`).

Language decision: the repository has no build step (the browser imports `src/` and `packages/` directly from the PHP/static server) and no TypeScript toolchain. The kernel is therefore plain ESM with explicit JSDoc types and a hand-maintained `index.d.ts`. Migration path: add `typescript` as a devDependency, rename `src/*.js` → `.ts` keeping the `.d.ts` as the contract, and emit with the already-installed `esbuild`; no runtime API changes are required. The kernel has **zero** runtime dependencies and never imports Three.js, ZekNova content or the DOM (the scheduler probes `requestAnimationFrame` only when present).

## Construction
```js
import { createEngine } from "../packages/core/src/index.js";
const engine = createEngine({
  id: "zeknova",
  clock: { fixedStep: 1/60, maxSubsteps: 5, maxFrameDelta: 0.1, mode: "owned" | "delegated", timeSource },
  scheduler: "auto" | "manual" | { requestFrame, cancelFrame },
  log: (level, message, detail) => {},
  world: { id }, config: {},
});
```

## Lifecycle (`LifecycleManager`)
`created → initialize() → initialized → start() → running ⇄ pause()/resume() → paused; stop() → stopped (start() again = restart); dispose() → disposed` (terminal).
- Satisfied transitions return `false` and do **no work** (duplicate `initialize/start/pause/resume` are no-ops).
- Illegal transitions throw `LifecycleError` naming the allowed source states.
- A throwing transition body leaves the state unchanged.
- Every transition is recorded in `engine.lifecycle.history` and `engine.metrics` (`lifecycle.<transition>` counters) and emitted as `engine:lifecycle`.

## Clock (`EngineClock`)
- `owned` mode: fixed-step accumulator (`fixedStep`, `maxSubsteps`, `maxFrameDelta` clamp), interpolation `alpha`, dropped-time accounting (`clampedFrames`, `droppedTime`), `pause()/resume()`, `step(n)` for deterministic headless stepping.
- `delegated` mode: **never steps**; it only records frame deltas. This is how the kernel hosts ZekNova without becoming a second simulation authority (ZGE-00 R06). `step()` throws in delegated mode by design.
- Time sources are injectable (`ManualTimeSource`) → reproducible tests (60 Hz vs 30 Hz cadence produces identical state; proven in tests).

## Plugins (`PluginManager`)
```js
engine.use({ id, version?, requires?: [], optional?: [], failurePolicy?: "isolate"|"fatal", install(ctx) → handle, start?(ctx, handle), stop?(ctx, handle), dispose?(ctx, handle) });
```
- Topological ordering by `requires` (+ `optional` when present); registration order is the tiebreaker, so a chain registered in historical order reproduces that order.
- Missing requirement or dependency cycle → `PluginError` with the exact plugin / cycle path.
- Duplicate `id` → `PluginError { duplicate: true }`.
- Failure isolation: an `isolate` plugin that throws is recorded `failed`; plugins that `require` it are `skipped` with a reason; others continue. `fatal` rethrows after recording.
- `installAll/startAll/stopAll/disposeAll` are idempotent per status; disposal runs in reverse order.
- `reinstall(ids, ctx)` disposes and re-creates a subset, refusing when any plugin outside the subset depends on a member (prevents orphaned references). `independentSubset(ids)` computes the safe subset.
- `diagnostics()` → per-plugin status, order, timings, reasons.

## Plugin context (`ctx`)
`engine, world, events, metrics, clock, config, log(), guard(), addSystem(), setResource()/getResource(), own(owner)` — `own()` returns a `DisposableGroup`-backed scope whose `on()` subscriptions are attributed to the owner and released by `dispose()`.

## Systems and frame pipeline
`engine.addSystem({ id, phase: "input"|"simulate"|"physics"|"post"|"render", run(world, dt, info) })` → returns a remover. Per frame: `input` systems once → clock tick (in `owned` mode each fixed step runs `simulate → physics → post`) → `render` systems once with `{ alpha, frameDelta, delegated }`. System exceptions are isolated and recorded. `engine.frame(nowMs)` can be driven manually (`scheduler: "manual"`).

## Guards (failure isolation for optional work)
`await engine.guard(name, factory, { timeoutMs, fallback, required })` → result, or `fallback` on timeout/error with a status row `{ state: ready|degraded|failed, reason, ms }` in `engine.guards`; `required: true` rethrows. Emits `engine:guard`.

## Events (`EngineEvents`)
`on(type, handler, { owner, once }) → unsubscribe`, `once`, `offOwner(owner)`, `emit(type, payload)`, `listenerCount`, `diagnostics()` (`total`, `byType`, `byOwner`). Handler exceptions are isolated and recorded as `event:<type>` errors. `dispose()` on engine disposal clears all subscriptions — proven by test (`events.total === 0` after dispose).

## Metrics (`EngineMetrics`)
Counters, gauges, timers with p50/p95/p99 over a sliding window (`frame.total`, `frame.simulate`, `frame.render`, `frame.delta`, `system.<id>`, `lifecycle.<transition>`, plugin phase timings), bounded error and recovery logs, lifecycle transitions. `engine.diagnostics()` aggregates lifecycle, clock, scheduler, plugins, systems, guards, events, world and metrics into one inspectable object; the dev panel (`@zge/devtools`) renders it.

## World (`World`)
Minimal entity/component/resource store (plain data, no render objects): `createEntity/destroyEntity`, `addComponent/getComponent/removeComponent`, `query(...types)`, `setResource/getResource`, `snapshot()/restore()`. Richer ECS is ZGE-02+.

## Kernel acceptance tests (all passing)
Starts without any game; empty world initialises; plugins run in dependency order; invalid dependencies rejected with actionable errors (missing, cycle path, duplicate); duplicate initialise/start do no work; shutdown disposes subscriptions, systems, guards and plugin handles; restart (stop → start) re-runs hooks without duplicate subscriptions; test clocks reproducible and catch-up bounded; delegated mode never steps; guards degrade/fail correctly; event errors isolated; world snapshot round-trips; metrics expose timings.
