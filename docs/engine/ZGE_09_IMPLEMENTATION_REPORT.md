# ZGE-09 implementation report

2026-10-21 · bounded operational world engine certification

The local staging world now has continuous foreground supervision of the complete launcher stack, bounded fair command admission, full-path latency metrics, safer quota/read handling, database identity protection and measured multi-minute workloads. PHP/SQLite retains the sole durable gameplay writer. Live ZekNova remains LEGACY; production is unchanged.

## Baseline and scope reconciliation

The complete attached ZGE-09 request supersedes the older repository prompt where it explicitly authorizes a developer-controlled foreground supervisor; no OS daemon or startup service was installed. All requested contracts, current readiness/writer gaps, roadmap and ZGE-08 manifest were inspected. Baseline recheck: HEAD `138220f4909b3fd6a3e0dd2e62ebab63785336d7`, branch `main`, **221/221 engine**, **83/86 legacy**, 7,176 Git-visible file fingerprints. Existing dirty files, generated bundles, ignored private state and dirty nested repository were preserved. No commit, reset, production migration, deployment, credential modification or golden regeneration occurred. Final custody and safe PID/executable/cwd audits are recorded in the manifest/inventory.

The three historical legacy failures remain runtime reconstruction, renderer ownership and runtime graphics context. They still expect SHA `7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab`; the pre-existing preserved bundle is `25665bd856768b89f2283f6e44a8f93efafe074f9d0fcace5efd8296c991d115`. No historical assertion was relaxed.

## Implemented boundaries

1. Monotonic PHP/IPC/runtime/client stage metrics expose quota, admission, SQL wait/hold, evaluation, commit and reconciliation. Listener/network delay is honestly unassigned. Diagnostic probes identified quota autocommits as a major tail bottleneck; batching unchanged quota scopes and fair pre-SQL admission improve the measured path without speculative success.
2. Mutations retain locked evaluation and every current snapshot/receipt/role/session/resource/occupancy/claim/generation invariant. Reads verify consistent WAL snapshots without reserving the gameplay writer and recheck fresh revocation before publication. No movement coalescing or public grant/mission/debug mutation route was added.
3. The foreground service provides explicit start/status/stop, health, owned process tracking, restart audit/backoff/ceilings, stale socket recovery and automatic owned launcher restart. Worker-only restart preserves the launcher; the co-located launcher/runtime supervisor has one process failure boundary. The outermost monitor itself still needs explicit developer restart after its own SIGKILL.
4. Established DB device/inode identity is sealed in ready audits. Managed PDO opening requires the existing file and expected identity; missing or substituted databases cannot trigger fresh initialization. Returning the original file preserves receipts. Hot replacement/restore under an active writer is unsupported; restore into a fresh private directory with owned services stopped.
5. DR tests cover hot/cold backup, exact isolated restore/replay, corrupt/missing/truncated archive data, receipts/claims, SQLite BUSY, interrupted backup/recovery and allocation exhaustion. A real owned 32MiB HFS+ volume reached ENOSPC/SQLite FULL, rolled back the economic/mission transaction and committed once after space was restored; this is not a power-loss or whole-host disk test.
6. Player/team ownership, role departure/return and original outbox reconciliation are preserved. The bounded gameplay-completeness subset is personal/team progression plus tool-facing source interfaces; missing live aid/repair/relocation/utility/health/economy/campaign/room/reset closure is not replaced by unsafe patches.
7. Local default-deny editor APIs support scene/prefab/project/entity/component/asset inspection, metrics, pause/step and plugin registration, with sandbox-only mutation and no privileged HTTP exposure. A 79-file readable source capture builds a repeatable standalone ESM engine and runs 64 selected original tests without assets or the historical game bundle.
8. Reference capture now freezes revision/camera/provenance before async readback and includes public player identity/version counters plus a capture-only session UUID. It excludes authentication/session secrets and private progress. Neural presentation stays optional and non-authoritative.

## Certification and measurements

Final engine **251/251**, legacy **83/86** with the same three failures; source/animation/PHP/JS checks pass. The final two-context browser verifies worker restart, **automatic whole-launcher SIGKILL recovery**, pending original outbox, distinct poses/private XP, team25, shared buildings/conflict, authorization denial, revision convergence, replay and lit reference capture. All nine retained browser regression scripts pass, including native WebGPU, WebGL safe mode, boss/combat, save/reload, fallback/reference, KTX2/worker/lifecycle stress, 390 bounded parity cases and the hit-tested physical construction flow. The inherited intermittent extra interval was not reproduced or attributed; whole-page lifecycle/source/asset gates remain open.

The final complete-service mixed soak ran **600.15 seconds / 3958 HTTP requests**, eight identities and eight gateways, at 6.60 HTTP requests/s (5.01 accepted commands/s), with 0 throttles and 0 transport failures. Expected gameplay conflicts are counted separately. Exact full replay verified 3192 archived commands and 9768 events after the service stopped. A/B/E three-minute profiles and a separate three-minute 100k-event reader profile also passed. No maximum population or production SLA is inferred. [Latency](COMMAND_LATENCY_BREAKDOWN.md), [contention](AUTHORITY_CONTENTION_ANALYSIS.md), [soak](MULTIPLAYER_SOAK_RESULTS.md).

Recorded automatic launcher SIGKILL recovery was 9,876.88 ms; heartbeat retirement/recovery 11,016.59 ms. Final owned PHP before/after-COMMIT recovery was 740.31 / 1,005.83 ms. Earlier slower healthy-poll results are retained. Fresh DB absence/replacement and audit provenance tests pass. [Service](WORLD_SERVICE_SUPERVISION.md), [DR](DISASTER_RECOVERY_CERTIFICATION.md), [progression](PLAYER_TEAM_PROGRESS_CERTIFICATION.md), [source capture](SOURCE_BUILD_REPRODUCIBILITY.md), [tooling](EDITOR_SDK_READINESS.md).

| Level | Result |
|---|---|
| UNIT_PASS | PASS |
| ENGINE_INTEGRATION_PASS | PASS |
| PHP_SQLITE_STAGING_PASS | PASS |
| MULTICLIENT_BROWSER_PASS | PASS |
| SOAK_PASS | PASS bounded local complete-service duration above |
| CRASH_RECOVERY_PASS | PASS local owned failure boundaries |
| SOURCE_REPRODUCIBILITY_PASS | PASS captured independent headless boundary only |
| LIVE_ZEKNOVA_TRANSFER_PASS | NOT DEMONSTRATED — LEGACY retained |
| PRODUCTION_RELEASE_PASS | NO-GO |

The ten-minute trace is explicitly associated with its measured source tree; the final early-rejection quota fix has a separate three-minute complete managed follow-up plus the full 251-test/browser checks. See the soak source-lineage section.

## Retained diagnostics and practical operation

The first browser invocation lacked the configured Playwright path; it was rerun with the existing installed module, without installing dependencies. New progression/DR tests initially misstated existing status/retry contracts; exact contract assertions were corrected and failures retained. Coordinator crash review produced atomic metadata publication; database review produced identity/existing-only opening. Earlier soak postrun queries exceeded the harness stdout buffer, and one stale-only mixed attempt was explicitly stopped and replaced by measured preflight reads. Full traces, dispositions and final passes are archived; no state/history was discarded to improve scores.

Use `npm run dev:world-service` for the local foreground service (default loopback 8799, private `/tmp/zge09-world`), `npm run world-service:status` and `npm run world-service:stop`. Fixture secrets remain in its private directory, never the evidence package. `benchmark:world-workloads` and `benchmark:world-history:operational` reproduce paced profiles; set `ZGE_MANAGED_SERVICE=1 ZGE_PROFILES=mixed ZGE_DURATION_SECONDS=600` for the final full-service soak. `npm run verify:zge09 -- --browser` retains the previous regression/golden classification, with optional sustained flags documented in source. Source-only clean-environment instructions are in the reproducibility contract.

Provider/collector rotation and post-rotation verification remain mandatory owner-controlled production blockers and were not performed. Full live writer/aid/V4 transfer, original-game reproducible source, asset/model attribution, duplicate Three/page teardown, remote identity/TLS, larger/longer operational retention and owner release approval remain independent gates. No production release or real model inference is claimed.

## Requested result record

```text
=== ZGE-09 OPERATIONAL WORLD ENGINE RESULT ===

STATUS=BOUNDED_STAGING_PASS
HEAD=138220f4909b3fd6a3e0dd2e62ebab63785336d7
FILES_CREATED=342
FILES_MODIFIED=17
CONCURRENT_WRITER_DETECTED=NO_UNRESOLVED; AUTHORIZED_TEAM_AND_OWNED_SERVICES_ONLY

SUPERVISED_SERVICE=PASS_FOREGROUND_LOCAL; NO_SYSTEM_DAEMON_INSTALLED
AUTOMATIC_LAUNCHER_RECOVERY=PASS; 9876.88_MS_RECORDED_SIGKILL
WORLD_WORKER_FENCING=PASS_SQL_GENERATION_AND_DATABASE_IDENTITY
SINGLE_WRITER_CERTIFICATION=PASS_PHP_SQLITE_STAGING

TRANSACTION_CONTENTION=PROFILED; QUOTA_BATCHING_AND_PRE_SQL_ADMISSION
COMMAND_QUEUE_FAIRNESS=PASS_AMONG_ADMITTED_ACTORS; UPSTREAM_ACCEPT_QUEUE_BOUNDARY_REMAINS
BACKPRESSURE=PASS_BOUNDED_16_TOTAL_2_PER_ACTOR_CLASS_LIMITS
MOVEMENT_COMMAND_SEMANTICS=UNCHANGED; NO_COALESCING_OR_DROPPED_DISTINCT_RECEIPTS

ONE_CLIENT_THROUGHPUT=71.72_HTTP_REQ_S_SHORT_BURST
FOUR_CLIENT_THROUGHPUT=86.99_HTTP_REQ_S_SHORT_BURST
EIGHT_CLIENT_THROUGHPUT=70.10_HTTP_REQ_S_SHORT_BURST
MIXED_WORKLOAD_THROUGHPUT=6.60_HTTP_REQ_S; 5.01_ACCEPTED_COMMANDS_S

P50_LATENCY_MS=17.40
P95_LATENCY_MS=33.09
P99_LATENCY_MS=78.97
LOCK_WAIT_P95_MS=0.0160
TRANSACTION_P95_MS=16.76

SOAK_DURATION=600.15_SECONDS_MAIN;180.00_SECONDS_FINAL_QUOTA_FOLLOWUP;3958_PLUS_1188_HTTP;ZERO_TRANSPORT_FAILURES
MEMORY_GROWTH=+6.97_MIB_AGGREGATE; TAIL_SLOPE=+6.44_MIB_MIN
RESOURCE_LEAKS=BOUNDED_OBSERVATION_ONLY; FD_227_TO_227_PEAK_229; NO_INDEFINITE_ZERO_LEAK_CLAIM
SATURATION_POINT=NOT_ESTABLISHED; 1_2_4_8_16_IDENTITIES_TESTED

INDEPENDENT_PLAYER_PROGRESS=PASS_BOUNDED_CONSTRUCTION_POLICY
TEAM_REWARD_INTEGRITY=PASS_ONCE_ONLY_ATOMIC_CLAIMS
MULTIPLAYER_CONVERGENCE=PASS_BROWSER_OUTBOX_AND_FULL_ARCHIVE_REPLAY

BACKUP_RESTORE=PASS_ISOLATED_HOT_COLD_VERIFIED_RESTORE
CRASH_RECOVERY=PASS_STAGING; OUTER_PARENT_ITSELF_REQUIRES_EXPLICIT_RESTART
DISK_FULL_RECOVERY=PASS_OWNED_32MIB_HFS_VOLUME_ENOSPC_AND_SQLITE13; NOT_POWER_LOSS
HISTORY_REPLAY=PASS_100K_SYNTHETIC_ARCHIVE_AND_3192_ACTUAL_MIXED_COMMANDS

SOURCE_OWNED_RUNTIME=PASS_BOUNDED_ENGINE_STAGING_AND_TOOL_APIS
LEGACY_LIVE_AUTHORITY=LEGACY
LIVE_WRITER_DISABLED=NO
AID_CALLBACK=UNRESOLVED_QUARANTINED_BEFORE_SPEND
SOURCE_REPRODUCIBILITY=PASS_79_FILE_CAPTURE_64_TESTS_REPEATABLE_ESM; ORIGINAL_GAME_NOT_REPRODUCIBLE

WEBGPU=PASS_BOUNDED_BROWSER_REGRESSION
WEBGL=PASS_SAFE_MODE_AND_SOURCE_DEMO
NEURAL_FALLBACK=PASS_NATIVE_REFERENCE_AND_MOCK_ONLY; NO_REAL_INFERENCE

ENGINE_TESTS=251/251
LEGACY_TESTS=83/86; SAME_3_GOLDEN_FAILURES
NEW_REGRESSIONS=NONE_FINAL; DIAGNOSTIC_ATTEMPTS_RETAINED

CREDENTIAL_ROTATION_STATUS=OWNER_AUTHORIZATION_REQUIRED; NOT_PERFORMED
PRODUCTION_SECURITY_GATES=BLOCKED_PROVIDER_COLLECTOR_ROTATION_AND_POST_ROTATION_VERIFICATION
UNRESOLVED_BLOCKERS=LIVE_WRITER_AID_V4_FULL_PORT; ORIGINAL_SOURCE_BUILD_ASSET_LIFECYCLE; REMOTE_IDENTITY_TLS; PRODUCTION_OPERATIONS_AND_OWNER_RELEASE

NEXT_MILESTONE=ZGE_10_SUSTAINED_OPERATIONS_AND_INDEPENDENT_SDK_INTEGRATION
GO_NO_GO=GO_BOUNDED_LOCAL_STAGING; NO_GO_LIVE_TRANSFER_OR_PRODUCTION
```

Final-source follow-up result: 180.00 seconds, 1188 actual HTTP requests, 0 throttles and 0 transport failures; complete read-only audit matched 964 commands and 2965 events, 4 personal claims and 1 team reward. E2E p50/p95/p99 were 16.53/33.85/463.28 ms. The final source tree is `63b567879b19f742234763c1524eefd8d67ef192558ac07add8878e3d0fbe888`.
