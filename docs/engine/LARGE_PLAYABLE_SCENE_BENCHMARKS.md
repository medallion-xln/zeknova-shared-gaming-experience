# Large playable scene benchmarks — ZGE-13

**Separates synthetic authoring capacity from playable-game rendering capacity. All measurements under the same declared browser/host.**

## Environment

Chrome headless (M1 Pro, macOS 26.x), `--enable-unsafe-webgpu --enable-precise-memory-info`, 1440×1000 @ DPR1, foreground RAF near 60 Hz. Both real WebGPU (`auto` → `webgpu`) and forced WebGL. GPU utilization / resident VRAM not measured; frame captures are presentation-bound (60 Hz RAF), not a GPU-throughput ceiling.

## Synthetic authoring matrix (100 / 500 / 1,000 / 5,000 entities)

`scripts/zge13-large-scenes.mjs` — mixed primitives + referenced static GLB, physical selection/inspection, gizmo/cancellation, save/export, reload:

| Entities | Backend | Load (ms) | Heap (MiB) | DOM nodes | Errors |
|---|---|---|---|---|---|
| 100 | webgl | 186.3 | 14.4 | 618 | 0 |
| 100 | webgpu | 957.8 | 15.3 | 618 | 0 |
| 500 | webgl | 157.4 | 27.8 | 267 | 0 |
| 500 | webgpu | 181.8 | 15.5 | 267 | 0 |
| 1,000 | webgl | 506.0 | 18.6 | 267 | 0 |
| 1,000 | webgpu | 252.7 | 18.7 | 267 | 0 |
| 5,000 | webgl | 652.5 | 39.3 | 267 | 0 |
| 5,000 | webgpu | 804.8 | 82.8 | 267 | 0 |

Indexed/virtualized hierarchy holds DOM to ~267 nodes at scale; heap scales sub-linearly with entity count (ZGE-12 virtualization retained).

## Playable-game rendering (4 / 25 / 100 real hierarchical GLB houses)

`scripts/zge13-playable-performance.mjs` — Beacon Haven with real multi-mesh GLB houses, colliders, active move/collect/build/goal rules. Frame p50/p95/p99 across two 10-s trials:

| Houses | Backend | Frame p50 / p95 / p99 (ms) | Avg FPS | Heap (MiB) | Errors |
|---|---|---|---|---|---|
| 4 | auto | 16.7 / 16.7 / 16.8 | ~60 | 14.1 | 0 |
| 4 | webgl | 16.7 / 16.7 / 16.8 | ~60 | 14.9 | 0 |
| 25 | auto | 16.7 / 16.7 / 16.8 | ~60 | 18.6 | 0 |
| 25 | webgl | 16.7 / 16.8 / 16.8 | ~60 | 15.2 | 0 |
| 100 | auto | 16.7 / 16.8 / 16.8 | ~60 | 24.4 | 0 |
| 100 | webgl | 16.7 / 16.8 / 16.8 | ~60 | 24.4 | 0 |

All six conditions are presentation-floor-bound at ~16.7 ms (60 Hz RAF). This **does not** demonstrate a maximum rendering capability; it demonstrates that up to 100 hierarchical playable GLB models with active gameplay rules render without dropping below the 60 Hz capture ceiling in this configuration.

## Honest limits

- The 60 Hz `requestAnimationFrame` headless ceiling is explicitly **not** evidence of maximum GPU capability; no 120 Hz guarantee.
- FPS is derived from captured frame intervals, not GPU-present timestamps; GPU timing/utilization are unmeasured.
- No universal entity limit is inferred. The largest tested scene maintaining responsive editing is **5,000 mixed entities (authoring)** and **100 hierarchical GLB houses (playable)** under this exact test configuration.
- The playable-performance harness re-ran cleanly (the ZGE-12-era timeout was a stale-server/state artifact; the committed harness passes against a clean server).

Charts: `evidence/zge13/charts/fps-vs-playable-complexity.png`, `heap-vs-playable-complexity.png`, `model-parse-load.png`.
