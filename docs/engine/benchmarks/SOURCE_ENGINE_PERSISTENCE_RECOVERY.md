# Source-owned engine persistence and recovery — ZGE-BENCH-01

This supplement certifies the independent PHP/SQLite + supervised Node construction world. It does not certify saves, combat, mission progression, or persistence in the original legacy ZekNova game.

**Outcome: PASS_WITH_LIMITS for bounded local staging recovery.** All 56 existing source-server integration tests passed in this run. These tests perform real authenticated HTTP requests, SQLite transactions, and owned process failures; they are additional backend evidence, not a substitute for browser gameplay. The new physical browser flow independently verified two, four and eight authenticated contexts, movement displacement, shared buildings, personal XP, team XP and exact convergent world state. The source browser renderer was native WebGL 2.

The 56 tests include shared durable-adapter single-player compatibility fixtures as well as explicitly supervised multiplayer fixtures. They do not exercise the original minified game's persistence endpoints. Test times were recorded during functional activity elsewhere on the host and are observations, not isolated performance SLA measurements.

| Recovery gate | Observed evidence |
|---|---|
| Auth expiry, renewal, revocation, roles and origin/body boundaries | Denials leave no committed command; expiry during transaction preparation rolls back before COMMIT. |
| Independent browser sessions/connections | Renewal retains session identity; connections remain distinct; disconnecting one connection leaves the other valid. |
| Shared construction and private progression | Two physical placements converge across 2/4/8 contexts. Builders each retain XP14, others XP0, shared team XP25. Other players' public projections omit XP/private inventory. |
| Lost acknowledgment and original intent | Same original command ID returns its original durable receipt; no duplicate charge, building, personal claim or team reward. |
| Worker crash / deadline | Inner supervisor replaces the owned worker under a higher fenced generation. Queued/disconnected original intents remain safely retryable. |
| Launcher SIGKILL | Automatic whole-launcher recovery measured 10,016.72ms including fenced lease turnover; duplicate receipt, XP14, stone8 and one building preserved. |
| Gateway death before/after COMMIT | Recovery observed at 1,085.68ms / 1,118.62ms. Before-COMMIT candidate has zero partial effects; after-COMMIT retry returns duplicate with XP28, teamXP25, stone4, two buildings. |
| Missing/replaced established SQLite inode | Reads/lease heartbeats reject missing or substituted database. No replacement database is initialized. Original inode restoration resumes durable receipt semantics. |
| Hot/cold backup + fresh restore | Hot backup522.62ms, cold533.51ms, hot restore plus replay769.07ms in this functional run. Hot snapshot is a committed prefix (8 commands); cold captures20; two personal claims and one team claim retained exactly. |
| Corrupt derived snapshot/checkpoints | Audited full actor replay repairs derived state. Killing recovery before COMMIT leaves damaged state/audit untouched; successful repair642.25ms. |
| Missing/truncated event archive or contradictory receipts/claims | Fail closed without rewriting evidence; no partial repair. Physical duplicate claim keys rejected by SQLite19. |
| SQLite write contention | Explicit SQLite5; measured96.80ms wait for configured80ms test timeout; no partial effects; recovery after release88.10ms. Normal application busy timeout remains15s. |
| Real SQLite allocation exhaustion | SQLite13 from explicit `max_page_count` drill after economic candidate writes, with all economic tables rolled back atomically. Retry succeeds once. This is not whole filesystem-volume exhaustion. |
| Backup/restore process death and unsafe bundles | Partial bundles never published as valid; corruption/incompatible policy, existing/public/symlink targets denied. Unknown database extension records and bytes preserved. |
| Restart ceiling / top parent ownership | Repeated launcher crashes stop at configured restart ceiling. Death of the outer service closes owned gateways and requires explicit restart; no OS service manager was installed. |

Evidence: [56-test TAP log](evidence/multiplayer/functional.log), [session/security scenarios](evidence/multiplayer/functional/session-security.json), [disaster recovery](evidence/multiplayer/functional/disaster-recovery.json), [SQLite_FULL and backup boundaries](evidence/multiplayer/functional/operations.json), [supervised service audit](evidence/multiplayer/functional/service/automatic-launcher-recovery.json), [physical browser results](evidence/multiplayer/browser/browser-results.json).

Reproduce from the repository root:

```sh
env ZGE_EVIDENCE_DIR=/tmp/zge-bench01-repro-functional node --test --test-concurrency=1 \
 packages/server-php/test/session-security.test.mjs \
 packages/server-php/test/supervised-runtime.test.mjs \
 packages/server-php/test/zge08-gateway.test.mjs \
 packages/server-php/test/zge08-launcher.test.mjs \
 packages/server-php/test/zge08-operations.test.mjs \
 packages/server-php/test/zge09-disaster.test.mjs \
 packages/server-php/test/zge09-gateway.test.mjs \
 packages/server-php/test/zge09-progression.test.mjs \
 packages/server-php/test/zge09-service.test.mjs \
 packages/server-php/test/zge10-telemetry.test.mjs
```

Every destructive operation used a fresh private fixture. No production data or existing service was stopped. Fixture identity/session files remain under private `/tmp` directories and are excluded from the evidence package.

The new browser harness's first attempt tried the second placement before its other context had reconciled the first placement. It retained a stale-revision-safe failure and timed out expecting a second building. The corrected harness waits for all contexts to show the first building before the next physical click; the failed log and result remain in evidence. Authority behavior and assertions were not changed.

This run does not establish remote-network behavior, indefinite retention stability, outermost OS-process self-restart, filesystem-volume exhaustion, a production identity provider, TLS deployment, or live authority transfer. Full load/replay results are reported separately in [Multiplayer load results](MULTIPLAYER_LOAD_RESULTS.md). Production release remains NO-GO.
