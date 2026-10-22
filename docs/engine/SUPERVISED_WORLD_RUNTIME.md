# Supervised world runtime — ZGE-08

Certified on 2026-10-21 for the isolated loopback staging host. Live ZekNova retains LEGACY construction authority.

## Authority and execution

The authenticated PHP gateway remains the only durable gameplay writer. It ensures a world executor exists, opens `BEGIN IMMEDIATE`, checks the SQL lease, revalidates current membership and connection, reads the sealed durable snapshot, and submits a candidate to the private service. PHP checks the returned fence, atomically writes events, integrity seals, receipt, personal/team claims, revision, snapshot and derived checkpoint, rechecks authorization and fence, then commits. The acknowledgment means SQLite commit, not successful transport delivery. Lost replies are resolved by retrying the identical logical command.

The Node supervisor owns one persistent child and one cached gameplay runtime per admitted world. Node does not write gameplay tables. `WorldEvaluator` is shared by the persistent child and the retained CLI adapter; HTTP on the new launcher never starts Node per request. Each evaluation receives the committed snapshot. A mismatch restores that snapshot before execution, discarding any candidate left by a failed SQL transaction. A matching snapshot reuses the runtime. The benchmark records `created=1` for every run.

The supervisor changes only lease metadata through a small PHP CLI helper. Lease changes serialize with gameplay in SQLite. A lease binds world, supervisor identity, monotonically increasing generation, child identity and expiry. PHP validates it inside the transaction before evaluation and before commit. A dead child rejects in-flight work before a new generation attempts to acquire the write lock. A supervisor that loses its heartbeat retires permanently; its identity cannot reacquire its expired lease. A competing supervisor cannot own an unexpired lease.

## Transport and bounds

Authenticated NDJSON over a Unix domain socket was selected for local PHP/Node interoperability. The parent directory is owner-only 0700, socket and random 256-bit key file are 0600, and path/ownership checks reject symlinked or public locations. Keys and client credentials are never logged. There is no remote runtime listener.

| Default | Bound |
|---|---:|
| Worlds per supervisor | 16 |
| Connections | 64 |
| Active plus queued evaluations per world | 16 |
| Request/response frame | 8 MiB |
| Evaluation deadline | 2 seconds |
| Worker readiness | 2.5 seconds |
| PHP IPC read timeout | 3 seconds |
| Lease / heartbeat | 10 / 2 seconds |
| Supervisor drain window | 3 seconds |
| Launcher world readiness window | 15 seconds |

SQLite is the arrival serialization boundary; multiple PHP gateways cannot concurrently publish gameplay changes. A full runtime queue returns backpressure, and the client retains the same outbox intent. HTTP admission remains limited to 600 requests/minute/IP and, by default, 240/principal (configurable within 8–600). A client under rate limiting waits for the next bucket; queue pressure uses a shorter delay. New intent is blocked while an unacknowledged command requires reconciliation. Existing SQL busy timeouts and ingress queues also affect latency; the 2-second evaluation deadline is not an end-to-end latency guarantee.

## Lifecycle and operation

`npm run dev:staging-world` starts the supervised multiplayer host at `http://127.0.0.1:8798/examples/construction-world/?server=1`. `ZGE_STAGING_DIR` selects a new private `/tmp/` directory; `ZGE_STAGING_PORT` selects a loopback port; `ZGE_GATEWAY_COUNT=1..8` selects consecutive gateway ports. The launcher prints the private fixture file location, never credential values. Reuse that directory to retain the world. `npm run dev:staging-world:compat` retains the earlier collective fixture on its previous path.

Workers handshake before readiness, restart with bounded backoff, expose authenticated `/staging/health` metrics, and reconcile from durable state after restart. Health includes worker starts, restarts, queue peak, failures/timeouts, stale replies and evaluator reuse; public HTTP health is restricted to the authenticated world. Fault injection requires explicit staging test flags and is disabled by default.

SIGTERM/SIGINT stops owned gateways, drains accepted runtime evaluations within a bound, disposes children and releases leases/socket. Interrupted HTTP commands can remain unacknowledged and must be retried. The gateway wrapper terminates its owned PHP process on parent IPC loss, including launcher SIGKILL. A fresh launcher can reclaim only a refused owned private socket after an exclusive recovery claim, a failed connection probe and inode verification. It cannot unlink a reachable owner. It waits for the old SQL lease to expire and starts a new supervisor identity/generation.

The launcher is a development host, not an installed OS service. Child workers restart automatically; a whole-launcher SIGKILL requires running the launcher again. That path recovered in 10.24 seconds in the recorded test with the default 10-second lease. No unrelated process is killed.

## Verification and limits

See [operational recovery](OPERATIONAL_DURABILITY_ZGE_08.md), [player ownership](PLAYER_OWNERSHIP_ZGE_08.md), the [report](ZGE_08_IMPLEMENTATION_REPORT.md) and [raw evidence](evidence/zge08/engine-final-certified.log). Lease, IPC, queue, competing-owner, heartbeat, stale-reply, graceful drain and whole-host tests run against actual processes/SQLite. This certifies a bounded local service. It does not certify remote TLS, production identity, multi-host clock behavior, an indefinite soak, or live legacy writer revocation.
