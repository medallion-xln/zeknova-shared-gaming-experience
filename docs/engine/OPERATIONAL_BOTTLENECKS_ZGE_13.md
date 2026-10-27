# Operational bottlenecks — ZGE-13

**Sustained runtime analysis with per-stage attribution. Rare database-open spikes and whole-service heap growth are further narrowed, not fully solved.**

## Managed soak

`scripts/zge13-*` operational harness drives a mixed 8-player workload (movement + construction + missions + reads + reconnects) against the supervised PHP world service for **900.0 s**, recording 5903 HTTP requests with per-request stage spans.

| Metric | Value |
|---|---|
| Duration | 900.001 s |
| HTTP requests | 5903 (5827 accepted, httpAccepted) |
| Accepted commands | 4495 (4.99 command/s) |
| Request rate | 6.56 req/s |
| End-to-end latency p50 / p95 / p99 | 29.31 / 199.66 / 652.71 ms |
| Transaction p50 / p95 / p99 | 15.32 / 87.00 / 172.50 ms |
| Duplicate receipts | 0 |
| Throttled (per-principal/IP) | 12 |
| Rejected commands | 192 (occupied 167, stale-world-revision 25, admission-busy 11, …) |
| Transport failures | 64 (runtime-unavailable 33, transport-disconnected 31) |
| Exact archive replay | PASS |

## Stage-level attribution (5792 instrumented transactions)

| Stage | p50 | p99 | max (ms) |
|---|---|---|---|
| admission (queue wait) | 0.94 | **343.40** | 2879.81 |
| ipc (worker) | 13.19 | **177.30** | 1949.30 |
| validation | 2.27 | 26.40 | 673.03 |
| databaseOpen | 0.77 | 25.19 | **482.38** |
| commit | 0.41 | 8.30 | 96.57 |
| quota | 0.40 | 16.82 | 1963.57 |
| runtimeEnsure | 0.52 | 17.87 | 208.21 |
| commit/other stages | < 1 | ≤ 8.5 | ≤ 96.6 |

**The dominant tail is `admission` queue wait (p99 343 ms)** — command contention waiting for the single durable writer — followed by `ipc` (worker round-trip). `commit` itself is cheap (p99 8.3 ms). This is the expected cost of preserving single-writer authoritative durability, not a hidden latency bug.

## Database open spikes

`scripts/zge13-db-probe.mjs` uses a private synthetic WAL/FULL SQLite database (4096-byte values), recording open / BEGIN IMMEDIATE / COMMIT and a deliberate writer-lock wait:

| Stage | p50 | p95 | p99 | max (ms) |
|---|---|---|---|---|
| open | 0.11 | 0.30 | 0.53 | 2.06 (barrier run 4.30) |
| begin | 0.002 | 0.003 | 0.005 | 0.015 |
| commit | 0.055 | 0.16 | 0.20 | 0.32 |

A separate process attempting `BEGIN IMMEDIATE` while another holds the writer transaction for 200 ms waits ~209/228 ms then rolls back — **deliberate writer-lock contention reproduced**. This causally demonstrates admission contention, but does **not** prove that a historical `databaseOpen` spike (482 ms in the soak) had fsync/paging as its cause. Kernel fsync, scheduler off-CPU time, and per-device attribution remain untraced.

## Heap: no confirmed leak; whole-service growth indeterminate

The fixed-state evaluator probe and 24-switch editor retention tests (retained from ZGE-12 and re-run) show **zero old-engine references** after every disposal (`liveOldEngines:0` at all 24 checkpoints) and stable post-GC heap. The sustained worker used-heap trend remains positive. As stated continuously, a positive slope is **not** proof of a leak, and a falling RSS is not leak-freedom. Whole-service retained-size attribution remains INCONCLUSIVE.

## Preserved invariants

WAL / `synchronous=FULL`, single-writer fencing, idempotent original-ID receipts, quotas, auth, backups, archives, and fair admission are all unchanged. No durability weakening, no receipt coalescing, no quota increase. Outer OS supervision / remote failover remain separate scope.

Charts: `evidence/zge13/charts/operations-stage-attribution.png`, `database-latency-outliers.png`.
