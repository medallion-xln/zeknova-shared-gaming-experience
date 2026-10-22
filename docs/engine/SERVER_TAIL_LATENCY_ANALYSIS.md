# Server tail-latency investigation — ZGE12

**NORMAL_BASELINE_LOW; DELIBERATE_WRITER_LOCK_WAIT_REPRODUCED; HISTORICAL_RARE_OPEN_COMMIT_CAUSE_UNRESOLVED.** PHP/SQLite remains the sole durable single writer. WAL, synchronousFULL, transactions, auth, leases/fencing, quotas, receipts and replay rules are unchanged.

A private synthetic database runs600 PDO open/read and write/COMMIT cycles,4096-byte values, recording open, BEGIN IMMEDIATE, COMMIT, periodic PASSIVE checkpoint state/duration and WAL size. No production database is opened. The control does not change service pragmas.

| Stage | p50 | p95 | p99 | max ms |
|---|---|---|---|---|
| openMs | 0.0860 | 0.1285 | 0.2508 | 1.5533 |
| beginMs | 0.0017 | 0.0024 | 0.0042 | 0.0069 |
| commitMs | 0.0462 | 0.1496 | 0.2732 | 3.1186 |


A separate process attempts BEGIN IMMEDIATE while another connection holds the writer transaction for200ms. It waits154.21ms after process startup, then rolls back successfully. This causally demonstrates explicit writer-lock contention at admission to the transaction. It does not demonstrate that a historical COMMIT/open spike had that cause. Checkpoint timing is observable; kernel fsync, scheduler off-CPU time and per-device causal attribution were not traced.

The longer complete-service run retains all per-request transaction/open/runtime IPC/evaluation/commit spans and sampled worker GC/CPU/RSS/FD/database observations. Read actual results in LONG_RUN_OPERATIONS_ZGE_12.md. Prior BENCH databaseOpen maximum305.94ms had no nearby observed failure and was not assigned an invented cause. Historical278/488ms COMMIT and160/402ms open tails remain unresolved unless a newly correlated trace supports attribution. A low idle probe cannot certify their absence.

No artificial sync downgrade, relaxed identity check, quota increase or shorter normal BUSY timeout was used. This is partial root-cause progress with explicit storage/OS limits, not a production SLA.

New staged maxima: COMMIT44.357ms and databaseOpen299.432ms; request max399.557ms. These are real spans under the disclosed shared-host workload, not evidence of complete causal attribution. Full per-request stages and coarse GC windows are retained in operations analysis.
