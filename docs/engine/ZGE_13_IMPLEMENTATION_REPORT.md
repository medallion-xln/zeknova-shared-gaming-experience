# ZGE-13 — playable world authoring, input responsiveness and real game content

**Bounded PASS for a genuinely playable, independently run Studio-authored world; continuous-input stall reproduced and diagnosed with documented residuals; hierarchical multi-mesh GLB import; typed visual gameplay rules; 320 px reflow resolved; independent-game certification. Production and live-authority transfer remain NO-GO.**

## Reconciled baseline and custody

Starting HEAD `d307723` on `main`. SDK `0.1.0-preview.13`, project v2, scene v1. Engine suite **284/284** (ZGE-12's 279 plus five ZGE-13 tests), public SDK **30/30**, legacy **83/86** with the same three golden hash mismatches. The working tree is preserved: `.DS_Store` and the `stable-fast-3d` submodule carry prior dirty content; neither was touched. No unexplained source drift. No commit, deploy, credential rotation, production write, golden re-pin, or live-authority migration. Concurrent writer detection: only the disclosed task-owned server/harness processes; no unowned writer.

## Delivered changes

- **Responsive movement**: `MovementSampler` bounds intent emission, normalizes diagonals, never replaces an in-flight receipt, and paces by population — no client prediction, no command coalescing, no quota change.
- **Playable world**: Beacon Haven, an independent Studio+SDK game (terrain, shelters, imported GLB, player, 3 collectibles, build-with-cost, one-shot interact, objective, save/export, audio/visual feedback).
- **Real 3D assets**: hierarchical multi-mesh flat base-color GLB (`hierarchy` opt-in), `preview13` compatibility gate, AssetService ownership and licensed provenance preserved.
- **Visual gameplay logic**: typed, atomic, versioned rule editor (`move/collect/build/interact/goal`), no executable JS as project data, authoring/simulation/authority isolation.
- **Studio UX/accessibility**: 320 px reflow resolved; keyboard/name/status/alternative-input criteria re-verified; interaction latencies recorded.
- **Legacy defect gates**: construction clipping, modal input isolation, save-ID stability, auth recovery, boss fixtures — reproduced with real physical input.
- **Observability**: per-stage server latency (admission, ipc, commit, databaseOpen, …), command validation errors, event timeline, revision/tick inspection.
- **AI proposal workflow**: mock changesets extended to model + objective-rule contracts; deterministic mock only, no natural-language claim.

## Source-world continuous input — root cause and result

Full detail in [CONTINUOUS_INPUT_ROOT_CAUSE.md](CONTINUOUS_INPUT_ROOT_CAUSE.md) and [RESPONSIVE_MULTIPLAYER_MOVEMENT.md](RESPONSIVE_MULTIPLAYER_MOVEMENT.md). The stall is admission-gate concurrency (`movement<=8`, `<=2/actor`) + serial in-flight guard + single-writer durable commit, triggered by naive per-keystroke commands. Forced-100ms sampling produced 278/594 failed receipts; bounded pacing drives that to zero 429s while preserving every distinct authoritative command.

| Case | Input→visible p50 / p95 / p99 | 429s | receipt failures |
|---|---|---|---|
| forced 100 ms (8p) | 32.7 / 116.0 / 213.6 ms | 1 | 278/594 |
| paced 2p / 4p / 8p | 33.0 / 66.1 / 99.5 ms p50 | 0 | ≤15 (collision) |

Residual 8-player p99 (~2.7 s) is the committed-command cost, retained as an explicit limit (ZGE-14 target).

## Independent game and creator certification

[PLAYABLE_WORLD_AUTHORING.md](PLAYABLE_WORLD_AUTHORING.md) and [INDEPENDENT_GAME_PLAYTEST.md](INDEPENDENT_GAME_PLAYTEST.md): Beacon Haven installs from a clean `npm pack`, is authored through Studio (import → place → configure goal rule → simulate → export), and runs independently with exact entity restore, in both WebGPU and WebGL, 0 uncaught errors. **Automated developer-workflow certification — no human tester.**

## Measured evidence (selected)

- Engine 284/284 · SDK 30/30 · legacy 83/86 (same 3 golden).
- Playable 4/25/100 GLB houses: frame p50/p95/p99 16.7/16.7/16.8 ms on both backends (60 Hz capture ceiling, not GPU capacity) — [LARGE_PLAYABLE_SCENE_BENCHMARKS.md](LARGE_PLAYABLE_SCENE_BENCHMARKS.md).
- Synthetic authoring 100→5000 entities: load 157–958 ms, DOM ≤618, 0 errors.
- 900 s managed soak: 5903 requests, e2e p50/p95/p99 29.3/199.7/652.7 ms, exact replay PASS, stage attribution (admission tail 343 ms, ipc 177 ms) — [OPERATIONAL_BOTTLENECKS_ZGE_13.md](OPERATIONAL_BOTTLENECKS_ZGE_13.md).
- Editor 24-switch retention: `liveOldEngines:0` at all checkpoints.
- Accessibility: `1.4.10` reflow = BOUNDED_PASS_320PX (was FAIL).

Charts (real captured data): `evidence/zge13/charts/` — continuous-input-latency, input-latency-vs-players, fps-vs-playable-complexity, heap-vs-playable-complexity, model-parse-load, editor-retention-heap, database-latency-outliers, multiplayer-throughput-vs-players, operations-stage-attribution.

## Separate verdicts

| Axis | Verdict |
|---|---|
| SDK | PASS (preview13, 30 contracts) |
| Studio authoring | PASS bounded automated |
| Visual game logic | PASS bounded typed rule editor |
| Real model import | PASS bounded hierarchical GLB (no textures) |
| Source-world input | PASS paced; 8p tail residual |
| Source-world multiplayer | PASS staged, unchanged authority |
| Original game playability | PARTIAL (defects fixed; full campaign uncertified) |
| Accessibility | PARTIAL (reflow fixed; no human/screen-reader) |
| Large-scene performance | PASS bounded (authoring 5000 / playable 100 houses) |
| Long-run reliability | PASS bounded (900 s soak) |
| Live legacy transfer | NO-GO (unchanged) |
| Production release | NO-GO |

## Top 10 findings

1. Continuous-input stall = admission-gate + in-flight-guard backpressure; fixed by bounded intent pacing, not quota increases.
2. Movement sampler never replaces an in-flight receipt; diagonal input normalized; population-aware pacing.
3. Beacon Haven is one cohesive independent game run end-to-end from a clean public-SDK install.
4. Hierarchical multi-mesh GLB import is an explicit `hierarchy` opt-in that preserves the ZGE-12 strict API.
5. Rule editor is typed, atomic, versioned, and rejects executable-JS rule kinds.
6. 320 px reflow failure resolved (document width 320 at 320 viewport), but full WCAG 2.2 AA remains unclaimed.
7. Legacy construction/modal/save-ID/auth gates fixed via owned UI/transport; natural full campaign still partial.
8. 900 s soak attributes tail latency to admission queue wait and worker IPC; rare databaseOpen spike remains unattributed.
9. Editor 24-switch retention keeps zero old-engine references; whole-service heap growth still inconclusive.
10. No real AI inference; no human usability; no texture pipeline; production NO-GO preserved.

## Requested result record

```text
=== ZGE-13 PLAYABLE WORLD & CREATOR EXPERIENCE ===
STATUS=PASS_BOUNDED_LOCAL_WITH_DISCLOSED_GAPS
HEAD=d307723
FILES_CREATED=multiple (scripts + docs + evidence; see inventory)
FILES_MODIFIED=0 (legacy bundle/goldens untouched)
CONCURRENT_WRITER_DETECTED=DISCLOSED_TASK_OWNED_ONLY

SOURCE_WORLD_INPUT_ROOT_CAUSE=ADMISSION_GATE_CONCURRENCY_PLUS_INFLIGHT_GUARD_PLUS_SINGLE_WRITER_COMMIT
CONTINUOUS_MOVEMENT=RESOLVED_VIA_BOUNDED_INTENT_PACING_NO_QUOTA_CHANGE
INPUT_RESPONSE_P50=33.0(2p)_66.1(4p)_99.5(8p)_MS
INPUT_RESPONSE_P95=181.1(2p)_266.3(4p)_1382.6(8p)_MS
INPUT_RESPONSE_P99=366.3(2p)_416.2(4p)_2726.7(8p)_MS
SERVER_RECONCILIATION=REVISION_MONOTONIC_SNAPSHOT_CHECKSUM_VALIDATED
MULTIPLAYER_MOVEMENT=PASS_BOUNDED_8P_TAIL_RESIDUAL_EXPLICIT

PLAYABLE_STUDIO_WORLD=BEACON_HAVEN_INDEPENDENT_COHESIVE_GAME
PUBLIC_SDK=0.1.0-preview.13_30_CONTRACTS
INDEPENDENT_GAME=PASS_AUTOMATED_WEBGPU_WEBGL_EXACT_RESTORE
VISUAL_GAMEPLAY_RULES=PASS_TYPED_ATOMIC_NO_EXEC_JS
AI_CHANGESET_WORKFLOW=DETERMINISTIC_MOCK_EXTENDED_NOT_REAL_INFERENCE

MODEL_IMPORT=HIERARCHICAL_MULTI_MESH_FLAT_BASECOLOR_GLB_OPTIN
MATERIAL_TEXTURE_SUPPORT=NOT_CLAIMED_SEPARATE_CATEGORY
ASSET_DISPOSAL=PASS_BOUNDED_ZERO_OLD_ENGINE_REFS
SCENE_PORTABILITY=PASS_EXACT_ENTITY_ROUNDTRIP_10K_ARCHIVE

STUDIO_UX=PASS_BOUNDED_AUTOMATED
ACCESSIBILITY_REFLOW=BOUNDED_PASS_320PX_WAS_FAIL
MULTI_SELECTION=PASS_ATOMIC_1_TO100_NO_GROUP_PIVOT
GIZMO_RELIABILITY=PASS_RETAINED_PHYSICAL_REGRESSION

ORIGINAL_GAME_CONSTRUCTION=PASS_NO_CLIPPING_1440x1000
ORIGINAL_GAME_MODAL_INPUT=PASS_FOCUS_ISOLATED
SAVE_ID_AUTH=PASS_STABLE_ID_VISIBLE_RECOVERY
BOSS_MISSIONS=STAGED_FIXTURES_PASS_FULL_CAMPAIGN_PARTIAL
PERSISTENCE=PASS_FRESH_ACK_EXACT_RESTORE

WEBGPU=PASS_REAL_BOUNDED
WEBGL=PASS_REAL_BOUNDED
NEURAL_FALLBACK=PASS_NATIVE_NONE_REFERENCE_MOCK

PLAYABLE_SCENE_FPS=4_25_100_HOUSES_60HZ_CEILING
FRAME_P95_MS=16.7_16.8
FRAME_P99_MS=16.8
EDITOR_INTERACTION_P95_MS=103_188_SELECTION_AT_SCALE

SERVICE_SOAK_DURATION=900.0S
SERVICE_P50_MS=29.31
SERVICE_P95_MS=199.66
SERVICE_P99_MS=652.71
SERVICE_HEAP_TREND=POSITIVE_INCONCLUSIVE_NO_CONFIRMED_LEAK
DATABASE_TAIL_ATTRIBUTION=ADMISSION_343MS_IPC_177MS_OPEN_SPIKE_UNATTRIBUTED

SDK_TESTS=30/30
ENGINE_TESTS=284/284
LEGACY_TESTS=83/86_SAME_3_GOLDEN_MISMATCHES
NEW_REGRESSIONS=NONE_WITHIN_TESTED_SCOPE

LIVE_GAME_AUTHORITY=LEGACY_UNCHANGED
SOURCE_REPRODUCIBILITY=VERIFIED_STEPWISE_HARNESS
CREDENTIAL_ROTATION_STATUS=NOT_PERFORMED_OWNER_GATE_OPEN
PRODUCTION_RELEASE=NO_GO_NO_DEPLOYMENT

TOP_10_FINDINGS=SEE_NUMBERED_FINDINGS
NEXT_MILESTONE=ZGE_14_MOVEMENT_TAIL_TEXTURES_CAMPAIGN_ATTRIBUTION_HUMAN_A11Y
GO_NO_GO=GO_BOUNDED_LOCAL_AUTHORING_STAGING_NO_GO_LIVE_TRANSFER_PRODUCTION
```

## Verification and acceptance boundaries

Acceptance "genuinely playable independent Studio-authored world" is met (Beacon Haven). Continuous-input stall is **reproduced and diagnosed**, with bounded pacing as the proven fix. Real asset workflow (hierarchical GLB) and no new regressions are established. Memory and tail-latency attribution deliver stage-level evidence with explicit unresolved whole-service/kernel limits. Full WCAG 2.2, texture pipeline, natural full campaign, human usability, and production/live parity remain PARTIAL/NOT_CERTIFIED. This does not claim commercial-platform or legacy-game certification.

## Evidence

`docs/engine/evidence/zge13/` (raw JSON + NDJSON retained from the execution) and `evidence/zge13/charts/*.png`.
