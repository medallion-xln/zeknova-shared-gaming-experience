# World history scaling and checkpoints — ZGE-06

Two connected mechanisms now exist: runtime v2 checkpoints bound the active transaction/event/before-image tail; SQLite retains full authoritative command receipts and events while retaining only the newest two derived recovery checkpoints. Existing full-history runtime v1 snapshots remain readable and the local demo's default behavior is unchanged. Configurable server interval ZGE_CHECKPOINT_EVERY is bounded 1–128 (default 32); client inspector event window defaults to 256 (configurable 1–4096), HTTP pages to 128. The compactor is not permission to delete durable receipts/events.

`ConstructionRuntime.compact({receiptsArchived:true})` is an explicit trusted-host contract, not an automatic timer. The host must archive prior logical receipts and check old IDs before dispatch. It produces `zge.construction-runtime.v2`, a complete checkpoint seed plus bounded tail, preserves inventory/buildings/player/mission/reward state and global event sequence, and clears superseded Construction before-images/events and mission command history from memory. Only after all new records are prepared does PHP commit them and the compacted state together. No crash window exists between authoritative archive and checkpoint publication. Full events/commands have no destructive retention policy in this milestone.

Restore accepts v1/v2, validates world/receipt/revision/event-offset invariants, and command replay starts from the checkpoint seed. It does not emit historical presentation or apply rewards again. The SQL receipt archive supplies idempotency across compaction/restart; an old logical ID returns its result before gameplay is invoked. Calling compact without the archive assertion rejects. Isolated runtime users must not bypass that prerequisite or discard receipts. Checkpoints are not execution permission or online undo; online rollback requires a fresh fence/explicit policy.

The 1,000-actual-command unit fixture alternates resource grants and selection, archives events/receipts, compacts every 32 commands, verifies 112 stone and revision 1000 exactly, retains at most 32 commands in the active tail, and compares exact event reconstruction against final state. This supplements actual PHP tests for old IDs after checkpoint, lost acknowledgments, CAS concurrency, reward uniqueness and process restart.

## Measured archive corpus

`scripts/zge06-history.mjs` generates 1k/10k/100k representative immutable event payloads: resource balances, player transforms, existing/new reward IDs, create/remove records and revisions. Each fixture starts with 128 resident buildings and existing progress/XP; no approximate equality is used. It measures a generic event-history workload, **not 100,000 full terrain/construction commands**. SQLite ingestion/query/compaction is executed by actual PHP PDO; JavaScript performs reference replay and bounded page decoding/audit reconstruction. All command/event data needed for authority in the real server remains archived; the benchmark's synthetic event corpus itself is not a production command log.

| Events | Full replay ms | Checkpoint+tail replay ms | Latest checkpoint bytes | SQLite bytes | Client page decode/replay total ms |
|---|---:|---:|---:|---:|---:|
| 1,000 | 2.516 | 0.876 | 15,336 | 557,056 | 3.105 |
| 10,000 | 9.926 | 1.568 | 15,342 | 5,459,968 | 27.004 |
| 100,000 | 78.968 | 2.689 | 15,348 | 54,747,136 | 246.654 |

Each checksum is SHA-256 of the exact canonical projected state (world identity/authority, revisions, resources, inventory revision, building IDs/transforms, player/XP, mission state, rewards, selection and historical build count). Reference replay, checkpoint replay and client page reconstruction match exactly at all three sizes. Internal command journals are separately retained/validated by the durable server and are not reinvented by this projection.

Checkpoint every 1000 benchmark events; newest two retained, so at larger sizes replay from the older retained checkpoint covers exactly 1000 events. The 1000-event fixture has one final checkpoint and a zero-event tail. JSON empty objects must remain objects across PHP: an initial checksum failure exposed associative decode/re-encode changing `{}` to `[]`; PHP now preserves object representation in checkpoints and runtime snapshots. The failed log remains and the final exact-equality run passes without normalization.

Raw history-scaling.json includes event append p50/p95/p99, PHP 1000-event batch write timings, checkpoint compaction, SQL checkpoint load, 256-event database paging, client page decoding/replay, database/input sizes, post-GC heap delta, state checksums, tail counts and memory window. Percentiles are null when samples are insufficient (p95 needs 20, p99 needs 100). Batch latency is not mislabeled per-event latency. Only derived checkpoints are pruned; archived events are never removed. SQLite page allocation need not shrink when old checkpoints are deleted.

Memory includes the **uncompacted reference array** retained for exact comparison; it is not evidence of a bounded whole-process heap or a leak. The real client window and active runtime tail are bounded independently, while world/building state and durable archive size naturally grow. Database paging timings and JS client decode/replay exclude network latency; the actual PHP HTTP tests record separate wire/service round trips on smaller gameplay worlds. No 100k end-to-end WAN/full-runtime throughput claim is made. The corpus completed locally; process restart is certified, host-power-loss and backup/disk-full recovery remain future work.

## Runtime and browser performance

Existing construction-only and connected-runtime benchmarks were rerun unchanged, with raw construction-performance/runtime-performance artifacts. The richer runtime still pays candidate validation/publication and full active-tail copies. The staged PHP host adds two Node worker startups to typical responses; php-certification.json contains actual HTTP latency samples including authentication, serialization, SQLite and workers. It is not a production latency target.

Live LEGACY/SHADOW browser workloads keep the same viewport/invalid-placement/frame sampling procedure; results are live-performance-final.json. Source-world browser evidence records renderer/listener/RAF restart counts and capture metadata. Timing varies with host contention/capped frame cadence; no causal global speedup, memory leak conclusion or release percentage certificate is claimed. Existing parsed/raw asset cache budgets, four-worker KTX2 fault bounds and native/neural fallback remain preserved. Embedded duplicate Three and exact historical GLTF hang attribution remain separately open.


## ZGE-07 update

Authenticated end-to-end PHP/SQLite HTTP backfill now measures the representative 1k/10k/100k archive with per-event/checkpoint integrity, corrupt-checkpoint/event-gap denial, exact replay and bounded client window. Derived snapshot repair verifies archived commands/receipts/events/claims and retains prior damaged state in recovery_audit. See PERSISTENT_RECOVERY_ZGE_07.md for final measurements and explicit actual-command/operational limits.


## ZGE-08 operational recheck

The 1k/10k/100k representative-event archive recheck remained exact over authenticated HTTP and checkpoint replay. The 100k DB was 67,153,920 bytes; HTTP backfill 5,026.53 ms, full replay 69.07 ms and checkpoint replay 1.54 ms. Separate real multiplayer capacity runs committed 2,048 authenticated gameplay movement commands with complete SQL receipt/event replay. No idempotency or audit history was discarded. These workloads have different scopes; see [report](ZGE_08_IMPLEMENTATION_REPORT.md).


## ZGE-09 operational extension

ZGE-09 retains authenticated 100k synthetic-event backfill and adds 180-second/eight-reader exact-prefix paging plus complete read-only replay of 3,192 actual managed mixed commands and 9,768 events. Runtime checkpoint-tail replay and complete archive replay are explicitly separate. Private resource-rich fixtures declare their initial policy; no authority history is discarded to improve metrics. See MULTIPLAYER_SOAK_RESULTS and DISASTER_RECOVERY_CERTIFICATION.
