# Disaster recovery certification — ZGE-09

All destructive drills use fresh owner-only disposable directories and databases under `/tmp`. The development world, production databases, credentials and historical archives are not fault-injection targets. ZGE-08's complete backup validation/publication contract remains in effect; only a validated consistent bundle can be restored to a new private directory. Restore never overwrites a live database.

New `packages/server-php/test/zge09-disaster.test.mjs` adds four integration tests. Existing `zge08-operations.test.mjs` retains its five backup/exhaustion tests. Raw logs and measurements are under `evidence/zge09/operations/` after evidence publication; the working evidence directory is `/tmp/zge09-evidence/operations/`.

| Drill | Actual boundary and assertion |
|---|---|
| Hot backup | Actual `VACUUM INTO` during 16 authenticated actor movements; recovered DB is a valid committed prefix, with both personal claims and one team reward |
| Cold backup | All owned fixture gateways and supervisor stopped before snapshot; exact command/event/checkpoint/claim/audit rows survive fresh-directory restore |
| Integrity and replay | SQLite integrity `ok`, backup/restored file SHA-256 equal, complete actor command replay reproduces revision/cursor and exact archived events/receipts |
| Corrupt checkpoint/snapshot | Derived JSON deliberately replaced; recovery reconstructs from complete trusted archive and retains damaged state in audit |
| Missing archive page | An archived event is removed; repair rejects without rewriting any gameplay/audit table |
| Truncated log | Archived JSON is truncated; repair rejects without changing evidence |
| Damaged receipt | Result replaced with `{}`; repair rejects rather than inventing the previous result |
| Duplicate/contradictory claims | Real duplicate SQL primary key produces SQLite code 19; invented extra personal claim and missing team claim each deny replay |
| Busy/locked | Separate PDO process holds `BEGIN IMMEDIATE`; contender returns SQLite code 5 after a measured bounded wait; unchanged state and successful repair after release |
| Allocation exhaustion | Retained ZGE-08 PDO `max_page_count` fixture produces real SQLite code 13 and rolls back the entire prepared economic transaction |
| Actual filesystem full | Explicit separate 32 MiB image drill reaches real OS `ENOSPC`, then real SQLite code 13 after preparing multiplayer economic effects; all economic rows roll back |
| Interrupted backup/restore | Retained four actual SIGKILL boundaries never publish a valid partial bundle; private incomplete artifacts remain non-authoritative |
| Process death during repair | New explicit CLI-only staging `before-commit` SIGKILL occurs after audit/snapshot/checkpoint writes; none survives; retry repairs once and retains original archive |

The recovery fault requires both `ZGE_STAGING_FAULTS=1` and `ZGE_RECOVERY_FAULT=before-commit`. It is not HTTP-routed and is disabled by default.

## Measured scope

The certified JSON contains exact per-run times, command counts and event counts. The final dedicated hot/cold run backed up 8 of the final 20 committed commands while writes continued; restore plus explicit replay took 745.28 ms. The 12 later commands were outside the backup's consistency point. This is a measured point-in-time backup, not zero-RPO replication or a backup scheduling SLA. Cold backup retained all 20 commands. Corrupt-checkpoint repair retained four commands/25 events and took 578.01 ms including verification queries; the lock fixture waited 97.99 ms with an 80 ms configured busy timeout. All initial attempts and later full-suite reruns remain in the evidence archive; the named dedicated run above is a fixture measurement, not an operational latency SLA.

The actual volume test mounted one newly created owner-private 32 MiB HFS+ disk image with `hdiutil`, filled only that volume until `ENOSPC`, released 1 MiB for rollback metadata, then requested a 32 MiB SQLite blob allocation. A real multiplayer runtime candidate had already prepared the second building, cost, personal claim, team reward, receipt, events and new snapshot in the transaction. SQLite returned code 13 after 81.88 ms; every gameplay table equaled its pre-transaction state. Removing the filler allowed retry in 181.65 ms: personal XP 14 each, team XP 25, two personal claims and one team reward, SQLite integrity `ok`. The owned image was detached successfully.

That volume drill certifies the direct PDO economic transaction with a real runtime candidate on this macOS filesystem. It does not certify every HTTP error path on a full disk, other filesystems, remote storage, power loss or kernel/drive failure. No actual allocator limit was used in the volume drill. The separate retained allocator fixture must not be mislabeled as volume exhaustion.

Run the bounded default tests with `node --test --test-concurrency=1 packages/server-php/test/zge09-disaster.test.mjs packages/server-php/test/zge08-operations.test.mjs`. Run the explicit macOS volume drill separately:

```sh
ZGE_DISPOSABLE_VOLUME_DRILL=1 ZGE_EVIDENCE_DIR=/tmp/zge09-evidence/operations node scripts/zge09-disposable-volume.mjs
```

Only this script's fresh bounded image is filled. The script refuses implicit invocation, always attempts owned-image detach and reports detach failure separately. Private DB/image contents and authentication hashes must never be copied into the public evidence directory. The evidence package contains metrics and assertion logs only. Repeated OS-level power-loss drills, directory-fsync guarantees, cross-host restore, remote signed backups, retention scheduling and operational RTO/RPO commitments remain uncertified.
