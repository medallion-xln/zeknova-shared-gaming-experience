# ZGE-04 — Live gameplay parity and controlled authority migration

Date: 2026-10-20, America/Los_Angeles. HEAD `138220f4909b3fd6a3e0dd2e62ebab63785336d7`, unchanged. **PASS for bounded construction parity, local transaction correctness and the controlled fixture migration boundary. Live ENGINE construction remains NO-GO.** No commit/staging, minified bundle edit, golden hash change, production configuration change or credential rotation.

## Baseline and repository integrity

Measured before edits: engine **83/83**; legacy **82/85** matching test files, with the three historical golden failures. Read the ZGE-03 architecture/authority/extraction/demo reports, the migration roadmap and existing ZGE-04 plan; the user's current bounded-parity directive governs the older roadmap's broader world/multiplayer objectives. Preserved the entire dirty tree. Process-name and working-directory checks observed other agent activity associated with another repository; no writer conflict was observed here. Precise created/modified files and unchanged bundle digest are recorded in `evidence/zge04/file-inventory.json`.

**86 → 85 accounting:** `CERTIFICATION_RESULTS.md` explicitly counted forty `.test.mjs` files, forty-five `.test.cjs` files and `tests/picasso-performance-report.mjs`. ZGE-03 counted only the eighty-five `.test` files. No test disappeared or was consolidated. ZGE-04 runs the additional Picasso report too: final **82/85 + 1/1 = 83/86**. The same three golden assertions remain red; hashes were not regenerated.

Exposed provider credentials, collector token and the earlier credential-bearing process argument remain unresolved. Owner-controlled revocation/rotation is urgent; see `SECURITY_REMEDIATION_ZGE_04.md`. No secret values were printed or changed in this milestone.

## What now executes

- `Construction` v2 adds world/inventory revisions, expected-revision rejection, canonical command idempotency and conflict detection, reentry exclusion, detached commit preparation/validation, staged intentions and interrupted recovery. Accepted operations publish once; retries under different outer transport IDs do not re-emit the construction event. Existing v1 snapshots migrate; production saves stay v4.
- The optional live observer now captures frozen plain state, evaluates independent ZekNova policy/utility logic and records structured parity. It never invokes live site validators during engine evaluation, never calls saves/network/progression, and invokes the original placement once even if observation fails. History is capped at twenty raw live rows; aggregate counters are retained. The default game remains LEGACY.
- `zge.world-state.v1` represents entities/components, transforms, buildings, occupancy, inventory, revisions, events and descriptive authority. It validates cross-field consistency and rejects non-JSON/render objects. Restored/exported state is detached and immutable.
- `AuthorityDomain` provides private writer/mode/epoch state, registration/conflict checks, synchronous single-writer dispatch, immutable migration validation, shared idempotency across authority switches, serializable journals, stale-epoch rejection and rollback. ENGINE activation requires an explicit local fixture and a certified SHADOW transition. A test migrates actual legacy placement state into real engine construction and back without double-spending a retried operation.
- Pure mission/combat reducers add command journals, ordered progress/completion/reward-eligibility and damage/death proposals. No live campaign/boss/combat/reward authority changed.
- The standalone lab now accepts canvas/form placement, shows live inventory/world state, rejects occupied/outside locations, removes buildings, rolls back, saves/restores locally, recovers interrupted intents and verifies deterministic replay. It still imports no ZekNova content or minified runtime.

## Parity and browser evidence

Node: **702/702 matched** actual legacy-method cases across all 26 definitions, three officer classes and nine scenarios. Browser: **390/390 matched**, zero skipped, using the actual manager class, real terrain, raw collision queries, controlled identifiers/random draws and equivalent explicit synthetic utility/inventory state. Engine comparison runs an actual detached transaction. Every bounded row still identifies unobservable full-game domains. Raw reports preserve canonical before/after state and events rather than just a boolean pass.

The ordinary-game input fixture uses the real building control and physical canvas click. Observed order: selected power → placement entry → record added → progression notification → placement return → save request. It verifies exactly one new record, exact construction costs, XP progress, acknowledged v4 save, stable ID restoration and absence of shadow state in the envelope. It also aborts the actual legacy multiplayer heartbeat request, observes disconnection, removes the fault and verifies reconnection. This is a local recovery smoke test, not two-client transaction arbitration.

The earlier 387-row run had three unexercised valid-boat cases due to seed placement. The final fixture explicitly locates a water site before placing synthetic utility sources. An intermediate raw-collision run found twelve mismatches caused by stale spatial-index entries while replacing managers. The harness now initializes and restores derived indexes explicitly. Both diagnostic runs are retained; no collision discrepancy was silently normalized and no production bundle cache behavior was changed.

| Browser coverage | Evidence / limit |
|---|---|
| Launch, movement, collision, construction | Native WebGPU and WebGL safe-mode smoke; actual keyboard movement and terrain obstacle query; real pointer construction plus 390 manager cases |
| Combat and missions | Actual legacy health decrease; twelve mission definitions retained; pure representative parity fixtures |
| Boss | Controlled Sunscar encounter reaches defeat/reward record; no complete campaign claim |
| Persistence | Ordinary v4 saves acknowledged, building ID retained, XP 777 restored; boss QA saves remain intentionally isolated |
| Multiplayer | Actual heartbeat failure/reconnection; local revision fencing tested; simultaneous two-player spending/placement remains untested |
| In-page restart | 29 directors, settled listener/interval delta zero in follow-up; page-only UI remains restricted |
| Native/neural fallback | Native and missing-backend fallback pass; reference capture and explicit MOCK labelling pass; no real inference |
| Assets | Existing parsed cache/clone tests pass; actual KTX2 stress rerun on WebGPU/WebGL, bounded failure/retry remains; live pool limit four |
| Standalone V2 | Actual controls/canvas, deduction, rejection, remove/undo, save/reload, interrupted-intent abort and replay pass; screenshot retained |

The first live-pointer harness attempt had toggled the already-selected building off. A synthetic event fallback then produced a pointer-capture diagnostic. The final harness explicitly ensures selection and uses a physical Playwright click, with zero uncaught errors. These were fixture corrections, not gameplay code fixes.

## Authority decision

A safe complete live interception port was not found. The observed `place` method excludes protected-territory prechecks, pointer-side XP/diplomacy/mission/save effects, multiple addRecord/restore/network paths and derived utility/collision state. UI rank filtering does not enforce a complete mutation policy. Replacing only this method would leave hidden writers and effects. Full transfer is therefore blocked even though bounded placement rows match.

The new gateway certifies cooperating isolated ports only. Its tests prove legacy dispatch is inactive during engine ownership, conflict/reentry/stale requests reject, migrated state is validated, rollback restores the legacy writer and the shared command journal prevents a second charge. It is not wired to an unsafe partial live takeover. `AUTHORITY_TRANSFER_READINESS.md` describes the smallest readable source-owned port that must route all construction mutations before a local game flag can be enabled.

## Transaction and schema limits

Local synchronous atomicity and idempotency are demonstrated. Network timeout/conflict tests resubmit committed snapshots rather than running placement again. No global exactly-once guarantee, server-side inventory lock, collision arbitration or multi-client atomic commit is claimed. Rollback rewinds a local logical branch; online undo requires a new authority fence. Undo history retains before images and grows quadratically in the number of operations; checkpoint/delta history is needed before production scale.

World snapshots carry authority identifiers as data, never as execution permission. Generic callbacks are trusted cooperating code, not a JavaScript sandbox. Validators must not perform irreversible effects. Production gameplay/persistence formats, minified runtime, mission/boss ownership and neural simulation boundary are unchanged.

## Tests and performance

Final engine: **106/106** (original 83 preserved). Final legacy: **82/85** matching test files, plus the extra Picasso report **1/1**. Unchanged failures: runtime reconstruction, renderer ownership certification and runtime graphics context golden hashes. One diagnosis/search contract file hit the harness's 60-second timeout during concurrent browser work; its baseline took approximately 35 seconds, and an isolated recheck passed all 83 internal assertions. The original timeout evidence is retained alongside the recheck. No new sustained assertion failure remains. Source structural and animation audits pass.

Performance is measured before/after with the same Node benchmark and browser viewport. The benchmark reports actual units, samples and heap snapshots; the raw artifacts are retained. Copying the entire transaction journal on each execute was removed: the 100-placement sample's median transaction time fell from roughly 5.72 ms to 0.21 ms. Validation stayed about 0.006 ms; serialization changed from ~2.58 to ~2.99 ms and restore from ~11.10 to ~11.56 ms in these samples. Fixed-step overhead remains sub-microsecond in the empty-world fixture. Heap delta is a point-in-time sample, not retained-memory/leak proof; serialized hundred-operation history is about 1.33 MB.

Optional shadow work has measurable capture/comparison overhead beyond ZGE-03's shallow check. A first version copied all obstacles and measured a ~2.2 ms placement median; final capture filters obstacles to the relevant clearance footprint. The final sample measures ~0.1 ms median and ~0.3 ms p95 per shadow placement, versus native LEGACY median below the browser timer resolution. Final browser timings are in `browser-after-final.json`. Host/browser scheduling varied (baseline 30-Hz cadence, later 60-Hz samples), so frame percentile differences are reported as samples rather than a causal extraction speedup/regression or ±10% release certificate. Native default LEGACY mode does not run the shadow evaluator. No comparable production memory/GPU residency budget or full-campaign performance certification is claimed.

## Remaining gates and next step

GO for bounded parity, immutable observation, independent engine V2 and fixture authority migration. NO-GO for live game takeover or distributed construction authority. Next: the readable complete construction port and side-effect parity in `ZGE_05_IMPLEMENTATION_PROMPT.md`.

Tracked limits remain: source-level commit port; complete mission/diplomacy/aid/utility effects; removal/relocation/network mutation routes; multi-client inventory/occupancy semantics; history scaling; page-only UI teardown; embedded duplicate Three instance; unproven historical GLTF hang attribution; owner credential rotation and golden/build provenance gates.

```text
=== ZGE-04 ENGINE AUTHORITY MIGRATION ===
STATUS=PASS_BOUNDED; LIVE_TRANSFER_NO_GO
HEAD=138220f4909b3fd6a3e0dd2e62ebab63785336d7
FILES_CREATED=55
FILES_MODIFIED=11
CONCURRENT_WRITER_DETECTED=NONE_OBSERVED
ENGINE_CORE=EXECUTABLE; SINGLE_WRITER_FIXTURE_GATEWAY
WORLD_STATE_SCHEMA=ZGE_WORLD_STATE_V1
CONSTRUCTION_PARITY=702_NODE_AND_390_BROWSER_MATCHED; BOUNDED_SCOPE
CONSTRUCTION_SHADOW_MODE=IMMUTABLE_OPT_IN; LEGACY_SOLE_LIVE_WRITER
CONSTRUCTION_TRANSACTION_INTEGRITY=LOCAL_V2_CERTIFIED
LIVE_AUTHORITY_SEAM=NO_COMPLETE_SAFE_PORT
LIVE_AUTHORITY_TRANSFER=NOT_ENABLED
ROLLBACK_VERIFICATION=FIXTURE_PASS; SHARED_IDEMPOTENCY_PRESERVED
MISSION_EVALUATOR=PURE_REDUCER; REPRESENTATIVE_PARITY
COMBAT_EVALUATOR=PURE_REDUCER; NUMERIC_RESULT_PARITY
STANDALONE_DEMO=V2_BROWSER_AND_NODE_PASS
ASSET_SERVICE=PRESERVED; FOUR_WORKER_LIMIT
GLTF_RELIABILITY=FAULT_BOUNDS_PASS; HISTORICAL_ROOT_CAUSE_OPEN
RESTART_SAFETY=29_DIRECTORS; SETTLED_DELTA_0
PERSISTENCE_COMPATIBILITY=V4_PRESERVED; ACK_RESTORE_PASS
ENGINE_TESTS=106/106
LEGACY_TESTS=82/85_PLUS_REPORT_1/1; SAME_3_GOLDEN_FAILURES
NEW_REGRESSIONS=0_SUSTAINED_ASSERTION_FAILURES
PERFORMANCE_DELTA=TRANSACTION_COPY_COST_REDUCED; SHADOW_HAS_OVERHEAD
UNRESOLVED_BLOCKERS=SOURCE_PORT; FULL_EFFECTS; MULTIPLAYER_AUTHORITY; OWNER_GATES
NEXT_MILESTONE=ZGE_05
GO_NO_GO=GO_BOUNDED_MIGRATION_FIXTURES; NO_GO_LIVE_TAKEOVER
```
