# ZEK-16 read-only reproducibility manifest

Captured 2026-08-20 before ZEK-16 optimization.

- HEAD: `9015537fb0e2b6cc3e2d24901e78b40b5de191e0`
- Worktree: dirty; existing modified/untracked inventory preserved exactly as reported by `git status --porcelain=v1`.
- Active external coding processes: Claude and Qwen present.
- Intended-owner observation: `package.json` and `src/main.js` unchanged across 8 seconds; all new ZEK-16 owners absent.
- Concurrent intended-owner change: false.
- `package.json`: `ef424677dbea25ed41851c47ff1eda46a192224005466b3e192dd8686df68d51`
- `src/main.js`: `71cebb23ae7ff7e6d25f661e6381c8b4734897c7f5971b614a276328e44cd414`
- compatibility runtime: `7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab`
- model runtime: `e6af33cdf1f56c098d16156ce34ff435c7fa7a5490ed640a63c6e5e43ca726d0`
- Baseline gates: `npm test`, gameplay release, campaign certification, reconstruction, persistence, and network recovery all pass.
- Warmed Mission 1 live capture: average 9.08 ms; worst 174.5 ms; estimated FPS 118.8; 4,800 calls; 939,622 triangles; 761 geometries; 38 textures; 11 enemies; 54 residents; 2 projectiles; 115,501,237 heap bytes.
- Startup warnings: duplicate Three.js instance, multiple KTX2 loaders, deprecated `THREE.Clock`, and one bounded Stage 2F collector-unavailable warning.

The complete pre-edit changed/untracked inventory is available in the task transcript; it was intentionally not duplicated into this repository artifact because it contains hundreds of unrelated user-owned evidence files.
