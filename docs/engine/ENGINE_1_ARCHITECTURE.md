# ZekNova Engine 1.0 · Architecture Proposal

Status: proposal (ZGE-00 output). Nothing here is implemented. Decisions are evaluated against the audited runtime, not assumed.

---

## 1. Design goals (from the ten required principles)
1. **Engine independence** — `zge create empty && zge run` boots a lit, empty world with a free camera and a 60 Hz fixed-step simulation; no ZekNova import anywhere in the dependency graph.
2. **Single authority** — each mutable domain (time, entities, physics, assets, persistence, network, authority tokens) has exactly one owner module; everything else reads snapshots or sends commands.
3. **Composition** — gameplay is components + systems + resources registered by plugins; no prototype patching of engine classes.
4. **Deterministic core** — fixed timestep, seeded RNG resource, ordered systems, input log → replayable simulation; rendering interpolates.
5. **Failure isolation** — every optional asset/plugin/service is wrapped by the kernel with timeout, fallback and a status entry; the world reaches `ready` regardless.
6. **Rendering separation** — simulation state lives in components (plain data). The render plugin mirrors it into Three.js objects. Sim never touches `Object3D`.
7. **Network independence** — persistence and net are plugins behind `Store` and `Transport` interfaces; the default is in-memory/localStorage with no server.
8. **Backward compatibility** — a `zeknova-compat` plugin keeps the bundle running under the kernel until each system is replaced; save schema v4 remains loadable through migrations.
9. **Observable performance** — `engine.metrics` exposes per-system timings, counts, memory and GPU stats; frozen fixtures replay for regression.
10. **Extension without modifying core** — public API is `@zge/*` packages + plugin contract; games and tools never import engine internals.

## 2. Technical choice evaluation

| Choice | Evaluate | Decision for 1.0 | Evidence / reasoning |
|---|---|---|---|
| Three.js as graphics foundation | Keep vs Babylon vs custom | **Keep Three.js (r185+, `three/webgpu`)** | Already in use with WebGPU verified at 83–118 fps; TSL node materials are the WGSL/GLSL bridge; swapping would discard the only working renderer path. Isolated behind `RenderBackend` so it is replaceable, not required. |
| WebGPU with WebGL fallback | Default WebGPU | **WebGPU default, WebGL 2 automatic fallback** | Verified both backends; Three handles fallback; Firefox/Safari coverage still needs WebGL 2. |
| ECS vs current OO | Full ECS (archetype) vs OO + registries | **Lightweight ECS: typed component stores + ordered systems + resources**; no archetype VM in 1.0 | 77-field god object and 195 patches show the OO path has no composition boundary. ZekNova's scale (≈1.6 K meshes, <100 agents) does not need archetype optimisation; the win is ownership clarity and serialization. Keep `class` for components with plain-data fields. |
| Fixed timestep + interpolation | Adopt | **Yes: 60 Hz sim, ≤5 substeps, render alpha** | Already implemented in `PhysicsWorld.js` and tested; the authoritative loop today is variable-dt. |
| Physics backend | Current JS world vs Rapier | **Ship `@zge/physics` (current JS world) as reference; define `PhysicsBackend`; evaluate `@dimforge/rapier3d-deterministic` in ZGE-02 benchmark** | Current gameplay needs are 2-D radius/terrain checks, swept projectiles, knockback — the JS world covers them at 0.05 ms/step. Rapier brings real rigid bodies and cross-platform determinism at WASM cost; decide on measured need. |
| TypeScript boundaries | None vs full vs edges | **TypeScript for `@zge/*` packages and the plugin contract; game content may stay JS with `.d.ts` checks** | Original TS sources were lost; the engine must not repeat that. Types are the SDK. Build with esbuild (already a devDependency) — no Vite required. |
| Web Workers | Where | **Workers for: terrain/world-gen, MCTS/AI planners, asset decode (KTX2/Meshopt already), physics optional** | MCTS already runs in a blob worker; keep off-main-thread as a scheduler feature with transferable snapshots. |
| Asset streaming/caching | Build | **`@zge/assets`: registry → ref-counted cache → LOD policy → budget-aware streaming; one loader set** | Seven loader instances and 11× duplicate downloads observed. |
| Deterministic sim & replay | Build | **Seeded RNG resource, command/input journal, snapshot/restore, replay runner in headless Node** | Needed for AI evaluation (Sentinel shadow already wants it) and regression. |
| Client/server authority | Define | **Authority is a property of a system (`local`, `server`, `shared-merge`); 1.0 ships local + shared-merge (current PHP rules) and a `Transport` interface; server-authoritative combat is a 2.0 plugin** | README already flags combat as client-local. |
| Plugin architecture | Build | **`definePlugin({ id, version, requires, components, systems, resources, commands, assets, ui })`**; kernel validates order and authority | Directors already follow install/dispose; formalise it. |
| Scene/prefab serialization | Build | **JSON scene = entities + components; prefab = parameterised entity template; WorldClaw `WorldSpec` becomes a scene generator output** | WorldClaw spec/validator/critic is the most mature authoring data model in the repo. |
| Hot reload & tooling | Build | **Module-level HMR for systems/plugins via esbuild watch; state preserved through snapshot/restore** | Snapshot/restore is required for replay anyway. |

## 3. Package layout
```
packages/
  core/          Engine, World, Clock, Scheduler, EventBus, Component/System/Resource registries, Plugin loader, Lifecycle, Metrics, RNG, Snapshot
  math/          vectors, transforms (thin wrappers over three/math or own)
  input/         action maps, keyboard/mouse/gamepad/touch adapters, input journal
  physics/       PhysicsBackend interface + reference JS backend (from src/game/physics)
  physics-rapier/ optional backend
  terrain/       height-grid sampler (JS + optional WASM), chunk index, spatial hash
  assets/        registry, cache, loaders (GLTF/KTX2/Meshopt/audio), LOD policy, budgets
  render-three/  RenderBackend over three/webgpu, mirrors components → Object3D, materials/themes, LOD, shadows budget
  audio/         WebAudio graph, music/sfx resources, spatialization
  persistence/   Store interface, envelope, migrations, local/localStorage/HTTP stores
  net/           Transport interface, room-merge plugin, recovery state machine
  ai/            Perception, Knowledge ledger, Legality masks, Behaviour tree/utility/planner runners, Command bus with authority tiers
  ai-sentinel/   Optional Sentinel Grid / AZL adapter (observe-only by default)
  world-gen/     WorldSpec, semantic placement, validators, critic, repair (from src/worldclaw)
  gameplay-*/    construction, combat, missions (generic systems; data supplied by games)
  ui-dom/        HUD bindings to engine state; pause/onboarding primitives
  devtools/      profiler overlay, inspector data model, console, replay viewer
  testing/       headless runner, fixtures, golden-scene certification
  cli/           zge create|run|build|test|replay
games/
  zeknova/       content (C-category), zeknova-compat plugin (bundle host), PHP backend adapter
```

## 4. Kernel contracts (sketch)
```ts
interface Engine {
  readonly world: World; readonly clock: Clock; readonly events: EventBus; readonly metrics: Metrics;
  use(plugin: Plugin): Engine;               // validated, ordered by `requires`
  boot(manifest: ProjectManifest): Promise<void>;   // phases: configure → load → ready
  start(): void; pause(): void; step(n = 1): void; stop(): Promise<void>; dispose(): Promise<void>;
  snapshot(): Snapshot; restore(s: Snapshot): void;
}
interface World { spawn(prefab?: Prefab): Entity; destroy(e: Entity): void; get<T>(e, C: ComponentType<T>): T; query(...C): Iterable<Entity>; resource<T>(R: ResourceType<T>): T; }
interface System { id: string; phase: 'input'|'simulate'|'physics'|'post'|'render'; tier?: 'T0'|'T1'|'T2'|'T3'|'T4'; run(world: World, dt: number): void; }
interface Plugin { id: string; version: string; requires?: string[]; install(e: Engine): void | Promise<void>; dispose?(e: Engine): void; authority?: AuthorityDeclaration; }
interface RenderBackend { init(canvas, opts): Promise<'webgpu'|'webgl2'>; sync(world, alpha): void; render(): void; stats(): RenderStats; dispose(): void; }
interface PhysicsBackend { step(dt): PhysicsStepResult; add(body: BodyDesc): BodyHandle; sweep/raycast/query…; }
interface AssetManager { load<T>(ref: AssetRef, opts?: {priority, timeoutMs, lod}): Promise<Handle<T>>; release(h): void; stats(): AssetStats; }
interface Store { load(key): Promise<Envelope|null>; save(key, env: Envelope): Promise<SaveResult>; }   // never keepalive-only; explicit result
interface Transport { connect(room): Promise<void>; send(msg): void; on(msg, cb): void; status(): TransportStatus; }
interface CommandBus { propose(cmd, by: AuthorityTier): Proposal; execute(cmd, token: AuthorityToken): Result; }
```
Rule: a plugin may **register** systems/components/resources and **propose** commands; only the kernel executes commands, and only with a token whose tier permits it. This is how Sentinel R0 stays observe-only without a bespoke `canDispatch:false` object per module.

## 5. Frame pipeline
```
clock.tick(rafTime) → accumulator
  while accumulator ≥ 1/60 and substeps < 5:
     input.journal.apply(step)        (recorded for replay)
     phase simulate   (systems ordered; tiers skip by interval)
     phase physics    (backend.step)
     phase post       (events, persistence dirty-marking, net outbox)
  alpha = accumulator / dt
phase render: renderBackend.sync(world, alpha); render(); metrics.collect()
```
Pause = stop ticking simulation, keep rendering. Headless = same pipeline without render.

## 6. Lifecycle and failure isolation
`boot()` runs plugin `install` in dependency order; each optional asset/service is `kernel.guard(name, promise, {timeoutMs, fallback})` → status table (`ready | degraded(reason) | failed(reason)`) published on `engine.status`. The world reaches `ready` when all **required** guards settle; optional ones continue in background and emit `asset:ready` events (replaces today's `hqReady → environmentReady` chain and its three nested `Promise.race`s). `dispose()` disposes plugins in reverse order and clears all registrations — fixing the orphaned-director defect by construction.

## 7. Compatibility strategy
- `zeknova-compat` plugin hosts the bundle: the kernel owns the canvas, clock and lifecycle; the bundle's `animate` is driven by the kernel's render phase; `ZekNovaGame` fields are exposed as *read-only resources* with adapters; every monkey-patch becomes a system registered by the compat plugin. This is the ZGE-01 deliverable.
- Each later milestone moves one domain out of the bundle behind a **contract test** (same inputs → same observable outputs on both implementations) and a feature flag in the project manifest.
- Save schema v1–4 is loaded through `@zge/persistence` migrations; the PHP `Store` adapter preserves `merge-by-stable-id` semantics.

## 8. Non-goals for 1.0
Full archetype ECS VM; server-authoritative combat; visual scripting; custom shader language beyond TSL; mobile-native packaging; multi-renderer parity (Babylon/PlayCanvas backends).
