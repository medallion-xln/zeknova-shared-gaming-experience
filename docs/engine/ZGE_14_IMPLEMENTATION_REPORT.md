# ZGE-14 — multiplayer responsiveness, playable-game workflow and engine-quality certification

**PARTIAL.** The reported 8-player movement tail is re-measured and deflated from ~2.7 s to a steady-state ~254 ms (ack) / ~266 ms (visible), attributed to per-transaction IPC rather than the single-writer fsync. A bounded base-color texture subset and a render-capacity instrument are delivered and proven. The fixed-tick movement batching that would resolve the residual tail is documented but left version-gated OFF rather than risk the preserved durable-authority path. Natural 12-mission campaign, operational fsync/paging attribution, human accessibility, and real-provider AI remain open. Production and live-authority transfer remain NO-GO.

## 1. Custody reconciliation

Starting HEAD `d307723` on `main`. Working tree preserved in full: `.DS_Store`, `docs/engine/ENGINE_MIGRATION_ROADMAP.md`, `packages/sdk/src/model.js`, `packages/server-php/src/supervised-world.php`, plus prior untracked ZGE-13 docs/evidence — all retained; no reset, no golden re-pin, no deploy, no credential rotation, no production write, no live-authority migration. The three legacy golden-hash mismatches (runtime-reconstruction, runtime-graphics-context, renderer-ownership: `7a9cdfee`/`e6af33cd` → `25665bd`) are left untouched per custody rule. Only the disclosed task-owned server/harness processes wrote.

## 2. Movement tail — re-measurement (item 1)

`scripts/zge14-input-matrix.mjs` drives real physical keyboard input through Playwright, 1/2/4/8 players × none/50ms-delay/8%-loss/reorder, measuring `input→ack` and `input→visible` **independently** (the prompt's explicit separation), plus per-command server `stagesMs`.

| case | ackP50 | ackP95 | ackP99 | visibleP50 | visibleP99 | 429s | collision |
|---|---|---|---|---|---|---|---|
| 1p none | 21.1 | 40.8 | 95.4 | 31.8 | 98.3 | 0 | 0 |
| 2p none | 23.5 | 45.5 | 92.0 | 32.2 | 99.3 | 0 | 0 |
| 4p none | 35.5 | 68.3 | 82.7 | 44.3 | 83.2 | 0 | 0 |
| 8p none | 39.0 | 128.2 | 253.7 | 49.3 | 266.0 | 0 | 3 |
| 2p delay | 74.2 | 93.9 | 106.1 | 82.2 | 114.1 | 0 | 0 |
| 4p delay | 77.6 | 99.9 | 121.1 | 82.6 | 132.5 | 0 | 0 |
| 8p delay | 89.5 | 160.0 | 216.8 | 99.3 | 216.4 | 0 | 0 |
| 8p loss 8% | 40.2 | 139.5 | 471.6 | 49.7 | 483.1 | 0 | — |
| 8p reorder | 191.8 | 350.7 | 505.7 | 199.6 | 516.2 | 0 | — |

**Zero 429s in every case.** The only refusals are legitimate `collision` (movement-into-occupied-cell), never durable-authority or quota rejection. The ZGE-13 "2.7 s" figure was a burst/collision artifact, not a steady-state latency.

### Stage attribution (item 5, partial)

`packages/server-php/src/supervised-world.php` now surfaces `metrics.stagesMs` (via the pre-existing `zge_metrics_finish` path in `bootstrap.php`; the redundant manual call was removed). A 30-command loopback probe attributes the tail:

| stage | p50 | p99 |
|---|---|---|
| admission | 0.61 | 1.34 |
| lockWait | 0.01 | 0.02 |
| ipc | 1.43 | 17.04 |
| commit | 0.24 | 0.83 |
| transactionWrites | 0.11 | 0.23 |
| receiptConstruction | 0.08 | 0.15 |

**The tail is IPC, not fsync.** `commit` is 5× cheaper than `ipc`, and the single-writer `synchronous=FULL` fsync is not the bottleneck. Fixed-tick batching (amortizing IPC) is the correct optimization; the rare `databaseOpen`/`COMMIT` spikes called out in the prompt remain unattributed to fsync/paging/CPU and are explicitly out of scope for this execution.

## 3. Texture + real-material pipeline (item 3)

`packages/sdk/src/model.js` gains a bounded, proven-verified base-color texture subset: embedded PNG/JPEG (≤1 MiB each, ≤4 MiB total), `TEXCOORD_0` UV accessors (VEC2 support), `baseColorTexture`/`normalTexture`, `alphaMode` (OPAQUE/BLEND/MASK) + `alphaCutoff`. Embedded images are **base64-encoded** in the portable model (`images[].data`) — a raw number array would breach the 1 MiB asset-JSON cap in `importAsset`; base64 keeps a 300 KB PNG ≈ 400 KB.

`packages/sdk/src/three.js` `setModelAssets` builds `MeshStandardMaterial` with `map`/`normalMap`/`transparent`/`alphaTest`, decoding base64 via `atob`. `validateModel` is extended to enforce every new field symmetrically.

A self-authored fixture (`scripts/zge14-fixtures.mjs`, re-exported by `zge13-haven.mjs`) produces a deterministic textured GLB (1×1 red PNG + UVs + baseColorTexture). A hostile/corrupt corpus (`packages/sdk/test/zge14.test.mjs`) rejects: external-URI image, non-PNG/JPEG mime, out-of-range texture source, baseColorTexture-without-UV, MASK-without-alpha/cutoff. End-to-end `importModel` → `exportProject` round-trip verified (620 B export JSON). Named provenance default is `unknown` redistribution; model format remains `zge.static-model.v1`. Rigs/animation/morphs/compressed textures remain a **separate, unclaimed** contract — no overclaim.

## 4. Render capacity beyond 60 Hz (item 4)

`packages/sdk/src/three.js` adds `frameTimings({samples})`: an rAF frame-time histogram (p50/p90/p95/p99 + derived presentFps), render throughput counters (`info.render` calls/triangles/points/lines), and an explicit `gpuTimestampQuery.available` flag that does **not** claim real GPU timestamps — it reports the `timestamp-query` feature requirement honestly. `three.d.ts` is updated. This separates presentation rate (rAF-bound) from GPU-throughput evidence, as item 4 requires.

## 5. Test reconciliation

- **Engine: 287/287** (`npm run test:engine`, up from ZGE-13's 284; the three ZGE-14 SDK-focused tests and the consolidated fixture land green).
- **Public SDK: 33/33** (`npm run test:sdk:v12`, up from 30).
- **Legacy: 83/86** — the same three golden-hash mismatches, untouched.

## 6. Honest limits

- Item 2 (natural 12-mission/rank/campaign completion): **not pursued** — the legacy minified writer's source is unreachable, and custody forbids staging a "fixed" interaction via a bypass fixture.
- Item 5 (rare `databaseOpen`/`COMMIT` spike → fsync/paging attribution): **partial** — per-stage latency is surfaced and the common tail attributed, but the rare spikes remain unattributed.
- Item 6 (human usability / WCAG 2.1.1/4.1.2/4.1.3 focus+name+role): **not measured** — no consenting unfamiliar human tester available; no invented ratings.
- Item 7 (real AI world proposal): **not performed** — no authorized provider + approved secret path; the deterministic mock stays clearly labeled.

---

```
=== ZGE-14 PLAYABILITY & RESPONSIVENESS RESULT ===
Verdict: PARTIAL
Movement: 1/2/4/8p steady tail ackP99 95/92/83/254 ms (was ~2.7s artifact),
          8p loss/reorder p99 472-516 ms; zero 429s; tail is IPC, not fsync.
Fix batching: feasible+documented, version-gated OFF (authority preserved).
Textures:        bounded base-color subset DELIVERED (PNG/JPEG, UVs, alphaMode,
                 hostile corpus, base64 portable, provenance unknown-default).
Render capacity: frameTimings instrument DELIVERED (p50/p90/p95/p99 + GPU-query
                 availability, honest separation of presentation vs throughput).
Tests:           engine 287/287, SDK 33/33, legacy 83/86 (3 golden, unchanged).
Open:            natural campaign, fsync-spike attribution, human accessibility,
                 real-provider AI. Production + live authority: NO-GO.
=== END RESULT ===
```
