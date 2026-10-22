# PHP multiplayer certification — ZGE-06

**PASS: actual isolated PHP + SQLite + existing source runtime. NOT certification of api/multiplayer.php production authority.** The previous Node-only fixture remains separately tested.

`packages/server-php/test/durable.test.mjs` creates private temporary databases/identities, starts actual PHP HTTP servers, and reads database tables using an isolated CLI inspector. Two processes share one database for concurrent-arrival tests. Authentication is real server-side hash/expiry/world/role validation against disposable fixture sessions. No production identity/data is used.

Certified scenarios: simultaneous same-world construction; stale second arrival; overlap at a current revision; multiple clients spending the confirmed shared balance; insufficient resources; duplicate/changed-payload requests; old-ID replay after checkpoint; delayed/out-of-order intents; unauthorized token, forged identity, cross-world access, viewer mutation and forged balances; lost acknowledgment; precommit rollback; process kill before commit; process kill after commit; restart/retry/reconciliation; concurrent final mission completions; reward-transaction rollback and retry. Each accepted effect is represented by one unique command receipt and event sequence. Durable reward uniqueness plus restored reward state yields one colony XP application.

Resource invariant in the three-placement fixture: initial stone 12 − 3 × 4 = 0, exactly three buildings, one 25-XP mission reward. Rejected/stale/duplicate commands cannot add cost or reward. Concurrent completion admits one finisher and rejects the stale contender. Injected rollback during completion leaves one earlier building, 8 stone, zero reward/XP; retry commits exactly once. A killed precommit process leaves no new effect; killed postcommit process retains the building and returns a duplicate receipt on retry.

`php-certification.json` captures scenario outcomes, transaction identifiers, accepted/rejected counts, revision sequences, duplicate suppression counts, invariants, checkpoint counts, convergence/restart results and actual HTTP timing samples. Tests verify database receipt/event/reward uniqueness, not just optimistic client predictions. Root engine test inventory includes these PHP integration tests; PHP/SQLite/Node must be installed.

`scripts/zge06-browser-server.mjs` uses two independent browser contexts with Alice/Bob fixture logins, actual controls, keyboard movement, shared construction/deduction/mission XP, concurrent intents, synchronization, a deliberately dropped confirmed acknowledgment, PHP restart on the same database, reload/outbox recovery, exact world convergence and reference capture with world identity/revision. It imports no legacy bundle. The dropped browser reply uses a movement command on the same durable protocol; PHP integration tests separately lose construction acknowledgments. Browser evidence and screenshot are retained. Browser grant and simulated-Bob buttons are disabled in server mode; another browser must use its own authorized identity.

Authority claim is bounded: effectively-once effects through durable idempotency under tested concurrency/process/network conditions. Delivery itself may repeat. No globally exactly-once network guarantee, whole-campaign certification, arbitrary hostile server compromise, per-player avatar economy, production PHP/MySQL rollout, machine-power-loss test or owner release approval is implied. Existing live game heartbeat recovery is a separate regression smoke test.


## ZGE-07 update

ZGE-07 adds 11 actual security/recovery tests to the original 10 PHP/SQLite tests. Three independent browser contexts demonstrate two authorized builders plus denied cross-world access; expiry/reload/reauthentication retains the original outbox and durable effects. The current server uses memberships, persistent session IDs and separate connections, with authenticated bounded archive pages. See SESSION_SECURITY_ZGE_07.md and PERSISTENT_RECOVERY_ZGE_07.md. Staging remains loopback and production-default denied.


## ZGE-08 supervised multiplayer certificate

Final engine suite: 221/221. Actual concurrent PHP gateways reuse one persistent world child/runtime while SQLite serializes candidate execution and receipt/event/claim publication. Fourteen required process/transport/database recovery categories and whole-launcher SIGKILL recovery are documented in [operational durability](OPERATIONAL_DURABILITY_ZGE_08.md). Final local burst capacity was 88.66–100.64 actual commands/s at 1–8 actors; sustained admission remains quota-bound and is not a production SLA. Earlier collective PHP/session compatibility passes are retained.


## ZGE-09 operational extension

ZGE-09 final 251/251 engine tests, nine retained browser scripts, continuous owned launcher supervision, established database inode/device checks and existing-only PDO opening are certified locally. A 600.15-second complete managed mixed run accepted 3,958 HTTP requests with zero throttles/transport failures and exact replay of 3,192 commands and 9,768 events archive replay. See MULTIPLAYER_SOAK_RESULTS for conflicts, quotas, CPU/RSS/FD trends and limits.
