# ZGE-BENCH-01 Studio and SDK certification

Completed: bounded SDK, physical Studio, independent Outpost, WebGPU/WebGL and automatic fallback checks pass. This is the preview11 pre-ZGE12 certification; source hashes and complete new measurements are retained in `evidence/studio/timings.json`. The later ZGE12 implementation has separate evidence.

## Product boundary

Studio is a local authoring application served at `http://127.0.0.1:8800/examples/studio/`. Orbital Outpost is a separate runnable SDK game at `/examples/orbital-outpost/`; Signal Garden is a packed-SDK consumer outside the repository at `http://127.0.0.1:8801/`. Their saves use browser local storage. These checks do not certify durable PHP/SQLite multiplayer saves or live legacy gameplay.

The current baseline is SDK `0.1.0-preview.11`, not the older preview.10 milestone. No runtime, editor, legacy bundle or golden assertion is changed by this certification.

## SDK evidence completed

| Check | Current result | Evidence |
|---|---|---|
| Public SDK unit tests | 17/17 passed | `evidence/studio/sdk-unit.log` |
| Executed README quickstart | One JavaScript example passed | `evidence/studio/sdk-docs.log` |
| Independent Signal Garden game test | 1/1 passed | `evidence/studio/external-unit.log` |
| Strict external TypeScript consumer | Passed, TypeScript 6.0.3 | `evidence/studio/external-typecheck.log` |
| Source-independent SDK package build | 27-file closure; two identical bundles and tarballs; 17 installed-public tests passed | `evidence/studio/clean-build/result.json` |
| External installed artifact identity | Both JavaScript bundles and both declaration files equal current repository artifacts | `evidence/studio/package-identity.json` |

The clean build uses a fresh temporary directory, offline dependency installation, the public package export surface, and the independent Outpost project. It does not replace the checkout's SDK outputs. The external consumer remains outside the monorepo and imports its installed package.

## Browser method

The isolated `scripts/zge-bench01-studio.mjs` harness uses the existing Playwright installation and installed Chrome. All authoring and game actions use physical mouse, keyboard, native input, file import, or download interactions. Read-only evaluation verifies resulting state and projects actual entity/gizmo coordinates; it does not invoke gameplay mutations.

For both native WebGPU and forced WebGL, the completed workflow covers project picker/open, viewport and hierarchy selection, real gizmo movement with temporary authoring isolation, numeric transforms, prefab creation, keyboard deletion, undo/redo restore, complete-project save/reload, isolated simulation movement, pause/step/reset, event filtering, mock AI preview/reject/approve with provenance, portable export/reopen, independent Outpost movement/collection/antenna build, save and full page reload. Automatic unavailable-WebGPU fallback is tested separately.

The unchanged ZGE-11 physical workflow is copied into a temporary harness with only its evidence output path changed. It additionally covers X/Y/Z handles, rotation/scale, snapping, Escape cancellation, camera orbit/pan/zoom, projection changes, hierarchy parenting/locking/visibility, asset import and native drag/drop, prefab overrides, portable fresh-context reopening, editing external custom schemas, independent Signal Garden execution and project-switch lifecycle diagnostics. Historical evidence is preserved.

## Measurement definitions

Cold load uses a fresh browser context after clearing the browser HTTP cache. OS disk cache is not cleared. Warm load repeats navigation in the same context. Navigation-to-usable is bounded by the first assertion that Studio exists and a subsequent animation frame. Browser paint entries are recorded separately; neither label claims GPU-present timing or the first semantically useful visual without screenshot review.

Interaction durations run from before the actual Playwright input through the asserted resulting state and a following animation frame. They include driver transport, actionability, polling and scheduling. They are reproducible end-to-end upper bounds, not isolated editor-handler CPU durations.

Each renderer has two 15-second editor-idle trials and two 15-second independent-Outpost movement trials, each after a two-second warm-up. Frame intervals come from foreground `requestAnimationFrame` timestamps. Average FPS is `1000 / mean interval`; median FPS is `1000 / median interval`; 1% low FPS is `1000 / mean of the slowest ceil(N × 0.01) intervals`. Percentiles use the nearest-rank method. Counts over 16.67 and 33.33 ms use strict greater-than comparisons. Raw frame intervals are retained.

CDP main-thread TaskDuration deltas measure page-main-thread active time as a fraction of trial wall time. They are not whole-machine CPU utilization. GPU durations are not instrumented. Renderer object, geometry and draw-call counters and JavaScript heap samples are recorded where exposed. Twelve project switches per backend use garbage collection only between lifecycle samples, outside active frame trials; DOM node/listener counts and public scene/renderer diagnostics are sampled. This bounds an observed sequence and cannot establish indefinite leak freedom.

## Scope limits

These are automated agent interactions, not a human usability study. Orbital Outpost contains five primitive entities before gameplay and a simple movement/collect/build objective; it does not represent the legacy world's GLTF, KTX2, combat, boss, biome or heavy-HUD complexity. No neural inference is executed: AI proposals are explicitly deterministic mocks. Editor authoring must not request the legacy bundle, private SDK source paths, or remote write endpoints.

The installed preexisting local development servers are reused only after HTTP checks. No preexisting process is killed, no production service is accessed and no live authority transfer is attempted. Larger scene limits, assistive-technology conformance, multi-hour editor retention, 120-Hz presentation capability and production readiness remain outside this bounded Studio certificate.

## Completed measurements

| Backend | Measured actions | Input p50/p95/p99 ms | Cold usable ms | Warm usable ms | Twelve-switch heap MiB |
|---|---:|---|---:|---:|---|
| webgpu | 20 | 44.99/71.51/79.36 | 222.01 | 110.43 | 8.42→8.50 |
| webgl | 20 | 43.36/62.18/79.87 | 295.10 | 110.62 | 8.44→8.51 |

All eight 15-second frame trials averaged about60.002 FPS, with 1% low59.524 FPS and p95/p9916.8ms. Real movement, collection, antenna construction, save/reload/full-page restore, simulation isolation, mock review and fresh-context portability passed on both backends. No uncaught page errors were observed. Unavailable-WebGPU fixture executed actual WebGL fallback. Historical `drawCalls` reports accidentally used the cumulative render-call counter: those values are not certified draw-call counts; ZGE12 corrects this diagnostic. No human fun/accessibility rating or source-world durability is inferred.
