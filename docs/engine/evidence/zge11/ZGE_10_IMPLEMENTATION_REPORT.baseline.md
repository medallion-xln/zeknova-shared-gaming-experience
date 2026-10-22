# ZGE-10 implementation report

2026-10-21 · bounded SDK/editor foundation and local sustained operations PASS

The engine now has an installable public SDK, a functional local browser Studio, and an independent Orbital Outpost project. Developers can open a project, select a rendered entity, edit its transform with pointer handles or numeric controls, add/delete prefabs, save/reload, undo/redo, review a mock AI diff, and run an isolated simulation without loading the original game bundle. PHP/SQLite remains the sole durable staging gameplay writer. Live ZekNova stays LEGACY; production remains NO-GO.

Run `npm run dev:studio` and open [Studio](http://127.0.0.1:8800/examples/studio/) or [Orbital Outpost](http://127.0.0.1:8800/examples/orbital-outpost/). `npm run build:sdk` produces public package exports; `npm pack ./packages/sdk` creates the independent consumer artifact. The local editor server is available on 8800; the existing developer world service on 8799 was preserved. No daemon was installed.

## Source custody and baseline

Baseline HEAD is `138220f4909b3fd6a3e0dd2e62ebab63785336d7`, branch main, 7518 Git-visible file fingerprints. Baseline recheck passed 251/251 engine and 83/86 legacy. Existing dirty source, bundles, nested stable-fast-3d, ignored private state and golden assertions are preserved. The same three legacy failures remain renderer ownership, runtime graphics context and runtime reconstruction, caused by the pre-existing bundle/golden mismatch. No golden re-pin, minified bundle edit, commit, production change or credential disclosure/rotation occurred.

Final inventory compares against that baseline, identifies intentional modifications and hashes artifacts. SDK/application work was performed in this chat; no additional agent delegation was started. Safe executable/PID/cwd inspection and custody comparison found no unexplained source writer. Existing services and test-owned processes were distinguished; test fixtures stopped their own stacks after measurement.

## Delivered interfaces

`@zge/sdk` owns game-agnostic project/scene/component/entity/transform/prefab/asset-ID contracts, optimistic atomic authoring transactions, monotonic revisions, bounded undo/redo, detached inspection and mock proposal review. It composes the existing kernel/system/clock/plugin/event/metrics and parsed-asset ownership implementation. Its public core export has no Three, gameplay or SQL dependency; its renderer adapter requires a host-injected shared Three namespace. Trusted local plugins are not an adversarial sandbox. [Public specification](PUBLIC_SDK_SPECIFICATION.md), [transactions](EDITOR_TRANSACTION_CONTRACT.md), [source/assets](SOURCE_AND_ASSET_LIFECYCLE.md).

Studio separates authoritative authoring data, selection, temporary pointer manipulation, pending proposal, committed history, simulation and presentation. Physical X/Z handle drags commit one validated transform at release. Numeric position/rotation/positive scale editing, primitive/prefab creation/deletion, local browser save/reload, JSON import/export and undo/redo work. Invalid project open or scene edit preserves prior data. World, Simulate and Render workspaces are functional; Play opens the sample. No fake Logic graph or live publishing path exists. [Design](EDITOR_DESIGN_SYSTEM.md), [visual certification](VISUAL_EDITOR_CERTIFICATION.md).

Simulation creates a separate engine/scene with its own fixed-step lifecycle. Play/pause/step/reset, running-entity inspection, actual FPS/frame timing, systems and filterable authoritative/visualization events work. Private player/team/AI inspection requires named authorization; no AI telemetry is invented when the project exposes none. The deterministic mock provider produces typed versioned plans/changesets and read-only JSON/wireframe diff previews. Approval explicitly revalidates and commits with provenance; rejection and undo are tested. [AI protocol](AI_CHANGESET_PROTOCOL.md).

Orbital Outpost imports only public SDK exports and its own rules/manifest. Its explorer moves/collides, collects a resource, builds an antenna and completes an objective; state saves/restores. Studio edits this project and runs the edited scene in isolation. This is a tiny reusable-SDK integration, not full independent second-game release certification. [Independent project](INDEPENDENT_PROJECT_CERTIFICATION.md).

## Verification and operations

Final full engine suite: **263/263**. Legacy: **83/86**, same three golden failures. All nine existing browser regression scripts pass. The new browser certificate runs both WebGPU and WebGL through real viewport selection and X/Z pointer manipulation, numeric edits, atomic rejection, prefab operations, save/reload across page reload, undo/redo, all mock diff types, approval/rejection/provenance, isolated simulation, event filtering, panel resizing, project open/import failure preservation and independent keyboard movement/collection/build objective. A separate unavailable-WebGPU test verifies automatic WebGL fallback. Request inventories exclude private source and the legacy bundle. Screenshot evidence is retained.

The clean source-only build captures 22 readable SDK/dependency/test/project files, performs offline clean npm ci, two identical ESM builds, two identical package tarballs, packed public installation and 11/11 original SDK tests plus consumer smoke. The existing authority capture also passes 79 files /64 selected tests /19 PHP syntax checks. Source/animation checks pass. Original-game reproducibility and embedded legacy Three duplication remain unresolved.

The longer complete managed soak ran **900.000795s / 5940 actual HTTP**, eight identities/gateways, one persistent executor, 4599 successful commands, 180 expected gameplay rejections, zero throttle/transport errors/restarts. E2E p50/p95/p99: **17.75/31.84/79.96ms**. Full read-only archive audit exactly matched 4787 commands, 14910 events, every receipt/claim and complete final snapshot. Player XP, team reward and resource invariants passed. [Sustained operations](SUSTAINED_OPERATIONS_ZGE_10.md).

The original synchronous sampler reproduced the old p99 artifact at 483.63ms. Asynchronous sampling removes its request-loop blocking, while remaining actual server outliers include COMMIT 488.63ms and databaseOpen 402.89ms. Their underlying host/storage cause is unproven. Aggregate RSS fell 114.625MiB with a -3.963MiB/min tail, but worker used-heap tail was +0.398MiB/min; GC and heap-capacity growth are measured. FD 224→224 peak230 and one worker are bounded observations. **Leak freedom, a population limit and production SLA are not established.** [Investigation](LATENCY_MEMORY_INVESTIGATION.md).

Existing fencing, auth, quota/fairness, disconnection, launcher recovery, DB identity, replay, backup/restore and SQLite failure tests pass. Outermost monitor SIGKILL still requires explicit restart; no self-supervising OS service is claimed. Historical real-volume ENOSPC evidence is retained from 09; this milestone reruns handling tests without refilling a volume.

## Retained diagnostics and remaining gates

Evidence retains initial Node public-import failure before workspace installation, over-counted undo history, the missing hierarchy timeline event, the canonical Three import rejection and its injected-namespace fix, an objective key fixture released before a fixed step, fractional gizmo coordinates rejected by native numeric step validation and corrected to finite arbitrary precision, and source capture refusal of a nonprivate parent. Assertions/goldens were not relaxed. Final passes are identified by the manifest.

SDK schema evolution/types/reflection, richer camera/components/assets/editor workflows, externally authored game validation and allocation-root/longer remote operations remain next work. Live writer disablement, aid callback, full repair/relocation/damage/economy/campaign/V4 parity, original source provenance, asset lifecycle/licensing, production identity/TLS/operational policy and owner release approval remain open. Provider/collector credential rotation and post-rotation verification remain mandatory owner-controlled gates and were not performed. Neural inference stays mock-only with native fallback. See [ZGE-11 prompt](ZGE_11_IMPLEMENTATION_PROMPT.md).

## Requested result record

```text
=== ZGE-10 SDK AND EDITOR FOUNDATION ===

STATUS=PASS_BOUNDED_LOCAL_SDK_EDITOR_AND_STAGING
HEAD=138220f4909b3fd6a3e0dd2e62ebab63785336d7
FILES_CREATED=167
FILES_MODIFIED=6
CONCURRENT_WRITER_DETECTED=NO_UNEXPLAINED_SOURCE_WRITES
PUBLIC_SDK=PASS_INSTALLABLE_@zge/sdk_PREVIEW10
CLEAN_IMPORT_BOUNDARY=PASS_PUBLIC_EXPORTS_NO_PRIVATE_OR_LEGACY_IMPORTS
SECOND_INDEPENDENT_PROJECT=PASS_ORBITAL_OUTPOST_BOUNDED_INTEGRATION
GAME_AGNOSTIC_CONTRACTS=PASS_VERSIONED_LOCAL_PREVIEW
EDITOR_APPLICATION=PASS_LOCAL_STUDIO_PORT_8800
PROJECT_BROWSER=PASS_LOCAL_PROJECT_PICKER_AND_JSON_IMPORT
SCENE_VIEWPORT=PASS_3D_POINTER_SELECTION
ENTITY_HIERARCHY=PASS
COMPONENT_INSPECTOR=PASS_DETACHED_PERMISSION_FILTERED
TRANSFORM_EDITING=PASS_XZ_POINTER_GIZMOS_AND_NUMERIC_XYZ_ROTATION_SCALE
PREFABS=PASS_PROCEDURAL_CRATE
SCENE_SAVE_RELOAD=PASS_LOCAL_STORAGE_AND_JSON
UNDO_REDO=PASS_ATOMIC_LOCAL_TRANSACTIONS
SIMULATION_INSPECTOR=PASS_ISOLATED_PLAY_PAUSE_STEP_RESET
EVENT_TIMELINE=PASS_FILTERED_LOCAL_AUTHORITATIVE_AND_VISUALIZATION
AI_CHANGESET_PREVIEW=PASS_DETERMINISTIC_MOCK_ONLY
AI_AUTHORITY_BOUNDARY=PASS_EXPLICIT_APPROVAL_NO_LIVE_WRITE_PATH
WEBGPU=PASS_STUDIO_OUTPOST_AND_LEGACY
WEBGL=PASS_EXPLICIT_AND_GPU_UNAVAILABLE_AUTO_FALLBACK
NEURAL_FALLBACK=PASS_EXISTING_NATIVE_REFERENCE_MOCK_ONLY
SUSTAINED_SOAK_DURATION=900.000795_SECONDS
SOAK_REQUEST_COUNT=5940_HTTP_4599_SUCCESSFUL_COMMANDS_180_GAMEPLAY_REJECTIONS
P50_MS=17.75
P95_MS=31.84
P99_MS=79.96
P99_OUTLIER_CAUSE=OLD_SYNC_SAMPLER_BLOCKING_REPRODUCED;_REMAINING_COMMIT_DB_OPEN_SPIKES_UNATTRIBUTED
MEMORY_GROWTH=AGGREGATE_RSS_-114.625_MIB;_WORKER_HEAP_7.13_TO_21.86_MIB
MEMORY_TAIL_SLOPE=RSS_-3.963_MIB_MIN;_WORKER_USED_HEAP_+0.398_MIB_MIN
RESOURCE_LEAK_STATUS=NOT_ESTABLISHED;_FD_224_TO_224_PEAK_230;_ONE_WORKER
SUPERVISOR_RECOVERY=PASS_OWNED_LAUNCHER;_OUTERMOST_MONITOR_MANUAL_RESTART
SINGLE_WRITER=PASS_PHP_SQLITE_UNCHANGED
PLAYER_PROGRESS=PASS_PERSONAL_XP_AND_ATOMIC_TEAM_CLAIMS
MULTIPLAYER_CONVERGENCE=PASS_BROWSER_AND_EXACT_4787_COMMAND_14910_EVENT_ARCHIVE
BACKUP_RESTORE=PASS_EXISTING_ISOLATED_REGRESSION
SDK_TESTS=11/11_PUBLIC_AND_CLEAN_INSTALLED_PACKAGE
EDITOR_BROWSER_TESTS=PASS_WEBGPU_WEBGL_REAL_POINTER_XZ_AND_AUTO_FALLBACK
ENGINE_TESTS=263/263
LEGACY_TESTS=83/86_SAME_3_GOLDEN_FAILURES
NEW_REGRESSIONS=NONE_FINAL_DIAGNOSTICS_RETAINED
SOURCE_REPRODUCIBILITY=PASS_22_FILE_SDK_CLEAN_BUILD_PLUS_79_FILE_64_TEST_AUTHORITY_CAPTURE;_ORIGINAL_GAME_UNAVAILABLE
LIVE_LEGACY_AUTHORITY=LEGACY
CREDENTIAL_ROTATION_STATUS=OWNER_MANAGED_NOT_PERFORMED
PRODUCTION_SECURITY_GATES=BLOCKED_ROTATION_POST_ROTATION_IDENTITY_TLS_OWNER_RELEASE
UNRESOLVED_BLOCKERS=HEAP_RETENTION_AND_SERVER_TAIL_ATTRIBUTION;_LIVE_WRITER_AID_V4_PARITY;_ORIGINAL_SOURCE_ASSETS;_PRODUCTION_GATES
NEXT_MILESTONE=ZGE_11_SDK_EDITOR_HARDENING_AND_LONGER_INDEPENDENT_VALIDATION
GO_NO_GO=GO_BOUNDED_LOCAL_PREVIEW;_NO_GO_LIVE_TRANSFER_OR_PRODUCTION
```
