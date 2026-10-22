# Command latency breakdown — ZGE-09

PHP records monotonic handler spans for payload, DB open, quota, authentication, authorization, runtime readiness, fair admission, gameplay lock wait, snapshot/receipt/connection validation, IPC, candidate fence validation, transaction writes, precommit checks, COMMIT, event read, receipt projection and response serialization. Stable world/logical-command IDs, a one-way logical transaction trace key and worker generation associate measurements without logging credentials. Runtime records queue wait and evaluation separately; `StagingWorldClient` reports validated HTTP acknowledgment and reconciliation durations through optional `onMetrics` / `lastMetrics`.

`metrics.totalMs` begins at PHP handler entry. HTTP listener accept queues and network/client JSON work are not separately observable there (`upstreamQueueMs=null`). Client E2E includes them. Span sums, transaction duration and runtime evaluation overlap; they must not be added together. Response serialization times a preliminary encode, not kernel socket delivery; client acknowledgment is the delivery observation. Authentication aggregates initial, in-transaction, precommit and fresh-response checks.

## Matched short diagnostic probe

Each row is 64 actual movement commands, distinct authenticated actors, up to eight PHP gateways and one fenced world executor. Before uses instrumentation with the original quota/write architecture; after uses fair admission and batched unchanged quotas. These probes ran on the same machine during development; background tests varied. Small-sample p99 is descriptive, not a service bound.

| Clients | Before req/s | After req/s | Before p95 ms | After p95 ms | Before quota p95 ms | After quota p95 ms |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 69.92 | 73.01 | 17.97 | 17.46 | 0.47 | 0.29 |
| 2 | 74.25 | 73.54 | 16.49 | 32.75 | 0.59 | 0.42 |
| 4 | 65.08 | 66.74 | 103.99 | 63.48 | 20.03 | 0.30 |
| 8 | 58.77 | 62.31 | 364.32 | 126.67 | 352.34 | 0.27 |
| 16 | 52.62 | 57.24 | 574.45 | 255.60 | 250.12 | 0.26 |

At eight clients p95 moved from 364.32 to 126.67 ms, while the final write-transaction architecture stayed intact. This supports the observed quota/admission bottleneck diagnosis; it does not establish a general speedup or sustained maximum. Raw per-request traces are retained in `evidence/zge09/latency-before` and `latency-after`.

## Final burst recheck

The final separate matrix starts its request timer after the initial resource sample; earlier diagnostic probes included that small sampler setup cost, and their raw results are retained. The final 1/2/4/8/16-client matrix retains all commands, receipts and events and independently replays every archived record after the owned writer stops. These are 64-command local bursts under unchanged quotas, not sustained traffic or an established saturation point.

| Clients | Gateways | req/s | p50 ms | p95 ms | p99 ms | Admission p95 ms | SQL lock p95 ms | Transaction p95 ms |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 71.72 | 13.08 | 19.81 | 22.96 | 1.08 | 0.01 | 13.40 |
| 2 | 2 | 93.99 | 21.38 | 28.97 | 31.19 | 12.89 | 0.01 | 12.02 |
| 4 | 4 | 86.99 | 44.88 | 63.92 | 68.79 | 47.17 | 0.02 | 12.84 |
| 8 | 8 | 70.10 | 111.37 | 156.77 | 160.73 | 134.63 | 0.01 | 13.19 |
| 16 | 8 | 59.99 | 261.83 | 318.05 | 341.84 | 159.18 | 0.02 | 15.15 |

## Sustained complete-service trace

The final 600.15-second managed mixed run had 3958 real HTTP requests, eight identities/eight gateways, one world worker and automatic outer supervision. E2E p50/p95/p99 were 17.40/33.09/78.97 ms. Quota/admission/SQL-lock/transaction p95 were 0.76/8.79/0.02/16.76 ms; runtime evaluation p95 was 8.69 ms. Raw stage distributions and incremental request traces, including rejected intents, are published with the soak results. The actual client-class metrics callback is separately tested and browser-certified; benchmark harness reconciliation is assignment/response decoding rather than the complete UI renderer.

The full live legacy game remains outside this authority path. See [contention analysis](AUTHORITY_CONTENTION_ANALYSIS.md) for why optimistic candidate execution was not adopted.

The recorded 600-second run used source tree `1be9a7411ec80ecea7ea995b8f5590ef1a599e269e940b491315b90c7a52d585`. A final security-only follow-up charges authenticated early validation/admission failures exactly once; it leaves successful-command scheduling/commit semantics unchanged. A fresh 180-second managed profile and full 251-test/browser checks validate the final source after this fix. The longer run is retained as a distinct measured source variant rather than being relabeled as a new run.
