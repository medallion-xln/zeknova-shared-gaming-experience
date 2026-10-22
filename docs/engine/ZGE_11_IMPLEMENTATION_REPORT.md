# ZGE-11 implementation report

2026-10-21 · bounded SDK and professional Studio hardening

ZekNova Studio now supports a complete local developer workflow: create/open a project, navigate its 3D world, manipulate entities with real three-axis controls, edit reflected components, manage JSON assets and prefabs, simulate, save/export, reopen in a clean browser context, and run the edited project independently. The public SDK has packaged TypeScript declarations, versioned project migration and typed validation errors. Live ZekNova remains LEGACY-authoritative and production remains NO-GO.

[Studio](http://127.0.0.1:8800/examples/studio/) is served locally on 8800. [Signal Garden](http://127.0.0.1:8801/) runs from the separate workspace `/Users/dwaynecampbell/Desktop/zge11-signal-garden`, using an installed public SDK tarball. Its own README explains testing, typechecking and startup. Both are foreground local developer servers; no production service or OS daemon was installed.

## Baseline and custody

HEAD remains `138220f4909b3fd6a3e0dd2e62ebab63785336d7`, branch main. Starting tests were 263/263 engine and 83/86 legacy with the same three historical golden failures. Git-visible file hashes, source status and safe executable/PID/cwd inspection recorded the existing dirty tree and running services. Intentional new work is separately inventoried; old bundles, golden assertions, prior evidence, source changes and nested stable-fast-3d are preserved. No commit, deployment, production database/credential change or new agent delegation occurred. Existing staging service ownership on 8799 was retained; test stacks used private disposable fixtures.

The attached request expands the repository's ZGE-11 plan with full camera/gizmo interaction, reflected schemas, portable project files, a truly separate consumer and class-level retention investigation. Those features were implemented within local authoring/staging boundaries. This does not claim a full commercial editor, adversarial plugin sandbox or complete live-game port.

## SDK and portable data

`@zge/sdk` is `0.1.0-preview.11` with public core/render declarations. A strict TypeScript 6.0.3 consumer imports both package exports after fresh packed installation, including negative renderer/vector assertions. Existing v1 project input migrates to explicit v2 compatibility/metadata/schema/provenance; scenes remain v1. Known older files roundtrip; future requirements fail with SDKError codes. Finite JSON normalizes negative zero, semantic no-ops do not dirty history, revisions stay monotonic and failed batches stay atomic.

Public metadata supports number, boolean, string, enum, vector, asset and entity fields. Studio consumes it for controls; permission/readOnly restrictions apply through filtered inspection and `editProperties`. Rename/duplicate, hierarchy references/cycle checks, stable prefab identity/overrides, asset references, bounded history and lifecycle diagnostics are public. Plugin cleanup runs before shared asset disposal and repeated dispose is idempotent. Plugins/function validators remain trusted code, explicitly registered rather than serialized/evaluated.

Portable v2 exports include current scenes, definitions, asset data/references/provenance/licenses, prefabs and rule/plugin dependencies. Data-only move/collect/goal rules have a bounded interpreter; unknown executable plugin dependencies block Studio simulation. JSON assets use existing AssetService coalescing/clones/watchdogs, bounded import/network parsing and SHA validation. Imported rights default to unknown. There is no competing asset system or arbitrary filesystem/HTTP writer.

See [SDK vNext](PUBLIC_SDK_VNEXT.md), [reflection](COMPONENT_SCHEMA_REFLECTION.md), [portable format](PORTABLE_PROJECT_FORMAT.md), [assets/prefabs](ASSET_PREFAB_CERTIFICATION.md) and the executable quickstart in `packages/sdk/README.md`.

## Studio and independent consumer

The viewport reuses host-injected Three OrbitControls/TransformControls. Camera orbit/pan/zoom/focus/reset, perspective/orthographic view, world/local transform mode, X/Y/Z translation, rotation, scaling, grid/snapping and resized picking work. Object dragging disables camera navigation; temporary presentation stays separate from authoring truth. Escape restores the exact original scene/revision. Numeric alternatives, atomic multi-property updates and undo/redo remain available.

Hierarchy search/groups/parent-child presentation, rename/duplicate/context actions, hidden/locked state and subtree confirmation are implemented. JSON asset search/preview/reference tracking/drop, prefab creation/instantiation/overrides and missing-resource feedback work. Complete project save/export/import, saved/unsaved indication and recoverable browser-local drafts support longer editing sessions. Reflected unsupported fields remain read-only rather than pretending arbitrary editors exist.

Simulation has its own engine/scene, tick/revision, systems, metrics and filtered events with entity navigation. Player/team/private metadata is permission-filtered. Mock AI proposals retain structured plans, spatial/data diffs, dependency warnings, explicit approve/reject, stale conflict checks, provenance and undo. No real language inference or autonomous/live authority is introduced.

Signal Garden was created and installed outside the monorepo. Its custom schemas/rules, movement/collection/objective, verified palette and persistence use only public SDK interfaces. A browser opens it in Studio, edits custom properties, simulates without changing authoring data, exports and runs that edited world in the independent host. A second fresh external installation repeats game tests and strict typechecking. This is agent-driven external integration, not a claim of independent human validation or a finished commercial game.

See [interactions](PROFESSIONAL_STUDIO_INTERACTIONS.md), [UX certificate](STUDIO_UX_CERTIFICATION.md), [external consumer](EXTERNAL_CONSUMER_VALIDATION.md) and [editor memory](EDITOR_MEMORY_LIFECYCLE.md).

## Verification and operations

The final manifest identifies the full engine/legacy runs, all nine retained browser regression scripts, new physical WebGPU/WebGL sessions, public SDK tests, clean source/package build, external strict types/runtime tests and executed documentation example. The clean build captures 27 readable source/declaration/test/project files, builds identical public ESM twice, compares packed bytes and executes the installed public tests without the original game. The established authority capture also repeats 79 files / 64 selected tests / 19 PHP syntax checks. Original-game source reproduction and embedded legacy Three duplication remain open.

New browser sessions certify real X/Y/Z/rotate/scale/camera interactions, cancellation, hierarchy/reflection, native asset drag/drop, complete export into a fresh context, independent edited-world execution and isolated simulation. Sixteen project switches per backend keep two scene listeners, zero active asset leases/pending work and stable observed helper/scene geometries. A separate keyboard/draft/text-size check recovers unsaved edits, retains separator focus and reports no horizontal overflow at the tested 16px root text size. These are bounded observations, not a WCAG audit or indefinite GPU leak proof.

The longer complete-service soak ran **1200.167452 seconds / 7921 HTTP requests**, with 6129 successful commands, 241 gameplay rejections, zero transport failures/restarts and one admission-busy429. Its original command ID retried and committed once. Exact full archive replay matched **6378 commands / 19861 events**, receipts/claims and the complete snapshot. E2E p50/p95/p99 were **19.78/38.15/121.42 ms**. Existing auth/quota/fairness/fencing/recovery/backup/SQLite failure invariants remain active.

Corrected isolated heap snapshots show one evaluator/runtime/journal and stable array/map/set counts through 9000 moves, disappearing after disposal; dominant measured growth is compiled-code self size, not growing runtime object counts. Sustained worker used-heap tail remains **+0.340 MiB/min**. Its largest worker/IPC stall coincides with about395ms cumulative GC-duration growth in a coarse sample window; this is partial correlation, not complete root-cause proof. New COMMIT/open maxima are278.07/160.42ms; a separate WAL/FULL idle probe does not reproduce them. Full rare storage/scheduling attribution and leak-free status remain unresolved. [Operational investigation](OPERATIONAL_RELIABILITY_ZGE_11.md).

## Failed attempts and remaining gates

Retained failures include observer table retention in the first heap probe, a collapsed prefab section in the pointer fixture, signed-zero portable comparison, a wrong external addon import, declaration files accidentally passed to Node's runner, and the inherited hierarchy timeline omission corrected while preserving prior tests. No golden/assertion was weakened. Final artifacts distinguish these diagnostics from passing certificates.

Remaining product limits include human usability review, full accessibility coverage, large-scene performance, multi-selection, nested prefab propagation, richer licensed/model import, schema evolution tooling and broader deterministic subsystem replay. Operational dominator/allocation stacks and kernel/storage correlation, longer fixed-state/remote workloads and an outer OS supervisor remain separate work.

Live aid/writer disablement, full repair/relocation/damage/utility/economy/campaign/V4 parity, original source/build provenance, production assets/licensing, identity/TLS/operations and owner release approval remain open. Owner-controlled provider/collector credential rotation and post-rotation verification were not performed and remain mandatory. Neural inference stays optional/mock with native fallback. See [ZGE-12 prompt](ZGE_12_IMPLEMENTATION_PROMPT.md).

## Separate certification levels

| Classification | Result |
|---|---|
| SDK_PASS | PASS —269/269 total engine,17 public SDK cases, strict packed TypeScript and clean build |
| EXTERNAL_CONSUMER_PASS | PASS —separate Desktop workspace plus fresh consumer install |
| STUDIO_VISUAL_PASS | PASS —real pointer/keyboard WebGPU and WebGL sessions |
| PROJECT_PORTABILITY_PASS | PASS —complete export, fresh-context import and edited independent runtime |
| EDITOR_MEMORY_PASS | PASS_BOUNDED —16 switches/backend, stable observed listeners/assets/geometries |
| GAMEPLAY_REGRESSION_PASS | PASS_BOUNDED —83/86 legacy, unchanged three golden failures; nine browser regressions |
| STAGING_OPERATIONS_PASS | PASS_BOUNDED_WITH_BACKPRESSURE —20 minutes, one retried429, exact full archive |
| LIVE_ZEKNOVA_TRANSFER | NOT_PERFORMED —LEGACY retained |
| PRODUCTION_RELEASE | NO-GO —security, source/assets, parity and owner gates remain |

## Requested result record

```text
=== ZGE-11 SDK AND STUDIO HARDENING ===

STATUS=PASS_BOUNDED_LOCAL_DEVELOPER_PREVIEW
HEAD=138220f4909b3fd6a3e0dd2e62ebab63785336d7
FILES_CREATED=170
FILES_MODIFIED=17
CONCURRENT_WRITER_DETECTED=NO_UNEXPLAINED_SOURCE_WRITES
PUBLIC_SDK=PASS_0.1.0_PREVIEW_11_PACKED_PUBLIC_EXPORTS
TYPESCRIPT_DECLARATIONS=PASS_STRICT_FRESH_INSTALLED_CONSUMER
SCHEMA_EVOLUTION=PASS_V1_PROJECT_TO_V2;_SCENE_V1_RETAINED
COMPONENT_REFLECTION=PASS_SEVEN_FIELD_TYPES_AND_PERMISSION_READONLY_POLICY
EXTERNAL_CONSUMER=PASS_SIGNAL_GARDEN_OUTSIDE_MONOREPO_AND_FRESH_INSTALL
STUDIO_WORLD_WORKSPACE=PASS_LOCAL_AUTHORING
CAMERA_CONTROLS=PASS_ORBIT_PAN_ZOOM_FOCUS_RESET_PERSPECTIVE_ORTHOGRAPHIC
THREE_AXIS_GIZMOS=PASS_XYZ_TRANSLATE_ROTATE_SCALE_LOCAL_WORLD_SNAP_CANCEL
HIERARCHY_WORKFLOWS=PASS_SEARCH_GROUP_PARENT_RENAME_DUPLICATE_CONTEXT_HIDE_LOCK
INSPECTOR_WORKFLOWS=PASS_SCHEMA_DERIVED_ATOMIC_VALIDATION
ASSET_BROWSER=PASS_BOUNDED_DATA_ONLY_JSON_IMPORT_PREVIEW_DROP_REFERENCES
PREFAB_OVERRIDES=PASS_STABLE_ID_DETACHED_INSTANCES
PROJECT_SAVE_EXPORT_IMPORT=PASS_COMPLETE_PORTABLE_PROJECT_AND_RECOVERABLE_DRAFT
UNDO_REDO=PASS_BOUNDED_ATOMIC_NOOP_AND_REVISION_CONFLICTS
SIMULATION_DEBUGGER=PASS_ISOLATED_TICK_REVISION_COMPONENTS_SYSTEMS_EVENTS_METRICS
AI_CHANGESET_REVIEW=PASS_MOCK_PLAN_SPATIAL_DIFF_WARNINGS_APPROVAL_PROVENANCE_UNDO
AI_AUTHORITY_BOUNDARY=NO_AUTONOMOUS_OR_LIVE_WRITE_PATH
WEBGPU=PASS
WEBGL_FALLBACK=PASS_EXPLICIT_AND_GPU_UNAVAILABLE
NEURAL_FALLBACK=PASS_EXISTING_NATIVE_REFERENCE_MOCK_ONLY
PROJECT_PORTABILITY=PASS_FRESH_BROWSER_AND_EDITED_INDEPENDENT_RUNTIME
ASSET_LIFECYCLE=PASS_SHARED_PARSED_DATA_DETACHED_STATE_PLUGIN_BEFORE_ASSET_DISPOSAL
EDITOR_RESOURCE_LEAKS=NO_GROWING_OWNERS_OBSERVED_IN_16_SWITCHES_PER_BACKEND;_INDEFINITE_GPU_STABILITY_UNPROVEN
STUDIO_UX_CERTIFICATION=PASS_BOUNDED_PHYSICAL_WORKFLOW;_NOT_FULL_ACCESSIBILITY_AUDIT
LONG_SOAK_DURATION=1200.167452_SECONDS_7921_HTTP;_ONE_RETRIED_ADMISSION_BUSY_429
P50_MS=19.78
P95_MS=38.15
P99_MS=121.42
HEAP_RETENTION_FINDINGS=ISOLATED_CLASSES_STABLE_CODE_SELF_SIZE_GROWTH;_SERVICE_HEAP_TAIL_+0.340_MIB_MIN;_LEAK_FREE_NOT_ESTABLISHED
COMMIT_SPIKE_ATTRIBUTION=NEW_MAX_278.07_MS;_RARE_HOST_STORAGE_CAUSE_UNRESOLVED
DATABASE_OPEN_ATTRIBUTION=NEW_MAX_160.42_MS;_IDLE_PROBE_SMALL;_RARE_CAUSE_UNRESOLVED
SDK_TESTS=17/17_PLUS_STRICT_TYPES_DOCUMENTATION_AND_EXTERNAL_GAME_TEST
EDITOR_BROWSER_TESTS=PASS_WEBGPU_WEBGL_REAL_POINTER_PORTABILITY_AND_BOUNDED_MEMORY
ENGINE_TESTS=269/269
LEGACY_TESTS=83/86_SAME_3_GOLDEN_FAILURES
NEW_REGRESSIONS=NONE_FINAL;_DIAGNOSTICS_RETAINED
LIVE_ZEKNOVA_AUTHORITY=LEGACY
GOLDEN_HASH_STATUS=UNCHANGED_PREEXISTING_MISMATCH;_NO_REPIN
PRODUCTION_SECURITY_GATES=NO_GO_OWNER_ROTATION_POST_ROTATION_IDENTITY_TLS_OPERATIONS_RELEASE
UNRESOLVED_BLOCKERS=HUMAN_ACCESSIBILITY_LARGE_SCENE_MODEL_WORKFLOWS;_HEAP_DOMINATORS_STORAGE_SCHEDULING_ATTRIBUTION;_LIVE_AID_WRITER_V4_SOURCE_ASSET_PRODUCTION_GATES
NEXT_MILESTONE=ZGE_12_DEVELOPER_VALIDATION_AND_DEEPER_RETENTION_EVIDENCE
GO_NO_GO=GO_BOUNDED_LOCAL_PREVIEW_AND_STAGING;_NO_GO_LIVE_TRANSFER_OR_PRODUCTION
```
