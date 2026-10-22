# Durable history and recovery — ZGE-07

SQLite still commits candidate snapshot, scoped receipt, ordered events, reward claim and cursor in one transaction. The active runtime tail compacts after 32 commands by default; all durable command receipts and events remain archived. Normal operation retains the last two derived checkpoints. Compaction is never permission to discard audit/idempotency history.

## Integrity and repair

`world_integrity` seals the exact stored snapshot bytes and cursor. Every world access verifies the seal, archive count/min/max bounds, and retained checkpoint checksums. Requested event pages check payload checksums; the archive endpoint also checks world/sequence and contiguous cursor bounds. These checks detect accidental corruption; they are not signatures against a privileged attacker who can alter the database and checksums together. HTTP snapshot digests are computed using the same Node canonical JSON implementation as the browser.

A corrupt current snapshot/checkpoint denies normal reads/commands before candidate publication. `/staging/events` gives authorized bounded backfill without starting a gameplay worker for each page. Clients can cap pages at a confirmed snapshot cursor and retain only their bounded display window.

`recover.php WORLD` is CLI-only, explicitly gated staging repair. Under a write lock it reconstructs from genesis in batches of 32 archived commands, verifies principal/command identity and fingerprint, compares every deterministic receipt and ordered event with its sealed archive, checks final revision/cursor and reward claims, then atomically replaces derived state. It neither executes rewards against production nor changes archived commands/events/rewards. A damaged archive or receipt rejects reconstruction. Prior snapshot/checkpoints are retained in `recovery_audit` before derived replacement. Recovery requires matching content/runtime policy; unsupported policy drift fails closed rather than guessing.

Actual tests kill PHP immediately before and after COMMIT, including the final mission build. Restart/retry yields either the entire prior state or the entire committed state: one charge per accepted building and one 25-XP reward. Wall-clock expiry after candidate preparation, revoked membership while waiting for the lock, lost acknowledgment, explicit rollback and a SQLite trigger write rejection also leave no orphaned candidate effects. Trigger rejection is not a real disk-full test. Browser restart/reconciliation compares complete world state.

The small corruption recovery fixture replays two commands/15 events in approximately 61 ms, preserves its single reward and refuses a damaged event archive. This is not a measured 100k-command reconstruction time.

## Measured representative history

These are representative versioned resource/player/reward/build-create/remove/revision events with 128 resident buildings. They are NOT 100k full terrain/construction commands. Both old and new fixtures remain reproducible; the final rerun followed addition of the recovery audit table. Raw initial timings are retained separately.

| Events | SQLite bytes | Full JS replay ms | Checkpoint replay ms | Authenticated loopback HTTP ms | Pages of at most 256 | HTTP page p95 / p99 ms |
|---|---:|---:|---:|---:|---:|---:|
| 1,000 | 733,184 | 1.78 | 0.85 | 31.67 | 4 | — / — |
| 10,000 | 6,709,248 | 8.67 | 1.39 | 219.12 | 40 | 9.70 / — |
| 100,000 | 67,121,152 | 72.01 | 1.62 | 5985.92 | 391 | 26.45 / 111.14 |

Each run validates exact replay checksum, checkpoint integrity, every paged event hash, corruption denial, event-gap denial and unauthenticated HTTP 401. Archive paging runs through the actual PHP router and SQLite, followed by JS decoding/replay. The 100k run retains all 100k SQL events, two derived checkpoints and a 256-event client window. It measures localhost with no WAN/TLS; timings are observations, not an SLA.

The fixture process intentionally retains the full reference event array and timing samples for checksum/comparison. Its 100k retained heap delta is about 55.6 MB after explicit GC; that is not the client's bounded window footprint or leak proof. SQLite growth is about 67.1 MB at 100k events including checksums, versus the older fixture without event integrity metadata. No history was pruned for this result.

Existing 1,000 actual runtime-command compaction/replay tests remain passing. Future certification still needs larger actual command histories, real disk exhaustion, backup/restore operations, capacity/backpressure/retention policy, content/schema upgrades, and recovery interruption at a larger scale. SQL count/bounds checks and PHP/Node startup remain scalability costs. See `evidence/zge07/history-certified/history-hardening.json`, security scenarios, raw logs and the reproducible verifier.
