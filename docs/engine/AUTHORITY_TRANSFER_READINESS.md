# Authority transfer readiness — ZGE-04

**Live construction remains LEGACY; optional observation remains SHADOW. Live ENGINE takeover is NO-GO.** `?construction=engine` still does not activate it. The minified runtime is unchanged.

## Investigated seam

The existing instance method `buildings.place` is useful for bounded observation but is not the complete player construction transaction. The real canvas handler also selects catalog entries, checks protected diplomacy territory, reports mission changes, grants 14 XP, applies trust/ecology effects, updates HUD and requests persistence. Layered `place` wrappers implement progression and aid callbacks; site validation itself writes `utilityTerrain` and `lastConnectionRequirement`. `addRecord` builds Three.js objects, updates utility/collision indexes and is also used by restore and multiplayer merge. UI rank filtering is not an authoritative rank check in the base placement method.

No exported source-level interface can both disable all legacy construction writers and transfer those side effects safely. `ZekNovaLegacyBridge` is a game lifecycle bridge, not a construction commit port. Another prototype patch or replacing only `place` would leave competing writers/couplings. We did not force this transfer.

## Local certified gateway

Core `AuthorityDomain` registers one cooperating writer per mode. It starts LEGACY or SHADOW; ENGINE requires an explicit local-fixture constructor policy, a registered engine writer, a certified SHADOW → ENGINE transition and successful immutable state-migration validation. Private mode/epoch/writer state prevents diagnostics from changing ownership. Active transactions reject switching/reentry. Captured writer functions reject use outside their selected dispatch. Commands have a shared, serializable idempotency journal across ownership changes; stale epochs and changed payloads reject. Journal restore retains duplicate handling and advances the local fencing epoch without restoring execution permission.

A test uses actual legacy `LR` placement as one writer and the independent Construction transaction as the other. It places under LEGACY, migrates equivalent state, activates ENGINE, proves legacy dispatch is inactive, and rolls back to LEGACY while retrying the same accepted command without another charge. Additional tests reject writer conflicts, invalid migration, activation in a live-policy domain, constructor bypass, direct inactive-writer calls and switching mid-transaction. This certifies cooperating isolated ports, not the unrestricted legacy game, arbitrary JavaScript plugins or distributed transactions.

## Smallest source migration needed

1. Reconstruct a readable construction request/commit interface from the pointer handler plus layered placement/addRecord behavior, with an explicit versioned request, canonical result and ordered effects.
2. Route pointer input, progression/aid, save restore, multiplayer add/merge, removal and relocation through that one source-owned port. Retain the legacy implementation behind it initially.
3. Split validation/preparation from rendering, utility/collision publication, mission/XP/diplomacy effects and persistence acknowledgement. Give each effect one owner and failure contract.
4. Enforce the writer lease at that port for every entry; disabling the legacy writer must disable all its mutation paths rather than just an observed method.
5. Replay the bounded parity corpus plus full side-effect traces and two-client conflict/restore scenarios. Prove state migration and fencing, including failures during effect publication.
6. Only then expose an explicit local-development takeover gate. Production remains legacy until separately certified.

Remaining blockers: full pointer-effect equivalence, authoritative rank/policy semantics, richer utility/health/network state, server inventory/occupancy arbitration, asynchronous effect recovery and a reproducible source build/interface integration. Matching placement rows with unobservable columns is not a full takeover certificate.
