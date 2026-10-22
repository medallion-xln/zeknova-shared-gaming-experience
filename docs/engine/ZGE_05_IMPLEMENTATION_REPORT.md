# ZGE-05 — Source-owned gameplay runtime and construction authority

**PASS for the independent source-owned world and isolated server fixture. NO-GO for live authority transfer or production release.** HEAD `138220f4909b3fd6a3e0dd2e62ebab63785336d7` unchanged. No commits/staging/reset, golden changes, deployment/credential modifications or new minified patches. Live construction remains LEGACY; optional SHADOW remains observation only.

## Executable result

The existing Construction implementation now supports an atomic resource-grant command and immutable transaction results. `ConstructionRuntime` composes it with the existing core world schema, mission reducer, stable event journal and candidate validation. Construction, inventory, player movement/selection, mission progress, a once-only example XP reward, revisions, receipts and gameplay events commit through one private boundary. Meshes and subscribers never hold authority. Local failed validation publishes nothing; presentation failure cannot retry cost/reward application. Overflowing grants reject without publishing invalid inventory.

`GameplayEventJournal` records schema/IDs/order/sequence/authority/revision, deduplicates replay, validates ordering and cross-field restore consistency, isolates subscriber failures and distinguishes local commits from storage/network acknowledgment. Mission/reward changes are committed state, not event subscribers. Full replay uses retained commands/configuration and compares the complete state and journal.

`WorldCheckpointStore` adds a separate versioned acknowledged CAS contract without changing v4 SaveTransport. It preserves transaction/reward/event journals, reports conflict, requires synchronous atomic adapters, rejects asynchronous early acknowledgment and supports interrupted/post-write-lost-ack recovery through operation receipts. Memory/localStorage are fixture/browser acknowledgments, not database/fsync certification.

`ConstructionServerFixture` arbitrates shared inventory/occupancy with authenticated test identities, per-client transaction namespaces, mandatory expected revisions, durable-store-shaped receipts, stale/conflict reporting and confirmed snapshot reconciliation. Two clients exercise concurrent requests, overlap, insufficient funds, duplicate/conflicting IDs, reversed delayed responses, disconnections before receipt/after commit, client/server object restart, storage interruptions and competing-server CAS. These are in-process fixtures, not PHP production authority.

Construction Valley at `/examples/construction-world/` is now a connected native 3D scene: controllable player, terrain/rock/building collision, resource grant, shelter/beacon selection, valid/invalid placement, mission progress/25-XP reward, event inspector, local acknowledged save/reload, deterministic replay, same-world second builder request, reference capture and owned scene restart/disposal. It imports no minified runtime. The prior V2 lab remains at `v2.html` with its original browser assertions preserved; the Node demo remains green.

## Legacy reconstruction and authority decision

Actual legacy order is documented in SOURCE_RUNTIME_RECONSTRUCTION and CONSTRUCTION_SIDE_EFFECTS, including direct deduction before models, layered health/utility/index/HUD publication before personal progression, pointer-side campaign/XP/diplomacy, deferred save and independently timed multiplayer merge. There is no resource reservation or construction idempotency journal. Actual-code tests show model failure after deduction, toast failure before XP/save, and a missing original aid-effect implementation captured by the cooldown wrapper. The latter is a pre-existing source-observed partial-failure gate, not a new gameplay regression or fully browser-certified benefit policy.

The observed place seam does not cover drag/repair/damage/restore/addRecord/network writers. Live takeover conditions fail; none is bypassed. LIVE_AUTHORITY_MIGRATION_GATE supplies a concrete readable command-port, private-lease, effect/persistence/server migration specification. Earlier local AuthorityDomain transition/rollback and shared journal tests remain green; new deterministic source replay does not constitute live rollback or online undo certification.

## Integrity, certification and test accounting

Baseline engine **106/106**; final **140/140**, retaining all original tests and adding 34 executable runtime/event/checkpoint/server/actual-legacy-effect regressions. Node placement corpus **702/702** and real-manager browser **390/390**, zero skips/mismatches, with explicitly unobservable full-game effects. Existing persistence/assets/transactions/world-state/neural tests all run within the engine suite.

Legacy before/after **83/86**: 85 matching test files plus the original Picasso report, same three golden failures. No tests disappeared. Source structural check, animation audit and Node demo pass. Seven sequential browser scripts all exit zero: current game WebGPU/WebGL movement/collision/construction/combat/boss/native/fallback/restart; real manager parity; physical-pointer costs/progression/v4 ID restore and multiplayer heartbeat recovery; mock reference capture/boss reward/XP 777 reload; V2 controls; new 3D controls/state/capture/restarts/disposal; comparable live performance. Detailed evidence is retained rather than extending these smoke tests into full campaign/acoustic/PHP concurrency claims.

The first older browser probe failed movement at a fixed world coordinate. A terrain-aware rerun revealed a delayed deployment teleport could falsely satisfy the lower movement bound. The final ZGE-05 probe pins the local QA officer rank, finds a clear movement area, focuses the canvas, and requires distance between 1 and 15 metres. Final four movements are approximately 9.5–9.7 m with zero uncaught errors. Diagnostic logs/partial results remain. This is a fixture correction; no live movement implementation changed. An initial new VM test lacked `this.` when installing a class-field arrow into the isolated fixture; it was corrected and its initial log retained.

Root fingerprints before/after show **80 created, 9 modified, 0 deleted** files attributable to this milestone, including documentation/evidence. No unexpected existing-file changes or conflicting writer were observed. Process audit used names/PIDs/cwd only; other agent processes were associated with other repositories. The dirty submodule was already present and was not edited; its internal baseline was not recursively fingerprinted, and its current status is recorded separately. Full root baseline hashes/uncommitted-file inventory and unchanged artifact digests are in ZGE_05_VERIFICATION_MANIFEST and evidence/file-inventory. Preserve the entire dirty tree; this is not an approved release artifact set.

All three historical tests stop first at bundle SHA mismatch: expected `7a9cdfee…`, existing timeout-patched `25665bd8…`. Their subsequent model golden also predates prior readable model/asset changes. Neither hashes nor tests were re-pinned. Owner review/build provenance, source-reproducible replacement or explicitly approved artifact lineage must precede any golden update. ZEK-04.1 timeout patches and existing asset/cache/KTX2 behavior are preserved.

## Performance and remaining gates

ZGE_05_PERFORMANCE records comparable before/after units/workloads, added event/server cost, sampled heap/frame percentiles and restart counts. The old 100-command construction median is ~0.279 → 0.198 ms; the richer 40-command runtime median is ~6.1 ms with full history/mission/events. Native/SHADOW final invalid-placement medians are below timer resolution / ~0.2 ms; capped live and independent frame p95 ~16.8 ms. Full histories/before-images/checkpoint fingerprints still grow: checkpoint/delta compaction and capacity/content migrations are needed before production scale. Sampled heaps are not leak proof or an attributable budget.

Native/reference interfaces consume authoritative snapshots; optional missing neural service falls back, existing mock labeling/sequencing remains. No weights/training/neural physics. Duplicate embedded Three and exact historical GLTF hang attribution remain open despite passing controlled worker fault tests. Remaining page-only UI teardown is outside this milestone.

Exposed provider/collector credentials remain an **urgent independent owner security blocker**. SECURITY_REMEDIATION_ZGE_05 contains redacted revoke/rotate/history/post-verification actions; no values are printed or changed. Live port/effect coverage, aid callback, production server protocol, runtime↔v4 migration, history scaling and owner golden/source/security gates remain unresolved.

Reproduce: `npm run dev`; `node scripts/zge05-verify.mjs --browser` with PLAYWRIGHT_MODULE pointing to an installed Playwright ESM entry and optional CHROME_PATH/ZGE_EVIDENCE_DIR. The runner preserves historical failures separately, emits logs/hashes, and never regenerates release/golden assets. Exact commands/environment/result inventory are in ZGE_05_VERIFICATION_MANIFEST.

```text
=== ZGE-05 SOURCE-OWNED RUNTIME RESULT ===
STATUS=PASS_INDEPENDENT_WORLD_AND_SERVER_FIXTURE; LIVE_TRANSFER_NO_GO
HEAD=138220f4909b3fd6a3e0dd2e62ebab63785336d7
FILES_CREATED=80
FILES_MODIFIED=9
CONCURRENT_WRITER_DETECTED=NONE_OBSERVED
SOURCE_OWNED_RUNTIME=EXECUTABLE; EXISTING_CONSTRUCTION_EXTENDED
CONSTRUCTION_LIFECYCLE=ACTUAL_LEGACY_ORDER_RECONSTRUCTED; SOURCE_PATH_CONNECTED
SIDE_EFFECT_INVENTORY=CLASSIFIED_WITH_EXPLICIT_OBSERVABILITY_GAPS
AUTHORITATIVE_EVENT_PIPELINE=VERSIONED_IMMUTABLE_ORDERED_JOURNAL; PRESENTATION_ISOLATED
TRANSACTION_INTEGRITY=LOCAL_CANDIDATE_ATOMICITY_AND_IDEMPOTENCY_PASS
WORLD_STATE_REVISIONS=GAMEPLAY_INVENTORY_AND_CHECKPOINT_VERSIONS_VALIDATED
LOCAL_CONSTRUCTION_AUTHORITY=ENGINE_INDEPENDENT_WORLD
SERVER_FIXTURE_AUTHORITY=SERVER_ENGINE; TWO_CLIENT_TESTS_PASS
LIVE_ZEKNOVA_AUTHORITY=LEGACY; SHADOW_OPTIONAL
LEGACY_MUTATION_PATH_DISABLED=NO
ROLLBACK_CERTIFICATION=PRIOR_LOCAL_GATEWAY_PASS; SOURCE_REPLAY_PASS; LIVE_UNCERTIFIED
STANDALONE_3D_DEMO=PASS
PLAYER_INTERACTION=KEYBOARD_TERRAIN_AND_BUILDING_COLLISION_PASS
MISSION_EVENT_INTEGRATION=ATOMIC_PROGRESS_AND_ONCE_ONLY_EXAMPLE_REWARD
PERSISTENCE_RESTORE=CHECKPOINT_PASS; EXISTING_V4_PRESERVED
MULTIPLAYER_RECONCILIATION=FIXTURE_PASS; PHP_AUTHORITY_UNCERTIFIED
MATRIX_RENDERING_COMPATIBILITY=STATE_SNAPSHOT_CAPTURE_OPTIONAL_NEURAL_PRESENTATION
NATIVE_RENDERING=SOURCE_WEBGL2; LIVE_WEBGPU_AND_SAFE_WEBGL_PASS
NEURAL_FALLBACK=PASS; MOCK_LABELING_AND_ORDER_PRESERVED
ENGINE_TESTS=140/140
LEGACY_TESTS=83/86; SAME_THREE_GOLDEN_FAILURES
NEW_REGRESSIONS=0_CONFIRMED_NEW_GAMEPLAY_REGRESSIONS
PERFORMANCE_DELTA=BOUNDED_MEASUREMENTS_RECORDED; FULL_HISTORY_SCALING_OPEN
SOURCE_REPRODUCIBILITY=NEW_SOURCE_MODULES_REPRODUCIBLE; ORIGINAL_BUNDLE_BUILD_MISSING
GOLDEN_HASH_STATUS=UNCHANGED_FAILURES; OWNER_RELEASE_REVIEW_REQUIRED
SECURITY_OWNER_GATES=URGENT_REVOKE_ROTATE_HISTORY_AND_POST_VERIFY_PENDING
UNRESOLVED_BLOCKERS=LIVE_PORT_EFFECTS_AID_CALLBACK_PHP_PROTOCOL_V4_MIGRATION_HISTORY_OWNER_GATES_GLTF_THREE
NEXT_MILESTONE=ZGE_06_SOURCE_PORT_DURABLE_SERVER_AND_HISTORY_SCALING
GO_NO_GO=GO_INDEPENDENT_DEVELOPMENT; NO_GO_LIVE_TRANSFER_OR_PRODUCTION_RELEASE
```
