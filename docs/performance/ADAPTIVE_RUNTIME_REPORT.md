# ZekNova Adaptive Runtime Performance Report

Date: 2026-08-09 (America/Los_Angeles)

The 100× goal was treated as an engineering target. It was reached for selected unnecessary workloads, not for overall FPS. Measurements below distinguish live browser results from deterministic CPU microbenchmarks.

## Baseline

Reproducible live scene: `?demo=1&boss=11&perfBaseline=1`, Anime Picasso theme, sampled after launch.

| Metric | Baseline |
| --- | ---: |
| Current FPS | 62.8 |
| Worst observed FPS | 6.3 |
| Maximum frame | 157.5 ms |
| Peak JS heap | 384.82 MB |
| Renderer geometries | 1,203 |
| Renderer textures | 116 |
| Peak active projectiles | 43 |

Primary hot paths were full-rate actor updates outside the player's tactical area, repeated `countByType()` scans, per-frame resource scans, repeated mission-context reconstruction, frequent HUD work, map DOM reconstruction, and immediate saves from small mutations.

## Runtime architecture

`AdaptiveSimulationDirector` is the only scheduling authority:

- T0 Critical: player-adjacent threats, mission-critical actors, boss and projectiles remain full fidelity.
- T1 Near: safe 30 Hz actor updates.
- T2 Mid: 8 Hz simplified updates.
- T3 Far: 2 Hz strategic updates.
- T4 Off-Biome: 0.5 Hz data-first updates.

Promotion is immediate. Deferred hostile cooldown time remains authoritative, while far/off-biome visual movement is capped to prevent teleporting. Boss manager and projectile loops are not throttled.

Sentinel Prime receives compact immutable observations in a worker and returns relevance recommendations. Recommendations may only promote fidelity. Invalid authority or unavailable workers fall back to deterministic distance/mission rules without blocking a frame.

## Live optimized results

Boss 11 staged scene after optimization:

| Metric | Optimized | Observed change |
| --- | ---: | ---: |
| Adaptive FPS | 68.5 | 1.09× baseline current FPS |
| Existing Picasso sampler FPS | 77.5 | 1.23× baseline current FPS |
| Average frame | 13.65 ms | within 16.67 ms target |
| Steady JS heap | 141.18 MB | 2.65× lower than baseline peak* |
| Renderer geometries | 632 | 1.90× fewer* |
| Renderer textures | 25 | 4.64× fewer* |
| Enemy AI executions | 2.00× fewer | measured runtime counter |
| Resource scans | 7.95× fewer | measured runtime counter |
| HUD updates | 14.54× fewer | measured runtime counter |
| Mission-context evaluations | 8.02× fewer | measured runtime counter |
| Building-count scans | 1,351× fewer | measured runtime counter |

`*` Steady-scene memory/renderer values are time-dependent as asynchronous models load; use the stress row for warmed peak behavior.

Dense stress scene (43 peak projectiles plus added enemies): 59.5 FPS, 381.44 MB JS heap, 968 geometries, 116 textures, no browser/shader errors. Critical combat stayed full fidelity. Runtime reductions under stress were 1.72× AI, 6.59× resource scans, 11.79× HUD, 12.48× mission context, 15,910× building scans, and 2.06× save batching.

Mission 2 Highlands verification: 87.4 FPS, 13.75 ms average frame, 212.26 MB heap. Tier population was T0 17, T1 5, T2 0, T3 0, T4 42. Commissioning attackers remain T0. No fatal browser, Picasso authority, shader, or gameplay-parity error was observed.

## Deterministic microbenchmark

3,600 frames per scene:

| Workload | Update reduction | CPU factor |
| --- | ---: | ---: |
| Populated settlement | 2.00× | 1.83× |
| Ten distributed Juggernauts | 1.99× | 1.72× |
| Ten off-biome Juggernauts | 124.14× | 13.22× |
| Dense boss combat | 1.00× | 0.97× |
| Mission 2 critical attackers | 1.00× | 0.95× |
| 500-building count scan | 3,600× fewer scans | 1,111.32× CPU |

The small overhead in critical scenes is intentional scheduler validation; it prevents performance modes from changing boss or mission outcomes.

## Other changes

- Spatial hash shared registry for local entity queries.
- 100 ms resource-interaction cadence and 200 ms HUD cadence.
- 100 ms mission-context cache and mutation-invalidated building counts.
- 800 ms debounced saves with page-hide flush.
- Mission map signature/diff rendering and 30-second resource registry cache.
- Explicit 16.67 ms budget and sustained-frame hysteresis.
- Ultra, High, Balanced, Performance and Emergency adaptive visual tiers.
- Picasso cost metadata and appearance-only scaling that preserves the selected theme.
- Worker-based Prime relevance preparation with deterministic main-thread fallback.

## Authority verification

Sentinel Prime adaptive authority remains R0:

`canDispatch=false`, `canMutateLiveWorld=false`, `canControlActors=false`, `canChangeGameplayOutcome=false`, `canModifyMissionState=false`, `canModifyPhysics=false`, `canModifySaveState=false`, `canModifyMultiplayerSync=false`.

Picasso remains appearance-only. Adaptive scaling does not change theme ID, collision, combat, mission, save, economy, or multiplayer state.

## Remaining bottlenecks

- The legacy bundle still allocates temporary vectors in T0 enemy/projectile paths.
- Draw calls and geometry count rise after all HQ resident models and Picasso outlines are loaded.
- Bullet-hell rendering is pooled but not yet fully instanced.
- GPU frame time is not exposed consistently by WebGPU/WebGL2 in the current browser telemetry.
- Initial theme compilation and model upload can still create a one-time long frame; sustained hysteresis prevents that spike from degrading quality unnecessarily.

Recommended next step: split logical projectile state from instanced visual batches and migrate hot T0 collision/vector math to reusable scratch objects, then capture GPU timer-query evidence on supported WebGL2 hardware.
