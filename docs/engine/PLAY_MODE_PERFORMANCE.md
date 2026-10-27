# Play Mode Performance

## What is instrumented

- `viewport.metrics()` — draw calls, triangle count, geometries, object count (already surfaced in the Studio footer's `#render-stats`).
- `viewport.frameTimings({samples})` — rAF frame-time histogram (p50/p90/p95/p99) + a derived present-FPS, plus an honest `gpuTimestampQuery.available` flag (presentation rate is rAF-bound; real GPU timestamps require the `timestamp-query` feature and async readback).

## What is verified this milestone

- Play Mode renders at interactive rate on both **WebGPU** (auto) and **WebGL** (`forceWebGL` fallback), confirmed by live `cameraState()` assertions driving `viewport.render()` with no error.
- Camera switching does not add per-frame work beyond a handful of scalar lerps in `resolveRig`+`desiredPose` (fixed cost, independent of entity count).
- The camera director registers one `render`-phase system; no additional render loop is created.

## What is NOT yet certified

- A **full-frame benchmark** across all three rigs (60 fps target, frame-time p95/p99, lifecycle memory) was **not run** this execution. The `frameTimings` instrument exists but a corporated measurement of Play Mode at stable 120-sample windows is deferred.
- **60 fps target** is not asserted — headless Playwright runs uncapped and does not stand in for a real display's vsync.

Do not treat "renders without error" as a throughput or latency claim. A proper benchmark belongs in Phase 11 and will be reported as evidence, not inference.
