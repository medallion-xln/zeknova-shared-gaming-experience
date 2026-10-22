# Construction extraction — ZGE-03

`@zge/gameplay-construction` executes real terrain/occupancy validation, resource accounting, placement/removal, structured events, save/restore, reverse rollback and replay. It imports no Three.js code, ZekNova catalog, missions or minified runtime. Building definitions, costs, radius, height/rotation functions and terrain policy are injected.

Public entry: `packages/gameplay-construction/src/index.js` exports `evaluatePlacement`, `Construction`, `dispatchConstruction`, `installConstruction`.

Transactions require `commandId`; placed buildings have a separate stable `id`. A prior command returns its recorded result. A different command using an existing building ID is rejected. Invalid/occupied/out-of-bounds/unaffordable placement performs no inventory or occupancy mutation. All validation and derived height/rotation calculation completes before committing inventory and building data. Validation exceptions propagate without partial writes. Removal has no implicit refund. Rollback is last-in-first-out and restores inventory, buildings and events; replay after rollback reproduces identical serializable data. Version-1 state is separate from production PHP saves. Command history is currently retained for the fixture lifetime; pruning/checkpointing is future work.

## Behavior contract and deliberate differences

The test evaluates the actual `LR` methods extracted at test time from the existing bundle in a VM. Rendering, UUID generation and random rotation are deterministic stubs, while actual `effectiveCost`, affordability, water-site rules, site height and `place` execute as the oracle. The matrix spans three officer ranks, land/water building types, unknown types, two terrain outcomes and two inventories (48 cases). Lieutenant mineral costs retain `ceil(cost * .85)`; other resources are unchanged.

The generic engine additionally rejects malformed coordinates, invalid costs and overlapping circle footprints. The base legacy `place` delegates terrain checks and does not itself reject overlap; later legacy wrappers add further placement policies. Engine rotation defaults to deterministic zero unless supplied; the legacy random spin is not migrated. Utility graphs, bridge traversal, aid cooldowns, rank unlocks, commissioning effects, multiplayer IDs and presentation are still legacy-owned. This contract proves a bounded placement/resource slice, not whole-game equivalence.

## Shadow and authority certification

Live `?construction=shadow` installs a disposable wrapper around `buildings.place`. It evaluates detached inventory/record copies using game-specific definitions and the game's cost/site functions, calls the original exactly once, compares acceptance and resource deductions, and returns the original record. It never writes a prediction to the live records, world resources or save envelope. `ZGE.construction()` reports comparisons, mismatches and bounded difference samples. It does not compare random rotation or every wrapper side effect. Failure to evaluate cannot stop legacy placement.

Production stays LEGACY. `dispatchConstruction` allows isolated LEGACY/SHADOW/ENGINE fixtures; ENGINE calls only the independent transaction implementation, and rollback to LEGACY is immediate. The kernel adapter enforces authority again when queued commands execute. No resource is deducted twice and no engine building is mirrored back into the live records.

Automated tests cover oracle decisions, exact costs, retries, duplicate commands/IDs, circle occupancy, invalid coordinates, validation failure atomicity, removal, reverse rollback, detached snapshots, deterministic replay, authority switching, disposal and shadow immutability. Browser evidence records live Solar Grid comparisons and restart identity safety. Full-game transfer remains a NO-GO until the broader policies above have equivalent behavior contracts.
