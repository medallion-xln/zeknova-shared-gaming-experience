# ZGE-06 — Durable source-owned world engine

**BOUNDED PASS for an isolated persistent PHP/SQLite source-owned world. Live construction takeover and production deployment remain NO-GO.** HEAD `138220f4909b3fd6a3e0dd2e62ebab63785336d7` unchanged; no commits, staging/reset, minified patches, golden updates, production configuration/credential/database/privilege changes.

## Implemented and executable

The independent 3D world now supports an authenticated staging session backed by actual PHP HTTP + SQLite transactions executing the **existing** JavaScript ConstructionRuntime. Authentication/world membership/role and allowed command fields are checked server-side. Catalog, terrain/collision, shared resource validation, revisions, command identities, mission completion and once-only colony reward all execute from the server snapshot. The browser is a confirmed read-only replica with a persisted request outbox; it runs no competing authoritative construction simulation in server mode.

PHP acquires BEGIN IMMEDIATE before reading/dispatched gameplay. Snapshot/inventory/buildings/revision, command receipt, immutable event rows, unique reward claim and optional checkpoint commit together. Durable idempotency resolves prior `(world,player,commandId)` before re-execution; changed payloads reject. CAS checks revision and event cursor. Process crash/rollback before COMMIT leaves no effects; crash/lost reply after commit recovers through the receipt. Rejections may durably record audit outcomes without gameplay revision/resource mutation. Event pages cannot exceed the snapshot's confirmed cursor, even if another transaction commits before response presentation. This is effectively-once effects under tested conditions, not exactly-once delivery.

SQLite/parameterized SQL was chosen after inspecting the actual current file-lock JSON save/room backend. No repository MySQL schema or pre-existing local SQLite workflow was found; installed PDO drivers are not evidence of production integration. New routes/database/session identities are isolated, explicitly enabled and loopback-only; existing `api/save.php`, `api/multiplayer.php` and production bootstrap remain unchanged.

Runtime v2 checkpoint support preserves world/inventory/player/mission/reward state and global event offsets while bounding the active command/event/before-image tail. PHP archives all command receipts/events, retains newest two derived checkpoints, and validates old command IDs in the archive before dispatch. Configurable checkpoint interval defaults 32; client inspector window 256 and HTTP pages 128. No authoritative receipts/events are pruned. Existing runtime v1 behavior/snapshots and local demo remain supported.

V4 migration now provides a versioned immutable **read-only core-world projection** and complete original payload/canonical provenance, idempotent validation and lossless semantic rollback. XP/rank/known extension, balances/building IDs, mission/boss claims/revisions are represented; unknown data is preserved. Failed/tampered migration cannot call the write callback. This does not invent missing historical receipts or make the unrelated stone/shelter demo a live ZekNova economy. A full game-specific executable V4 migration remains a gate.

## Gameplay session and source writer status

Run `npm run dev:staging-world`, then open `http://127.0.0.1:8796/examples/construction-world/?server=1`. The launcher reports a private fixture identity file; login with an isolated builder identity. Use another browser profile/identity for the shared world. Per-command SQLite acknowledgment, revision/cursor/connection inspector, reconnect/outbox retry, browser/server restart, movement/collision, construction, mission/25-XP reward and read-only events share that one server authority. Resource grants and simulated alternate identity controls are disabled server-side. The current example shares one builder/avatar and colony XP; per-player avatars/profiles are future work. Existing local mode remains independently usable.

Reference captures carry server world ID and revision through the existing interfaces. Native WebGL scene and live WebGPU/WebGL checks pass; missing neural service falls back to native, mock labeling/sequencing remains. No weights/training or Sentinel authority expansion occurred.

SOURCE_WRITER_COVERAGE maps live pointer/place, addRecord, validation diagnostics, progression/aid, drag/repair/damage, restore/reset, room merge and broader economic mutation paths. None is disabled. Aid contract tests reconstruct actual tags/cooldown/order/failure: the captured original effect callback is absent, and the wrapper throws after record/cooldown changes. The observed partial failure is certified; successful benefit semantics are unresolved and remain LEGACY-owned. No guessed replacement or additional live prototype wrapper was introduced.

The earlier actual-legacy/local AuthorityDomain migration/rollback fixture still passes with its shared command journal. New durable receipt recovery survives compaction/process restart. Neither proves full live writer isolation, effect parity, complete V4 execution migration, original build reproducibility or owner approval; LIVE_CONSTRUCTION_MIGRATION defines the precise required replacement boundary.

## Certification

Baseline **140/140** engine tests; final **167/167** (27 added, all prior preserved). This includes ten actual PHP/SQLite HTTP/process/concurrency/fault/reward tests, V4 projection/rollback/provenance tests, history/checkpoint/cursor tests, HTTP client recovery/window tests and actual aid-wrapper contracts. The 1000-actual-command fixture verifies a maximum 32-command active tail, exact revision/balance, preserved receipts and event replay.

Legacy before/after **83/86**, the same three historical golden failures. Inventory remains 85 matching test files + the original Picasso report. Node placement parity **702/702** and actual browser manager parity **390/390**, no skipped/mismatched rows in the bounded corpus. Structural checks, animation audit and Node demo pass. Existing persistence/assets/KTX2/transaction/world/neural tests remain included.

Two independent browser contexts pass real fixture login, keyboard movement, server deduction, mission/reward, simultaneous conflicts, reconciliation, lost reply, PHP restart, browser reload, exact convergence, replay and reference capture. Existing game browser checks cover WebGPU, safe WebGL, movement/collision/construction/combat/boss, v4 save/ID restore, heartbeat disconnect/recovery, mock capture/reward/XP 777 restoration, neural absence, director/page restart and asset stress. Both previous local demo versions remain tested. Eight final browser scenario groups pass; raw initial failures remain alongside final assessment.

Diagnostic corrections: the new browser transport initially called an unbound fetch method, producing Illegal invocation; fixed with a bound global-call wrapper and real-browser recheck. The first history run exposed PHP object-to-array conversion; fixed object-preserving checkpoint/runtime serialization and exact replay rechecked. An older live probe failed in boss mode because its Ensign had a pending emergency extraction; ZGE-06's derived probe records/reset fixture health/extraction before input while retaining the 1–15 metre assertion. Final movements ~9.6–11.1 m pass. No live movement/death behavior changed. These diagnostic artifacts are retained, not hidden as clean first attempts.

## Performance and limits

All 1k/10k/100k representative event fixtures completed against actual PHP SQLite storage. The 100k fixture retains 128 resident buildings and reward/progress state: full replay ~79.0 ms; checkpoint plus 1000-event tail ~2.7 ms; checkpoint 15,348 bytes; database 54,747,136 bytes. Resources/IDs/rewards/ownership match exact canonical/SHA-256 checksums across reference, checkpoint and client audit replay. Raw append/paging/compaction/load/heap percentiles and database artifact digests are in WORLD_HISTORY_SCALING/evidence. This is an archive workload, not 100k full gameplay transactions or end-to-end WAN sync. JS page decode/replay and PHP database paging are measured separately; a full uncompacted reference array is intentionally retained for comparison and is not a bounded-heap claim.

An isolated rerun of the unchanged construction benchmark has median ~0.190 ms; richer 40-command runtime median ~6.49 ms. Actual successful HTTP sample count 30, p50 ~146 ms and p95 ~531 ms includes PHP/SQLite and Node worker startup under local test scheduling. The subprocess host is a maintainable reference boundary with explicit latency cost, not production throughput certification. Contended earlier measurements remain. Live LEGACY/SHADOW sampling and restart resource counts remain recorded without a causal speedup/leak/release-budget claim.

Limits: fixture identities/loopback and temporary storage (survives tested browser/process restarts, not OS cleanup/power-loss certification); shared avatar/XP; synchronous worker cost/SQLite writer serialization; unbounded durable archive capacity; no full entity-chunk loading or 100k HTTP backfill measurement; full legacy aid/economy/health/utility/rank/campaign port; full V4 execution migration; old PHP/MySQL authority. Existing duplicate embedded Three, historical GLTF root cause and page-only teardown remain open despite passing controlled asset faults.

## Integrity, owner gates and reproduction

96 files created, 10 modified, 0 deleted including evidence/docs. Full baseline/root dirty inventory and hashes are in ZGE_06_VERIFICATION_MANIFEST and evidence/file-inventory. No unexpected existing-file changes or conflicting writer observed; audit uses executable names/PIDs/cwd, never process arguments. The dirty submodule remains untouched and was not recursively fingerprinted. All minified/model/environment safeguards, live entry/index, existing API and golden tests retain baseline digests.

Three historical tests still first fail bundle expected 7a9cdfee… versus preserved timeout-patched 25665bd8…; subsequent model goldens also predate prior readable asset work. They are not re-pinned. Source modules/server are reproducible from the provided commands; original legacy bundle build provenance remains missing. Owner-approved artifact lineage/semantic review is required before golden/release changes.

**Urgent independent security gate:** exposed production provider keys and collector token still require owner-controlled revocation/rotation, audit, authorized history/artifact remediation and post-verification. No secret values printed or production credentials changed. Generated staging fixture identities do not remediate those findings. See SECURITY_OWNER_GATES_ZGE_06 and the prior redacted checklist.

Reproduce all: `node scripts/zge06-verify.mjs --browser` (PHP with PDO SQLite, Node and installed Playwright/Chrome; PLAYWRIGHT_MODULE/CHROME_PATH configurable). `npm run test:php-world`, `npm run benchmark:world-history`, and `npm run test:engine:browser:durable` expose targeted runs. Keep the existing normal local game server on 8790 for legacy browser checks; durable browser tests create their own isolated server/database/identities. Verification writes evidence outside the repository by default and never regenerates release assets/goldens. Master roadmap execution ledger updated; historical milestone reports/results unchanged.

```text
=== ZGE-06 DURABLE WORLD ENGINE RESULT ===
STATUS=BOUNDED_PASS; LIVE_TRANSFER_AND_RELEASE_NO_GO
HEAD=138220f4909b3fd6a3e0dd2e62ebab63785336d7
FILES_CREATED=96
FILES_MODIFIED=10
CONCURRENT_WRITER_DETECTED=NONE_OBSERVED
SOURCE_OWNED_RUNTIME=EXISTING_RUNTIME_HOSTED_SERVER_SIDE
LIVE_WRITER_COVERAGE=IDENTIFIED_PATHS_MAPPED; COMPLETE_LEASE_COVERAGE_UNMET
AID_CALLBACK=OBSERVED_PARTIAL_FAILURE_CERTIFIED; BENEFIT_CONTRACT_UNRESOLVED
CONSTRUCTION_SIDE_EFFECT_PARITY=STAGING_CONNECTED; FULL_LIVE_PARITY_UNMET
DURABLE_SERVER=ISOLATED_PHP_SQLITE_PASS
PHP_AUTHORITY=STAGING_CERTIFIED; EXISTING_LIVE_API_UNCERTIFIED
DATABASE_TRANSACTIONS=SNAPSHOT_INVENTORY_BUILDING_REVISION_EVENT_RECEIPT_REWARD_ATOMIC
IDEMPOTENCY=DURABLE_EFFECTIVELY_ONCE_EFFECTS; DELIVERY_MAY_REPEAT
CONCURRENT_CONSTRUCTION=TWO_PHP_PROCESSES_PASS
MULTIPLAYER_RECONCILIATION=ACTUAL_HTTP_AND_TWO_BROWSER_PASS
V4_SAVE_MIGRATION=READ_ONLY_CORE_PROJECTION_AND_LOSSLESS_ROLLBACK_PASS
WORLD_HISTORY_SCALING=1K_10K_100K_EXACT_REPLAY_MEASURED
SNAPSHOT_CHECKPOINTS=VERSIONED_BOUNDED_RUNTIME_TAIL; FULL_DURABLE_ARCHIVE
DETERMINISTIC_REPLAY=CHECKPOINT_AND_REFERENCE_CHECKSUMS_PASS
INDEPENDENT_3D_DEMO=DURABLE_STAGING_MODE_PASS
TWO_CLIENT_BROWSER_TEST=PASS
LIVE_ZEKNOVA_AUTHORITY=LEGACY
LEGACY_MUTATION_PATH_DISABLED=NO
WEBGPU=LIVE_REGRESSION_PASS
WEBGL_SAFE_MODE=LIVE_AND_INDEPENDENT_PASS
MATRIX_RENDERING_FALLBACK=PASS; MOCK_ONLY_INFERENCE
ENGINE_TESTS=167/167
LEGACY_TESTS=83/86; SAME_THREE_GOLDEN_FAILURES
NEW_REGRESSIONS=0_CONFIRMED_AFTER_FIXES
PERFORMANCE_RESULTS=RECORDED; SUBPROCESS_LATENCY_AND_ARCHIVE_LIMITS_EXPLICIT
SOURCE_REPRODUCIBILITY=NEW_MODULES_REPRODUCIBLE; ORIGINAL_BUNDLE_BUILD_MISSING
GOLDEN_HASH_STATUS=UNCHANGED_FAILURES; OWNER_REVIEW_REQUIRED
CREDENTIAL_ROTATION_STATUS=PENDING_OWNER
SECURITY_GATES=URGENT_PRODUCTION_REVOKE_ROTATE_HISTORY_POST_VERIFY_PENDING
UNRESOLVED_BLOCKERS=LIVE_PORT_AID_EFFECTS_FULL_V4_PRODUCTION_AUTH_THROUGHPUT_ARCHIVE_CAPACITY_OWNER_GATES_GLTF_THREE
NEXT_MILESTONE=ZGE_07_SESSION_HARDENING_AND_COMPLETE_SOURCE_PORT
GO_NO_GO=GO_ISOLATED_DEVELOPMENT; NO_GO_LIVE_TRANSFER_OR_PRODUCTION_RELEASE
```
