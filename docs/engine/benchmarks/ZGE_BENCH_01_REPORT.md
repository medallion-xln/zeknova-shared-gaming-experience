# ZGE-BENCH-01 complete-game certification

**PARTIAL certification; NO-GO for professional gameplay release, live authority transfer or production.** Original movement/combat/harvest, first-boss prerequisite/reward fixtures, save recovery and bounded render paths work. The durable source engine preserves replay/integrity under real faults, but continuous browser input stalls for about20seconds after a quota response. Studio/SDK pass their bounded developer preview. These are separate products and separate verdicts.

This report closes the verification milestone before the user-authorized ZGE12 implementation. Preview11 source fingerprints and captured raw data remain preserved; later SDK/editor improvements do not retroactively change these results.

## Evidence and limits

- Baseline269/269 engine,83/86 legacy with the same three golden failures; no repin. [Baseline](evidence/baseline/results.json).
- Original902.836s timed capture:59.50FPS,32.31FPS1%low, p95/p9916.8ms, max316.7ms.106intervals>33.33ms;36>100ms. Later blocking diplomacy UI makes the first15minute uninterrupted visible-play gate PARTIAL. Pointer-confirmed prefix525.707s. [Gameplay](GAMEPLAY_CERTIFICATION.md), [frames/memory](GRAPHICS_PERFORMANCE.md).
-128actualHTTP200 save acknowledgments in the timed window; network p50/p95/p993.342/8.672/65.487ms excludes debounce. Outbox recovered after36.342s. Lost-ACK retry generates a new operation ID/revision; real401 requires page reload to resume. No duplicated economic claim was observed. [Persistence](PERSISTENCE_RECOVERY.md).
- Natural XP1309,36kills,14trees,5rocks; Highlands and Desert visited. Two staged prerequisites followed by real final placement and full818HP first-boss fights, one same-biome and one cross-biome, retained one reward claim each after reload. All12 natural missions/ranks are not certified. [Boss evidence](BOSS_BATTLE_CERTIFICATION.md).
- Asset audit:311entries,52distinctGLBpaths,no duplicate path in the bounded interval;0watchdogstalls. Historical GLTF root cause unresolved. Five worker instances stay bounded, but heap/renderer estimates, listeners and DOM grow during the long capture; leak freedom is unproven. [Assets](ASSET_LOADING_AUDIT.md), [stability](LONG_RUN_STABILITY.md).
- Source2/4/8 physical contexts and36HTTP conditions retain exact archive audits. Eight-client mixed20s achieves5.100accepted commands/s with19.058/32.534/40.504ms p50/p95/p99. Continuous movement first rate-limits at21.991s, freezes authoritative X for about20s, then naturally recovers; full399-command/1207-event archive matches. [Load](MULTIPLAYER_LOAD_RESULTS.md), [recovery](SOURCE_ENGINE_PERSISTENCE_RECOVERY.md).
- SDK17/17 public tests, strict fresh types, executed docs, reproducible27-file package closure. Both Studio render backends and unavailable-GPU fallback pass. Eight frame trials about60.002FPS; two12-switch lifecycle sequences show bounded ownership. [Studio/SDK](STUDIO_SDK_CERTIFICATION.md).

## Observed judgment

Original game6/10, source engine7/10, bounded source multiplayer experience4/10, Studio developer workflow8/10. These are automated evaluator judgments, not human interviews or fun/audio research. The overall weighted rating is NOT_COMPUTED; eligible multiplayer/Studio categories cover only20% of the requested scope. [Scorecard](PLAYER_EXPERIENCE_SCORECARD.md).

Top10 priorities: (1) continuous input pacing/quota recovery; (2) original construction scrolling/clipped viewport; (3) modal keyboard isolation; (4) stable persisted save intent IDs; (5) visible same-page auth recovery; (6) retained-memory/asset attribution; (7) natural campaign/rank/boss completion; (8) original reproducible source/golden lineage; (9) large-world authoring and independent human/accessibility tests; (10) production identity/TLS, asset rights, operations and owner release gates. See [defects](DEFECT_REGISTER.md) for severity, evidence and concrete follow-ups.

Next: ZGE12 develops local SDK/editor capability and deeper profiling; it does not authorize legacy migration. All aid/writer/V4/economy/health/utility/repair/campaign parity, original source/assets, owner credential rotation and production approval gates remain open.

GO for continued local development. NO-GO for professional original-game certification, live engine authority transfer or production. NoP0 data-loss defect was confirmed. The original viewport and source input stall are P1 findings. Full exact measurements and failure history are in the linked product reports; [reproduction](REPRODUCTION_INSTRUCTIONS.md) states the limits of rerunning this dirty, evolving checkout.

## Requested certification record

```text
=== ZGE-BENCH-01 COMPLETE GAME CERTIFICATION ===

STATUS=PARTIAL_CERTIFICATION_WITH_CONFIRMED_P1_DEFECTS
HEAD=138220f4909b3fd6a3e0dd2e62ebab63785336d7
CONCURRENT_WRITER_DETECTED=AUTHORIZED_TEST_TEAM_ONLY_NO_UNEXPLAINED_BASELINE_DRIFT
HARDWARE=APPLE_M1_PRO_10CPU_16GPU_16GIB
OS=MACOS_26.5.2
BROWSER=CHROME_155.0.8059.85
GPU=APPLE_M1_PRO_16_CORE
RENDERER_MODES_TESTED=WEBGPU_WEBGL_SAFE_AUTO_FALLBACK_REFERENCE_NEURAL_NONE_NEURAL_MOCK
ORIGINAL_GAME_BOOT=PASS_LOCAL
ORIGINAL_GAME_PLAYABLE=PARTIAL_P1_BUILD_VIEWPORT_CLIPPING
FIRST_15_MINUTES=PARTIAL_902.836S_CAPTURE_LATER_MODAL_OBSCURED
PLAYER_MOVEMENT=PASS_54_NONZERO_PHYSICAL_WINDOWS
CAMERA=PASS_BOUNDED_PHYSICAL_CONTROLS
COLLISION=PASS_BOUNDED_ONE_CORRECTED_BUILDING_CASE
WORLD_EXPLORATION=PARTIAL_HIGHLANDS_DESERT_NATURAL
CONSTRUCTION=PASS_BOUNDED_PLACEMENT_VALIDATION_P1_LAYOUT
COMBAT=PASS_BOUNDED_REAL_WEAPON_ABILITY_KILLS
MISSIONS=PARTIAL_FIRST_GRID_GATE_AND_REWARD_NOT_FULL_CAMPAIGN
BOSS_ENCOUNTERS=PASS_FIRST_BOSS_TWO_STAGED_PREREQUISITES_FULL_HP_PHYSICAL_FIGHTS
PROGRESSION=PARTIAL_XP1309_KILLS36_RANK_PROMOTION_NOT_CERTIFIED
SAVE_RELOAD=PASS_WITH_LIMITS_128_ACKS_AUTH_RELOAD_REQUIRED
WEBGPU=PASS_BOUNDED
WEBGL=PASS_SAFE_AND_AUTO_FALLBACK_DIFFERENT_CONTENT
ASSET_LOADING=PASS_BOUNDED_52_DISTINCT_GLB_PATHS
GLTF_STALLS=ZERO_OBSERVED_HISTORICAL_CAUSE_UNRESOLVED
NEURAL_FALLBACK=PASS_NATIVE_REFERENCE_MOCK_NO_INFERENCE
COLD_START_MS=1399.90_MEDIAN_CLICK_TO_USABLE_3_RUNS
WARM_START_MS=1274.30_MEDIAN_CLICK_TO_USABLE_3_RUNS
CLICK_TO_GAMEPLAY_READY_MS=314.05_MEDIAN_DISTINCT_EVENT
IDLE_AVG_FPS=59.90_WEBGPU_TWO_10S_TRIALS
MOVEMENT_AVG_FPS=NOT_ISOLATED_MIXED_TIMED_CAPTURE_59.50
COMBAT_AVG_FPS=NOT_ISOLATED_NATURAL_MIXED_CAPTURE
BOSS_AVG_FPS=59.67_FOUR_15S_PHYSICAL_TRIALS_CLIPPED_VIEWPORT
HEAVY_SCENE_AVG_FPS=NOT_CERTIFIED_ORIGINAL_HEAVY_COMPLETE_MATRIX
FRAME_P95_MS=16.8_FULL_TIMED_MIXED
FRAME_P99_MS=16.8_FULL_TIMED_MIXED
FRAME_STALL_COUNT=106_GT33.33MS_36_GT100MS
GAMEPLAY_SESSION_DURATION=902.836S_TIMED_525.707S_POINTER_CONFIRMED_PREFIX
MEMORY_GROWTH=CDP_HEAP48.92_TO126.75MIB_RENDERER_ESTIMATE84.72_TO983.00MIB
WORKER_COUNT_DELTA=0_FROM5_TO5
LISTENER_TIMER_DELTA=PROBE_LISTENERS_PLUS15_INTERVALS_0_CDP_LISTENERS_PLUS81
UNRESOLVED_LEAKS=INCONCLUSIVE_HEAP_RESOURCE_DOM_GROWTH
MULTIPLAYER_CLIENTS=2_4_8_REAL_BROWSER_AND_HTTP
MULTIPLAYER_ACCEPTED_COMMANDS_S=5.099683_8CLIENT_MIXED_20S
MULTIPLAYER_P50_MS=19.058125
MULTIPLAYER_P95_MS=32.533667
MULTIPLAYER_P99_MS=40.50425
MULTIPLAYER_CONVERGENCE=PASS_BOUNDED_EVENTUAL_AFTER_CONTINUOUS_INPUT_20S_STALL
PERSISTENCE_INTEGRITY=PASS_BOUNDED_SOURCE_ARCHIVE_RECOVERY_ORIGINAL_SAVE_ID_DEFECT
STUDIO_PLAYABLE=PASS_LOCAL_PREVIEW11
SDK_INDEPENDENT_GAME=PASS_SIGNAL_GARDEN_AND_OUTPOST_PUBLIC_PACKAGE
STUDIO_LOAD_MS=webgpu_COLD_222.01_WARM_110.43;webgl_COLD_295.10_WARM_110.62
EDITOR_INTERACTION_PERFORMANCE=40_INPUTS_P95_71.51MS_INCLUDES_DRIVER
EDITOR_SAVE_RELOAD=PASS_BOTH_BACKENDS_FRESH_CONTEXT_EXPORT
ENGINE_TESTS=269/269_PRE_ZGE12
LEGACY_TESTS=83/86
KNOWN_GOLDEN_FAILURES=3_UNCHANGED
NEW_REGRESSIONS=NONE_INTRODUCED_BENCH_NO_GAMEPLAY_CHANGES
GAMEPLAY_RATING_1_TO_10=6_AUTOMATED_PROVISIONAL
GRAPHICS_RATING_1_TO_10=NOT_FULLY_EVALUATED
PERFORMANCE_RATING_1_TO_10=NOT_FULLY_EVALUATED
STABILITY_RATING_1_TO_10=NOT_FULLY_EVALUATED
MULTIPLAYER_RATING_1_TO_10=4_SOURCE_PLAYABILITY_SCOPE
OVERALL_WEIGHTED_RATING_1_TO_10=NOT_COMPUTED_80_PERCENT_UNEVALUATED
P0_DEFECTS=0_CONFIRMED
P1_DEFECTS=2_CONFIRMED
P2_DEFECTS=3_CONFIRMED
P3_DEFECTS=2_CONFIRMED
ORIGINAL_GAME_PLAYABILITY_VERDICT=PARTIAL_PROFESSIONAL_QUALITY_NO_GO
SOURCE_ENGINE_VERDICT=INTEGRITY_PASS_WITH_LIMITS_INPUT_PLAYABILITY_FAIL_ENGINE7_OF10
STUDIO_SDK_VERDICT=PASS_BOUNDED_AUTOMATED_LOCAL_PREVIEW
PERFORMANCE_VERDICT=PASS_BOUNDED_60HZ_PARTIAL_COMPLETE_SCOPE
PRODUCTION_RELEASE_VERDICT=NO_GO
TOP_10_IMPROVEMENTS=INPUT_PACING_LAYOUT_MODAL_INPUT_SAVE_IDS_AUTH_RECOVERY_RETENTION_CAMPAIGN_SOURCE_LINEAGE_CREATOR_UX_PRODUCTION_GATES
NEXT_OPTIMIZATION_MILESTONE=ZGE12_LOCAL_SDK_EDITOR_AND_PROFILING_SEPARATE_FROM_LEGACY_FIXES
GO_NO_GO=GO_CONTINUED_DEVELOPMENT_NO_GO_PROFESSIONAL_RELEASE_LIVE_TRANSFER_PRODUCTION
```
