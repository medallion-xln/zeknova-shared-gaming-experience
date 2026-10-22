# Construction transaction contract — ZGE-04

`@zge/gameplay-construction` remains renderer-independent. `Construction.execute` is a synchronous local transaction over plain data. It is not a distributed transaction or server-authoritative inventory service.

## State and request versions

Snapshot version 2 adds `revision`, `inventoryRevision` and `pending` to ZGE-03's inventory, buildings, event list and command ledger. Version-1 snapshots migrate with revision counters initialized to zero. Production PHP saves remain version 4 and do not contain this fixture state automatically.

Placement commands carry `commandId`, stable building `id`, `action=place`, definition type and finite x/z, with optional rotation and expected world/inventory revisions. Removal carries action/id/commandId. World revision advances for accepted placement/removal; inventory revision advances for accepted placement. Rejections do not spend, add occupancy, advance these revisions or emit authoritative construction events. A rejected decision may be retained in the audit/idempotency ledger.

## Atomicity and idempotency

1. Reject reentrant transactions.
2. Resolve the idempotency key. The same logical command, including reordered JSON object keys, returns its recorded result. A different payload under that key returns `idempotency-conflict`.
3. Check expected world revision, then inventory revision.
4. Validate definition, request, terrain, occupancy and affordability. Calculate finite height, rotation and nonnegative costs before committing.
5. Build detached next inventory/building/event/ledger data.
6. Run an optional synchronous `beforeCommit` validation hook against frozen data. Exceptions leave the published state unchanged. This hook is for validation, not irreversible rendering/network side effects.
7. Publish the prepared state once. The kernel adapter emits `construction:changed` only for an actual revision change. Different outer transport IDs cannot duplicate the same inner placement event.

Generic rejection reasons include `unknown-building`, `invalid-request`, `duplicate-building`, `terrain`, `occupied`, `invalid-definition`, `invalid-cost-or-inventory`, `resources`, `invalid-terrain`, `missing-building`, `unknown-action`, `stale-world-revision`, `stale-inventory-revision` and `idempotency-conflict`. ZekNova's game policy adds finer terrain/utility/cooldown decisions without putting its catalog in the engine.

## Interruption, replay and rollback

`stage(command)` records an intention without spending or creating a building. Conflicting staged IDs reject. A serialized intention survives reload; `recoverPending()` aborts intentions by default without a gameplay mutation. Explicit `recoverPending({commit:true})` executes them idempotently. A failed commit retains the current intention for later recovery. The demo aborts unfinished intentions after restore.

Rollback is reverse-order local undo. It restores inventory, buildings, events and logical revisions, after which deterministic replay can reproduce the same state. These logical revisions are branch-local, not a global monotonic database clock. A future online undo must also fence old writers/requests with a new authority epoch. The demo does not accept network writers during undo. Removal clears occupancy without an implicit refund; undo restores the prior state.

## Adversarial evidence and limits

Tests cover insufficient resources, unknown type, nonfinite coordinates, outside terrain, occupied sites, height/slope facts, missing/broken utility supply, stale balances, duplicate submissions, changed payloads, reentrant writes, failed validation, pending reload recovery, save timeout/conflict retries, remote snapshot revision changes, removal and repeated rollback/replay.

Transport tests submit already-committed synthetic v4 snapshots through the existing acknowledged SaveTransport/fake server. A retry never re-executes placement. Real-browser tests verify an ordinary construction save, stable building ID restoration and actual multiplayer heartbeat disconnect/reconnect. They do not prove atomic transactions across two players, global exactly-once spending, collision locking on the PHP server or conflict-free simultaneous construction. Those remain blockers for network authority transfer.
