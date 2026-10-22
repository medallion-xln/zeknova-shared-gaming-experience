# Construction parity certification — ZGE-04

**Bounded placement parity passes; complete live authority parity is not certified.** Machine-readable reports retain canonical before/after state, requests, predicted/actual results, observed events, differences, normalizations, fixture IDs and unobservable fields. The live aggregate is `ZGE.construction().parity`; its totals cover all observations and its raw row history is capped at twenty.

## Oracle and comparison boundaries

- Node executes actual legacy `LR` methods and the real progression/aid placement wrapper bodies read from the unchanged bundle at test time. Catalog/cost drift is checked. Synthetic terrain supplies explicit comparable facts; the generic engine owns its own utility traversal, terrain decision and transaction logic. This is not a copy of the old mutator delegated back into the engine.
- Browser creates isolated instances of the real legacy manager class in the actual game, with explicit synthetic inventories and operational utility seed records. It uses real terrain, collision queries, patched addRecord and placement behavior. The game and terrain manager references are restored in a finally block, and fixture meshes/resources are disposed. No production player data is used.
- A separate normal-game browser case uses the real building control and physical canvas click, actual progression callbacks, HUD/save path, acknowledged server save and restored building ID. This captures the broader side effects but does not claim the independent engine implements them.

Node matrix: 26 building definitions × 3 officer classes × 9 scenarios = **702 matched cases**. Scenarios cover valid sites, insufficient resources, outside bounds, slopes, terrain height, occupancy, missing utility, dead utility source and aid cooldown. Browser matrix: 26 × 3 × 5 = 390 candidate cases, with **390 matched and zero skipped** after correcting fixture setup. The initial scan missed three valid-boat cases because utility seeds were placed near the first dry site; the final fixture locates a water-infrastructure site before placing nearby synthetic utility sources.

Each browser engine prediction executes a real detached Construction transaction after game policy validation. IDs and the random non-bridge rotation draw are controlled inputs within the synchronous fixture call; the original generators are restored immediately. Bridge rotation remains terrain-derived and must match. Positions, resources, record counts, IDs, raw collision decisions and serialized inventory/core-building projections are compared without forgiving gameplay drift. Health/utility extensions remain explicitly unobservable; projection parity is not full-save equivalence. The real-pointer flow records select → placement entry → record add → progression → placement return → save request, then verifies persistence/restore and multiplayer heartbeat failure/reconnection.

## Immutable shadow boundary

`captureConstructionInput` samples only plain numeric/state facts and pure terrain primitives. It never calls `buildings.isValidSite`, `effectiveCost`, construction hooks, saves, mission mutators or network commands. The frozen capture contains no live game/terrain functions. `evaluateZekNovaPlacement` operates solely on that immutable capture and ZekNova content outside the generic package. Relevant obstacles are filtered to those intersecting the requested three-metre clearance before copying; utility records retain the connectivity information needed by the policy.

The existing observed legacy method is invoked exactly once. Observer exceptions are counted and cannot block that call. Disposal restores method identity. Tests attempt to mutate frozen inputs and install save/network/progression sentinels, verifying only the legacy placement mutates inventory/records. Live defaults remain LEGACY; shadow remains opt-in.

## Classification and observability

The comparator emits ACCEPTANCE_MISMATCH, RESOURCE_COST_MISMATCH, POSITION_MISMATCH, COLLISION_MISMATCH, WORLD_STATE_MISMATCH, EVENT_ORDER_MISMATCH, SERIALIZATION_MISMATCH and EXPECTED_NORMALIZATION. Fault fixtures verify each meaningful comparator path. Missing event, persistence, rejection-code or broader gameplay evidence is explicitly unobservable.

Normal live observations map a newly generated opaque engine ID to the legacy generated ID only as a declared correspondence; uniqueness and persistence must still be checked. Random non-bridge rotation is unobservable without a captured/controlled draw, not silently ignored. Fixture IDs/rotations are controlled and compare exactly. No normalization changes costs, health, gameplay orientation, occupancy or authority.

Rank gating at the UI, protected diplomacy territory, mission advancement/XP/rewards, aid effect publication, utility/index state, relocation/removal, server merge and concurrent multiplayer arbitration are not fully covered by the placement port. The production observer marks relevant missing domains. The null-only legacy placement failure has no structured rejection code, so the engine's detailed rejection code is not presented as proven equivalent. Full engine takeover remains blocked despite zero mismatches in the bounded corpus.

Reproduce with `ZGE_PARITY_REPORT=/tmp/node-parity.json npm run test:engine`, `scripts/zge04-browser-parity.mjs`, `scripts/zge04-browser-live-flow.mjs` and `scripts/zge04-browser-demo.mjs`; browser scripts accept `PLAYWRIGHT_MODULE`, `CHROME_PATH` and `ZGE_EVIDENCE_DIR`. Run them only against the local development server.

## Diagnostic runs retained

One intermediate manager-replacement run recorded twelve COLLISION_MISMATCH rows. Investigation found stale derived legacy spatial-index entries from the previous temporary manager: addRecord updates the cache signature without clearing another manager's entries. The harness now initializes indexes after assigning each fresh manager and restores indexes in its finally block. This establishes equivalent fixture state rather than normalizing away collisions. The raw diagnostic report is retained. Production cache/source migration remains legacy-owned; no bundle fix was made or historical runtime behavior silently changed.
