# Multiplayer construction certification — ZGE-05

**PASS for the isolated server fixture and tested conditions. Existing PHP multiplayer construction authority is NOT certified.** Local runtime atomicity, server fixture arbitration and live heartbeat recovery are three separate claims.

`ConstructionServerFixture` owns one private ConstructionRuntime and a WorldCheckpointStore. Each arriving authenticated fixture request creates a candidate from the confirmed snapshot, executes synchronously, atomically CAS-replaces the checkpoint, then exposes the confirmed result. Test identities Alice/Bob have separate configured tokens; these constants are not real authentication infrastructure. Tokens are checked before any state access/mutation. Logical transaction IDs are namespaced by authenticated client; building IDs are globally unique through Construction validation. Clients may place/remove shared team structures; grants, movement and selection are not network-authorized commands. Initial balances/catalog/policy are trusted server configuration.

Expected world revision is mandatory. A serial arrival wins; another request based on the same revision receives a persisted stale rejection. After reconciliation, a **new logical intent/ID** may be tried; a retry of an existing ID returns its stored outcome. Collision and shared funds are evaluated from confirmed server state, never client inventory. Changed payloads under an old ID reject. Accepted commands and rejected audit receipts survive fixture restart. The checkpoint's version advances for durable audit changes even when gameplay revision does not.

| Scenario | Executable evidence |
|---|---|
| Simultaneous same-world clients | Promise.all deliveries, first accepted and second stale; no second cost |
| Overlap after reconciliation | New current-revision request rejects occupied site |
| Insufficient shared resources | Second client sees confirmed balance and cannot overspend |
| Duplicate/conflicting delivery | Stored result reused; changed payload rejects; restart retains receipt |
| Delayed/out-of-order responses | Controlled pending promises release responses in reverse; older checkpoint cannot rewind client view |
| Disconnect before receipt | Persistent-outbox-shaped callback retains exact request; reconnect submits it once |
| Disconnect after commit/lost ack | Server has building/cost, restarted client resends original expected revision/ID and recovers receipt |
| Stale revisions/server rejection | No world mutation; durable rejection is distinguishable from failed storage |
| Interrupted storage before commit | No success acknowledgment, confirmed runtime unchanged, outbox retained, same-ID retry succeeds |
| Atomic replace succeeds then acknowledgment is lost | Store has receipt; retry finds it and cannot charge again |
| Competing fixture server/CAS conflict | Loser reports conflict and refreshes confirmed snapshot; no stale-resource merge |
| Unauthorized/forbidden grant | No mutation or receipt exposure |
| Reconciliation | Highest confirmed checkpoint version wins, including rejection-only changes |

Client API stores pending commands through an injected synchronous persistence callback **before** sending. Default callback is in-memory only. Recovery tests recreate a client from the captured pending data; applications must supply durable storage for real reload recovery. Server memoryWorldCheckpoint survives simulated object restart while that store instance exists; it does not survive process loss. localWorldCheckpoint uses synchronous localStorage replacement, not a database or multiprocess transaction. WorldCheckpointStore requires a synchronous atomic adapter, rejects async early acknowledgments, stale expected versions, cross-world writes and changed duplicate snapshot payloads. Write exceptions never report success; an indeterminate post-write failure is resolved through persisted operation receipts.

Scope limits: in-process deterministic network scheduling, trusted fixture tokens, no real HTTP service, no SQL lock/fencing/authentication/authorization service, no hostile client security certification, no packet-loss probabilistic campaign, no process-durable server disk adapter. CAS adapters are trusted to serialize their read/replace boundary; localStorage CAS is not a cross-tab lock. Full receipts/snapshot fingerprints are retained without compaction. These limitations prevent a production distributed exactly-once claim.

The live game still POSTs client world projections to PHP and merges records/health/cooldowns independently. Browser tests verify ordinary building persistence and heartbeat failure/reconnection, not simultaneous PHP inventory/occupancy arbitration. A production migration needs authenticated server command validation, transactional inventory/occupancy/journal storage, atomic revision compare, durable outbox/reply semantics, content-version migration, conflict policy and crash/restart tests against that actual service.
