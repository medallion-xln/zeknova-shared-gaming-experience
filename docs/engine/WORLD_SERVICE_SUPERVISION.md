# Developer-controlled world service — ZGE-09

The foreground Node service owns and continuously supervises the complete isolated staging launcher. It installs no daemon, login item, startup service or production listener. The existing ZGE-08 direct launcher remains available. Live ZekNova retains LEGACY authority.

## Start, inspect and stop

From the repository root:

```sh
node scripts/zge09-service.mjs start
node scripts/zge09-service.mjs status
node scripts/zge09-service.mjs stop
```

`start` stays in the foreground until stopped. Its `service-started` record means the private control interface is available; inspect `state=ready` to establish launcher readiness. SIGINT/SIGTERM performs the same bounded shutdown as `stop`. The default is `/tmp/zge09-world`, loopback port 8799. `ZGE_STAGING_DIR`, `ZGE_STAGING_PORT` and `ZGE_GATEWAY_COUNT=1..8` choose an independent private fixture and consecutive ports. The existing port-8798 development service is not changed or stopped. Private fixture credentials remain in `identities.json`; commands never print their values.

`startWorldService({directory,port,gatewayCount,...})` is the programmatic interface in `packages/server-php/runtime/world-service.mjs`. It returns `status()`, `waitUntilReady(timeoutMs)`, `close()` and the `closed` promise. `serviceRequest(directory,'status'|'stop')` uses the private owner-only control socket. The status includes service identity/PID, directly owned launcher PID and gateway-wrapper PIDs, current worker identity/generation, restart counts, last health classification and policy. It contains no authentication material. The control interface offers no gameplay mutation or lease override.

## Ownership, health and restart policy

The outer service forks exactly one owned launcher with IPC. The launcher contains the runtime supervisor in the same process: killing that PID exercises both boundaries. It owns the world child and gateway wrappers; wrappers own PHP children. Launcher IPC disconnect stops owned wrappers/world children, including when its outer service is killed. No PID discovered from a process listing is killed. PID fields describe known children; stop uses retained child-process handles.

The outer service uses an exclusive owner-only lock with PID/service identity. A second service cannot start against an active owner. A stale lock may be reclaimed only after the recorded owner is absent, private-file checks and an exclusive recovery claim. PID reuse or uncertain ownership fails closed. Stale control sockets require a refused connection and unchanged inode. Runtime sockets retain the ZGE-08 exclusive recovery claim, refused-connect/inode checks and SQL lease fencing. An interrupted lock-recovery claim or malformed/incomplete audit requires operator review; it is not silently deleted.

The default health loop runs every 2 seconds, checks the private runtime and its world lease, and probes a rotating gateway through the existing authenticated `/staging/health` path. There is one HTTP health probe per cycle across all gateways, using a private fixture viewer identity. This is 30 requests/minute total within the existing 60/minute health quota. No normal gameplay quota is increased. Gateway death causes the launcher to stop its own siblings; a fenced world or three consecutive failed health checks causes the outer service to replace its launcher. Isolated tests can select shorter intervals, which are not a sustained admission certificate.

| Default policy | Bound |
|---|---:|
| Health interval / timeout | 2 / 5 seconds |
| Consecutive health failures | 3 |
| First restart delay | 250 ms |
| Maximum exponential restart delay | 10 seconds |
| Restart ceiling | 8 scheduled retries per rolling 60 seconds |
| Launcher startup deadline | 25 seconds |
| Launcher graceful-stop deadline before owned SIGKILL | 8 seconds |
| Service control frame / timeout | 4 KiB / 2 seconds |
| Retained audit accepted at startup | 16 MiB |

A stable ready period of one restart window resets exponential backoff. A restart ceiling leaves the service in inspectable `failed` state until the operator stops it and explicitly starts a new service. Restart ceilings include attempts blocked by database unavailability. An explicit new service starts a new restart policy; its durable audit retains prior attempts. There is no claim of recovery when the database remains unavailable or a crash loop continues indefinitely.

## Authority and durability

The service changes process ownership only. PHP/SQLite remains the sole durable gameplay writer, with the same atomic state/events/receipt/claims commit and transaction fence checks. Node executes candidates. Each replacement launcher gets a new supervisor identity and must acquire a higher SQL generation; an unexpired old lease cannot be taken over. A dead worker is replaced by the inner supervisor without unnecessarily replacing the whole launcher. An owner that misses its heartbeat remains retired; the outer service starts a fresh owner instead of resurrecting it.

A known database must remain the same private regular file before a replacement launcher can start. Its device and inode are recorded in the fsynced ready audit and reused across explicit service restarts. An established audit lacking that identity fails closed for operator review. The expected identity is checked by the launcher before setup and by PHP before opening the database. PHP gateways and lease helpers use SQLite URI `mode=rw` to prevent accidental recreation even if the pathname disappears between an existence check and open. Missing, substituted, symlinked or nonregular established databases are unavailable; they are never provisioned as an empty replacement world. Initial managed initialization requires the explicit parent allow-new flag and is permitted only for a fresh fixture. A standalone ZGE-08 launcher refuses service-audited directories and cannot recreate a missing database when private provisioned identities already exist. Existing corrupt databases fail launcher initialization and enter bounded retry/ceiling handling. Operators restore only independently verified backups using the existing isolated recovery procedure into a fresh private directory. Replacing a database under an active writer is unsupported; a hot restore cannot bypass the recorded file identity.

`service-audit.ndjson` is owner-only and append/fsync persisted for service start, launcher start/readiness/exit, health failures, planned backoff, ceiling and operator shutdown. It records safe reasons, identities, generations and owned PIDs, never tokens, SQL snapshots or process argument lists. `service-status.json` is an atomic replaceable projection; the audit is the durable restart history. Audit growth beyond 16 MiB or an incomplete last record stops startup for explicit retention/review rather than loading unbounded history or dropping evidence. Directory-fsync, power-loss survival and remote audit signing remain outside this certificate.

## Failure evidence and scope

`packages/server-php/test/zge09-service.test.mjs` uses real disposable SQLite databases, real Node/PHP process trees and actual SIGKILL. Raw test logs and safe restart records are retained under `evidence/zge09/service/` by the milestone report. The certificate covers automatic whole-launcher restart with a committed lost acknowledgment, worker-only restart, competing launchers/services, unavailable established database without replacement, restart ceiling, graceful operator shutdown, stale outer control/lock recovery, heartbeat retirement, and actual PHP death immediately before/after COMMIT.

In the final seven-test targeted run, automatic launcher SIGKILL recovery measured **9,876.88 ms**, increasing generation 1→2 and retaining exactly one building, one charge and 14 personal XP. Worker-only restart then reached generation 3 without replacing the launcher. Lost-heartbeat replacement measured **11,016.59 ms**. The final targeted real-PHP-death check immediately before/after COMMIT recovered automatically in **740.31 / 1,005.83 ms** after making a managed launcher exit as soon as its owned gateway cleanup completes; the rollback had zero effects and the committed retry remained duplicate, with two buildings, 28 personal XP, 25 team XP and four stone. A subsequent seven-test inode-guard run also passed: after an established database was renamed, actual gateway reads and lease heartbeats left it absent; a private empty replacement stayed empty and was denied; returning the original inode restored the original duplicate receipt and player/world effects. These are small local fixture measurements with default ten-second leases, not recovery SLAs. The unchanged ZGE-08 direct-launcher recovery test also passes. Initial five-test diagnostics, the complete seven-test run, and final targeted COMMIT/control checks are retained. The earlier seven-test run measured 2,732.87 / 2,828.95 ms for gateway-death recovery through health detection; the targeted check verifies direct process-exit detection as well.

A launcher SIGKILL is automatically recovered while the foreground outer service remains alive. If the outermost service itself is killed, owned children stop and a later explicit start safely recovers; the outer service does not supervise itself. Installing an OS-level persistent service would require separate authorization. This is a bounded single-machine development service, without remote failover, clock-skew, machine restart or production release certification.
