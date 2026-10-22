# Multiplayer sustained and soak results — ZGE-09

All workloads use actual authenticated loopback HTTP and isolated disposable SQLite databases. Normal limits remain 600 requests/minute/IP and 240/principal; health has its existing separate quota. Main scheduler ticks at six intents/second. Mixed construction adds real measured preflight reads, so its actual request rate is higher and still below 600/minute. No grant endpoint, quota increase, receipt deletion or command coalescing improves a score.

Each gameplay profile uses eight distinct identities, eight PHP gateways and one persistent world worker. A/B/E use the supervised-world fixture; C runs the **complete outer service → launcher → gateways → fenced worker** stack for 600.15 seconds. Profiles overlapped on the same host during certification, and background regression work is disclosed. The final short capacity matrix ran separately afterward. CPU/RSS evidence is process-scoped, not a whole-machine utilization or maximum-player claim.

| Profile | Seconds | HTTP requests | Successful command acknowledgments | Gameplay rejections | HTTP throttles | Transport/service failures | HTTP req/s | E2E p50 / p95 / p99 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Movement | 180.15 | 1079 | 1079 | 0 | 0 | 0 | 5.99 | 16.55 / 32.41 / 274.35 |
| Construction | 180.11 | 1079 | 134 | 945 | 0 | 0 | 5.99 | 15.33 / 28.77 / 280.32 |
| Managed mixed soak | 600.15 | 3958 | 3005 | 179 | 0 | 0 | 6.60 | 17.40 / 33.09 / 78.97 |
| Recovery | 180.11 | 1079 | 1074 | 0 | 0 | 5 | 5.99 | 16.25 / 33.78 / 284.42 |

A is movement-heavy. B deliberately submits construction against cached shared revisions to exercise conflicts, resource spending, placement/removal, personal claims and team completion. C combines movement, successful construction/removal, preflight/state reads and session connect/disconnect. E kills its real world child 5 times during traffic; failures retain the same command IDs and eventually reconcile. All final logical intents in these profiles are acknowledged or rejected; unresolved count is zero. HTTP 200 with a rejected gameplay result is reported separately from transport success.

Construction fixtures explicitly start with **100,000 shared stone** to sustain spending; movement uses the normal 12. This private initial policy is declared and used identically by full archive replay, never accepted from client gameplay fields. It does not change the default world or production rules. The normal disaster-recovery CLI is certified on the default supported world policy; synthetic resource-rich benchmark replay uses `zge09-audit-workload.mjs` with its explicit initial fixture policy.

## Resource ownership and trends

Samples are approximately five seconds apart. RSS includes the harness, retained traces, long-lived PHP processes, and owned launcher/worker/wrapper processes; C therefore includes more service processes than A/B/E. CPU sums sampled per-PID deltas, including observed restarts; transient lease helpers may be missed. A percentage is of one CPU core, not all ten host cores. FD counts are numeric owned descriptors, not all mapped binaries or a page-level renderer teardown proof.

| Profile | RSS start / end / peak MiB | Tail RSS slope MiB/min (after first20%) | FD start / end / peak | Mean sampled CPU | DB+WAL+SHM start / end bytes |
|---|---|---:|---|---:|---|
| A | 389.47 / 377.84 / 407.84 | -1.29 | 81 / 81 / 88 | 10.62% | 204800 / 3194880 |
| B | 389.38 / 371.70 / 395.02 | -3.30 | 81 / 81 / 88 | 9.91% | 204800 / 2703360 |
| C | 713.64 / 720.61 / 743.28 | 6.44 | 227 / 227 / 229 | 12.89% | 204800 / 8970240 |
| E | 389.33 / 372.17 / 397.80 | 1.56 | 81 / 81 / 88 | 10.47% | 204800 / 3145728 |

C RSS changed by 6.97 MiB and its measured tail slope was 6.44 MiB/min. This includes intentionally retained benchmark traces and archive data; it is not proof of zero leaks or an indefinite memory plateau. FD samples and peak values remain published rather than reduced to an unsupported zero-leak claim. All owned test processes are stopped after measurement. Database growth reflects retained commands/events/claims; no authority archive is pruned.

After stopping C, read-only full replay verified **3192 archived commands / 9768 events**, every receipt/fingerprint/event seal/claim and the exact complete actor snapshot in 20110.73 ms. The archive count includes eight setup joins; timed command traffic is reported separately above. The archive count includes eight setup joins; timed command traffic is reported separately above. A/B/E also passed complete archive audits. `replay` on the HTTP runtime independently checks the bounded checkpoint tail; it is not substituted for complete archive verification.

## Long-history profile D

D uses a separate read-only synthetic historical archive of 100,000 representative events, with one PHP gateway and eight authorized reader identities; no gameplay worker is involved in this archive-only fixture. The initial complete 100k HTTP backfill/replay passes. A paced 180.20-second run performed 1080 pages at six requests/second, zero throttles, p50/p95/p99 12.00/23.29/74.75 ms. Eight replicas each ended at cursor 34560, matching the exact source-event prefix. They did not each complete 100k during this timed window. A documented 50.10-second excluded wait allowed the setup backfill's rate bucket to expire; quotas were not reset or weakened. Resource samples, stage traces and full replay checks are retained.

## Diagnostic attempts retained

Earlier fixture-only ten-minute attempts finished traffic but their postrun whole-receipt dump exceeded Node's default stdout buffer (`ENOBUFS`, reproduced read-only). The invariant now uses scalar SQL aggregation, with bounded batch archive replay. These attempts are not certified soak passes. One partial managed run was deliberately stopped after review showed its mixed construction used only stale actor snapshots; a measured preflight read was added and the complete final run repeated. Partial traces/state and disposition are retained. Initial audit attempts lacked old fixture metadata; unique recorded lease-owner identity located the original private fixture, then complete read-only audits passed. No database history or assertion was removed.

The final bounded soak passes for this local workload. Saturation point, supported maximum population, multi-host/WAN behavior, longer retention and indefinite resource stability are **not established**.

## Final quota follow-up source lineage

The 600-second measurement predates the final authenticated early-rejection accounting fix (captured source tree `1be9a7411ec80ecea7ea995b8f5590ef1a599e269e940b491315b90c7a52d585`). The successful request and commit path is unchanged. A separate 180-second complete managed mixed run on the final source, together with the exact quota-denial test and full 251-test/browser certificate, is retained under `evidence/zge09/quota-sustained`. These are separate measured versions, not a fabricated repeat of the ten-minute run.

Final-source follow-up result: 180.00 seconds, 1188 actual HTTP requests, 0 throttles and 0 transport failures; complete read-only audit matched 964 commands and 2965 events, 4 personal claims and 1 team reward. E2E p50/p95/p99 were 16.53/33.85/463.28 ms. The final source tree is `63b567879b19f742234763c1524eefd8d67ef192558ac07add8878e3d0fbe888`.
