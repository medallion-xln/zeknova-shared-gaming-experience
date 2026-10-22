# Performance and reliability — ZGE-05

Measurements are local wall-clock samples in milliseconds, not production limits or a causal extraction speedup. Same machine/Node and unchanged benchmark corpus for before/after; no release ±10% claim. Raw distributions/counts/heap samples are retained.

## Existing Construction workload, before → after

500 scalar decisions, 100 placements, 20 serialize/restore repetitions, 1000 kernel steps (`scripts/zge04-benchmark.mjs`).

| Operation | Before p50 / p95 ms | After p50 / p95 ms |
|---|---|---|
| Decision | 0.0060 / 0.0454 | 0.0059 / 0.0090 |
| Construction transaction | 0.2791 / 2.6510 | 0.1976 / 0.8880 |
| Serialization | 2.8041 / 9.8646 | 2.8015 / 3.2362 |
| Restore | 11.0283 / 18.4616 | 11.0733 / 17.9399 |

The hundred-command serialized history stays 1,328,895 bytes. Both runs retain the pre-existing before-image journal: this is not scalable undo. Heap deltas before/after 10,411,560/11,135,768 bytes are allocation samples and cannot establish a leak.

## Added connected work and event overhead

`scripts/zge05-benchmark.mjs`: same power definition, scalar terrain, balance and accepted point for 1000 legacy base site/affordability decisions versus engine evaluations; no live UI/capture. The engine also returns detached structured output, so they are comparable decisions with different isolation work, not equivalent whole-frame costs. Forty transactions include candidate preparation, mission/reward logic, full journal validation and publication. Twenty server acknowledgments include snapshot storage/CAS/receipt preparation in-process; network transport time is excluded.

| Work | Count | p50 ms | p95 ms |
|---|---:|---:|---:|
| Legacy scalar decision | 1000 | 0.0017 | 0.0030 |
| Engine scalar decision | 1000 | 0.0059 | 0.0085 |
| Runtime transaction + mission/events | 40 | 6.0944 | 13.4150 |
| Journal append/validation + 10 subscribers | 200 | 0.4936 | 0.8319 |
| Runtime JSON serialization | 20 | 0.6435 | 0.7905 |
| Runtime restore/validation | 20 | 9.4804 | 22.2957 |
| Server fixture checkpoint acknowledgment | 20 | 12.1790 | 22.9120 |

Event benchmark includes growing-journal clone/validation, not just callback fanout: 2000 deliveries. Forty-operation runtime snapshot 348,769 bytes. Post-explicit-GC retained fixture heap delta 2,858,104 bytes includes runtime, journals and server checkpoint receipts. It is not a memory leak measurement. Full candidate snapshots, before-images and full snapshot fingerprints in save receipts grow with history. Checkpoint/delta compaction and capacity limits are required before production-sized/long-running worlds. This heavier contract costs more than the older construction-only transaction; the added cost is disclosed, not hidden as a speedup.

## Browser samples

Same 1280×900 viewport, 30 invalid placements and 120 RAF intervals per live LEGACY/SHADOW mode; optional shadow capture/comparison only runs when explicitly enabled. Final placement p50/p95: LEGACY 0.00/0.10 ms; SHADOW 0.20/0.40 ms. Both frame p50/p95/p99 approximately 16.7/16.8/16.8 ms in this capped run. Default LEGACY performs no engine shadow work. Sampled heaps 122,970,507/266,462,571 bytes are different navigation/cumulative-GC states, not an attributable shadow allocation budget.

Independent scene: 180 frame intervals, p50/p95/p99 16.7/16.8/16.8 ms. Three presentation restarts retain 9 renderer geometries, unchanged listener count and one RAF loop; final disposal owns/removes all listeners/loop. Existing live follow-up settles at listener/interval delta zero across restartable directors (29). Detached DOM counters are reported separately; no whole-game teardown claim.

Existing asset/cache/KTX2 tests and actual WebGPU/WebGL stress remain green: forced worker death, silent timeout, fresh-byte retry, real GLB/KTX2/WASM loading and pool limits. Parsed/raw cache budgets and the four-worker policy are unchanged. The original GLTF hang's exact historical root cause remains open; successful forced-fault tests do not prove attribution. Duplicate embedded Three implementation remains separately tracked and unchanged.
