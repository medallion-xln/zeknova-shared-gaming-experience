# ZGE-02 — Rendering, Physics and Asset Pipeline · Implementation Prompt

Preconditions (user decisions still open from ZGE-00): bundle hash gate (commit + re-pin or revert), `.env.production` key rotation, keepalive autosave hotfix (C2). ZGE-01 is complete; read `ZGE_01_IMPLEMENTATION_REPORT.md` first.

## Objective
Give the kernel real ownership of three domains without touching the bundle: (1) a single Three.js instance behind `RenderBackend` with component mirroring; (2) `@zge/assets` (registry, ref-counted cache, LOD policy, cancellation, budgets) replacing the seven `model-runtime` instances; (3) `@zge/physics` promoted from shadow to authority behind `PhysicsBackend`, with an input journal and replay runner. Plus the neural bridge groundwork that ZGE-01 identified.

## Deliverables
1. **Render separation** — `Transform`, `MeshRef`, `Animator`, `Light`, `Camera` components; `render-three` backend creates the renderer; compat plugin injects the kernel renderer/canvas into the bundle's `initialize()` path (behaviour-driven via QA states; no bundle edits). Exit the two-Three-instances state (`THREE.WARNING: Multiple instances` must disappear).
2. **Asset manager** — one `GLTFLoader`/`KTX2Loader` pair; cache keyed by URL+LOD; each GLB fetched once per session (ZGE-00 measured 11× for the juggernaut); instrument the loader queue and reproduce/root-cause the GLTF hang (R04) before de-duplicating; timeouts become guard `degraded` states.
3. **Physics authority** — `PhysicsBackend` interface; reference JS backend from `packages/…/physics` (current `src/game/physics`); Rapier spike with `@dimforge/rapier3d-deterministic` benchmark; retire `PhysicsRuntimeBridge` method wrapping; fixed-step owned clock for physics while the bundle still drives gameplay (document the hand-off).
4. **Replay** — input journal + snapshot/restore → 60 s recorded session replays with identical physics state; headless runner in CI.
5. **Neural bridge groundwork** — implement the WHEP receive path (adapt upstream `mediamtx-reader.js`, MIT, with attribution) and specify the Linux-host bridge service that speaks the upstream game IPC (`hello/request/frame/end`, 1280×720, credit-paced) fed by browser frames; keep `TRANSPORT_READY` honest (upstream `--reference-only` deployment is the next gate).
6. **Teardown completion** — fix `FirstFifteenDirector.teardown()` (5 leaked listeners) and add teardown to `graphics-ownership`, `combat-feedback`, `prime-executor`, `goban-shadow`, `picasso-visual`, `pause-menu`, `mission-clarity`, `game-mode` so more of the director layer becomes in-page restartable; the leak probe test (`?zge=probe`) must report Δ 0 for every reinstalled plugin.

## Acceptance
- No `Multiple instances of Three.js` / `Multiple active KTX2 loaders` warnings; each GLB fetched once.
- Physics determinism test (existing) + replay equality; fixture p95 within ±10 % of ZGE-01 baselines (117–118 fps, p99 ≤ 16 ms native).
- GLTF hang: root cause documented or reproduced with a fixture; no bare `Promise.race` timeouts remain in engine packages.
- Engine suite + legacy suite green except the user-governed hash tests; browser smoke (launch, move, combat, build, save, restore, safe mode, neural mock, fallback) green.
- Keep ZekNova playable at every commit; never edit the minified bundles.
