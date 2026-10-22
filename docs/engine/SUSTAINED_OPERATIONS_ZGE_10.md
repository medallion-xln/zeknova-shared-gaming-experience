# Sustained local operations — ZGE-10

The continued operational certificate uses fresh private fixtures and the complete foreground service → launcher/runtime supervisor → eight gateway wrappers/PHP children → one fenced world worker. The existing developer service on 8799 is left unchanged. No OS daemon, production database, quota exception, credential rotation or alternate gameplay write path is introduced.

The new complete managed mixed soak requests 900 seconds, longer than ZGE-09's ten-minute run, with eight independent authenticated actors and six scheduled intents/s. Construction includes real preflight state reads, so actual HTTP throughput is about 6.6/s. Synthetic initial shared stone is explicitly 100,000, matching the archive audit's seed policy. Personal XP remains 14 per accepted placement, team claims at most once, and resource supply nonnegative. Gameplay conflicts are counted separately from HTTP/transport failures. The harness retains original command IDs on retry.

Resource sampling now uses asynchronous subprocesses; its changes do not modify server authority or quota behavior. Worker memory/GC observations are additive diagnostics only. The authority source is otherwise ZGE-09's final early-error quota version. The source capture, worktree custody manifest and measured scripts identify exact lineage. A separate retained 180-second synchronous-sampler control reproduces the old client timing artifact.

The final report below records elapsed time through the final acknowledgment, exact request/class/accept/reject counts, CPU, RSS/heap/GC, FD/process/worker counts, DB growth, errors/throttles/restarts, stage quantiles and replay. Sampled CPU misses transient lease helpers; percent CPU means one logical core, not all host cores. Aggregate RSS includes harness and all sampled owned services. Health samples are not a complete high-frequency allocation trace. End HTTP replay validates the bounded checkpoint tail; the separate read-only full archive audit after stopping owned writers verifies every archived command, receipt, seal, event, claim and final snapshot.

Existing operational regression coverage is retained: fair admitted-actor scheduling and per-actor/class limits, early-error quota charges, worker generation fencing, revocation/session/disconnect, same-ID retry, launcher SIGKILL recovery, DB dev/inode checks and existing-only opening, original DB return, restart ceiling, pre/post-COMMIT PHP death, backup/restore, archive corruption, SQLite BUSY/FULL and interrupted recovery. Full engine tests re-execute those cases. The disposable-volume OS ENOSPC certificate is historical ZGE-09 evidence and its handling is unchanged; this milestone does not repeat a whole-volume fill or claim power-loss recovery.

The outermost foreground monitor cannot supervise its own SIGKILL. Its test kills the owned parent, verifies child shutdown and explicitly starts a new service through stale-control/lock recovery. Owned launcher failure recovers automatically while that monitor stays alive. No machine reboot, WAN failover or persistent OS-service certificate is claimed. Publishing editor scenes into this database is unsupported; browser authoring storage remains a distinct authority domain.


## Completed measurement

| Observation | Measured result |
|---|---|
| Duration / real HTTP | 900.000795s / 5940 |
| Clients / gateways / world executors | 8 / 8 / 1; one worker start, no restart |
| Successful commands / gameplay rejections | 4599 / 180 (178 occupied, 2 stale shared revision) |
| HTTP throttles / transport errors | 0 / 0 |
| E2E p50 / p95 / p99 / maximum | 17.75 / 31.84 / 79.96 / 576.20ms |
| Admission / SQL lock / IPC p95 | 2.016 / 0.020 / 14.850ms |
| Sampled owned CPU | 120620ms; 13.40% of one core; transient helpers can be missed |
| Aggregate RSS start / end / peak | 683.66 / 569.03 / 702.41MiB |
| Aggregate RSS change / tail OLS | -114.625MiB / -3.963MiB/min after first 20% |
| Worker heap used first / last sample | 7.13 / 21.86MiB |
| Worker heap used observed range / tail OLS | 7.08–23.98MiB / +0.398MiB/min |
| Worker heap capacity first / last | 10.64 / 42.89MiB |
| Worker cumulative GC count / duration | 8→1583 / 1.91→631.44ms; no forced GC |
| Harness heap tail | +0.412MiB/min, includes intentionally retained traces/samples |
| Numeric owned FDs start / end / peak | 224 / 224 / 230 |
| Long-lived Node children excluding harness/monitor | 10 throughout: launcher, worker, 8 gateway wrappers; plus 8 PHP children |
| DB+WAL+SHM bytes start / end | 204800 / 13565952 |
| Full archive audit | 4787 commands / 14910 events; all receipts/events/claims and complete snapshot exact; 32.21s read-only audit |
| Progress / final state | revision4607, 180 accepted placements, four private XP totals630, four personal claims, one team claim, shared stone99280 |

The 4787 archive commands include eight setup joins plus timed accepted/rejected gameplay commands. Read/session HTTP requests are separately counted; no HTTP total is relabeled as gameplay throughput. Exact complete snapshot/receipt/event comparison supplies convergence evidence; two independent browser replicas also re-exercise outbox/recovery convergence. Raw data and 181 resource samples are in `evidence/zge10/async-soak`; stage/outlier/per-PID analyses are in `evidence/zge10/analysis/latency-memory.json`.

Aggregate RSS falling does not establish memory health: worker used heap has a positive sampled tail and its last three-minute floor is higher than early windows. Longer fixed-state runs with retained-heap snapshots/allocation profiling remain open. FD/process bounds and no restarts are demonstrated only for this duration/workload.
