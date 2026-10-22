# Operational durability — ZGE-08

Scope: local authenticated PHP/SQLite staging, persistent Node world workers and the opt-in actor model. No production database was touched. Raw evidence is under `evidence/zge08/`; all historical authority archives are retained.

## Failure certification

| Required scenario | Exercised boundary and result |
|---|---|
| 1. Worker crash before execution | Real child killed by test hook; HTTP abort, zero partial effects, generation increases, same ID retries once |
| 2. Worker crash during validation | Real child exits while evaluating; PHP rolls back candidate; personal XP/cost/claims unchanged until retry |
| 3. Crash before durable commit | Worker before-response death rejects candidate; separate real PHP SIGKILL before COMMIT rolls back personal/team mission transaction |
| 4. Death after commit before acknowledgment | Worker kill and separate PHP SIGKILL after COMMIT retain one effect; retry returns durable receipt |
| 5. Duplicate after restart | New worker/whole-launcher generation returns same receipt; one charge, building, personal claim and team claim |
| 6. Delayed stale acknowledgment | Evaluation deadline kills child; client refuses an old generation before changing view, cursor or clearing outbox |
| 7. Concurrent gateways | Multiple real PHP processes share one SQL writer boundary and one world child; independent moves succeed, conflicting shared revisions reject |
| 8. Competing startup | Actual second supervisor denied while lease live; reachable socket cannot be reclaimed |
| 9. Lost heartbeat | Expired owner permanently fenced; fresh owner gets higher generation; old identity cannot resurrect |
| 10. Graceful queued shutdown | Four admitted runtime evaluations drain, then child/socket dispose; HTTP interruptions remain retryable |
| 11. Pending outbox restart | Two-context browser disconnect/lost reply/reload/restart reconciles original intent; whole-launcher SIGKILL test retains committed effect |
| 12. Database unavailable | Missing DB and failing personal-claim SQL write return failure with no partial gameplay effects; recovery/retry succeeds |
| 13. Queue saturation | Bounded active+queue fixture rejects overflow; client backoff prevents accumulating fresh intent behind failed pending work |
| 14. Archive recovery | Corrupt actor snapshot denied, full trusted actor archive reconstructs exact private views, claims, revision and receipts; legacy checkpoint/archive tests remain green |

`supervised-runtime.test.mjs`, `zge08-gateway.test.mjs`, `zge08-launcher.test.mjs`, `zge08-client.test.mjs` and the multiplayer browser script provide these checks. Test hooks are explicit staging-only flags. A health result alone does not prove command durability; assertions inspect SQLite, receipt replay and actor/world state.

Whole-launcher SIGKILL cleanup/restart recovered in **10,235.62 ms**: owned gateways stopped, generation increased from 1 to 2, lost acknowledgment retry was duplicate, one building remained, stone was 8 and personal XP was 14. This measured lease-expiry recovery requires restarting the development launcher. It is not an OS daemon restart guarantee.

## Backup and isolated restore

The CLI-only `packages/server-php/src/operations.php` supports `backup NEW_PRIVATE_TARGET` and `restore PRIVATE_BUNDLE NEW_PRIVATE_TARGET`. Use explicit staging environment variables and an owner-only `/tmp/` parent; neither action is HTTP-routed. For example, with the launcher database at `/tmp/zge08-world/world.sqlite`:

```sh
ZEKNOVA_ENV=zge-staging ZGE_STAGING_ENABLED=1 ZGE_STAGING_DB=/tmp/zge08-world/world.sqlite php packages/server-php/src/operations.php backup /tmp/zge08-world/backup-01
ZEKNOVA_ENV=zge-staging ZGE_STAGING_ENABLED=1 ZGE_STAGING_DB=/tmp/zge08-world/world.sqlite php packages/server-php/src/operations.php restore /tmp/zge08-world/backup-01 /tmp/zge08-world/restored-01
```

Restore produces an isolated copy and provenance, never replaces the live DB. Select a separate staging host only after stopping its own writer and validating its configuration; no production cutover is implemented. Protect backup files like the source DB: they contain private actor state and authentication hashes. They are not part of the evidence package.

`VACUUM INTO` creates a consistent SQLite snapshot. Validation checks integrity/foreign keys, complete event sequence and payload seals, original command fingerprints/results, personal/team claims, checkpoint bounds, exact schema, file SHA-256/size and gameplay content-policy hashes. Complete recovery replay runs only on a disposable copy. Unknown tables/blobs and hashed authentication records survive exact byte restore. Publication uses a new exclusive target, fsynced files and a manifest/provenance marker published last. Existing/public/symlinked targets, incomplete or corrupt bundles, logical receipt corruption, altered schema/content/manifest and interrupted publication are rejected. SIGKILL may leave private pending directories; they are invalid bundles and are not reused. No history is deleted to improve timings.

The recorded small collective bundle was 163,840 bytes (backup 400.53 ms, restore 382.02 ms); the actor bundle was 176,128 bytes (restore 468.70 ms), retaining two personal claims and one team reward. These fixture timings do not establish large-world RTO/RPO. The file hashes detect corruption; there is no remote signed backup or directory-fsync/power-loss certification.

## Database exhaustion and audit recovery

A PDO transaction with `PRAGMA max_page_count` actually returns SQLite `SQLITE_FULL` (code 13) after preparing a real runtime two-building economic/mission candidate and performing SQL transaction writes. Cost, building, receipt, events, reward and revision all roll back together; retry awards once. The HTTP personal-claim trigger failure separately covers rollback after new private progress evaluation. This is actual SQLite allocation exhaustion, **not a filled filesystem-volume, OS I/O error or machine power-loss test**.

Existing recovery preserves damaged derived snapshots/checkpoints in `recovery_audit`, validates seals/receipts/rewards and repairs atomically. Actor recovery adds mixed legacy/new receipt identities and personal claims. Existing audit-insertion failure and interrupted recovery tests remain in the full suite. Missing source history or contradictory receipt/claim data is denied rather than guessed. Operators must retain archives, original source checkpoint, audit records, receipts and backup provenance.

## History and capacity

The retained history benchmark covers 1k/10k/100k representative **events**, with 128 resident buildings, authenticated HTTP pages, corrupted-checkpoint/gap denial and exact replay. At 100k: archive DB 67,153,920 bytes, full replay 69.07 ms, checkpoint replay 1.54 ms, authenticated HTTP backfill 5,026.53 ms. This is not 100k actual gameplay commands. Separate capacity runs send **2,048 real authenticated movement commands** (512 per 1/2/4/8-client run), verify actual SQL receipt/event archives and exact replay, and retain all history. See the report for latency/capacity bounds.

Long-term retention, scheduled protected backups, cross-host restore, sustained/slow-client soak, full-volume exhaustion, remote identity/TLS and production failover remain separate operational gates.
