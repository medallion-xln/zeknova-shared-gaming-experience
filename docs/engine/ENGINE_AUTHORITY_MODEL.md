# Engine authority model — ZGE-03

The live ZekNova runtime retains the gameplay loop. `EngineClock.mode=delegated` never invokes fixed-step gameplay systems. The standalone world has an owned clock and no legacy runtime. There is no additional gameplay loop in the live game.

| Domain | Live default | Optional comparison | Independent example |
|---|---|---|---|
| Time, movement, terrain, collision | LEGACY | Existing physics bridge observes | ENGINE fixed-step and injected terrain/circle occupancy |
| Construction and inventory deductions | LEGACY | SHADOW via `?construction=shadow` | ENGINE via `config.features.construction` |
| Missions, rewards, boss encounters | LEGACY | Pure fixture evaluation | Evaluator available; no authority migration |
| Combat, health, projectiles, effects | LEGACY | Pure fixture evaluation | Evaluator available; no authority migration |
| Diplomacy, AI, world generation, networking | LEGACY | Existing R0 observers | Not installed |
| Rendering and scene capture | LEGACY native renderer | Reference/neural presentation retains ZGE-02 pipeline | Detached serializable state; simple example presentation |
| Assets in readable model/environment modules | ENGINE asset service | Loader and worker diagnostics | Optional; example has no asset dependency |
| Save envelope and server merge | LEGACY v4 | ZGE-02 engine transport owns acknowledgement/retry | ENGINE version-1 construction snapshots |
| Director lifecycle | ENGINE registry | Page-only UI restrictions retained | ENGINE systems/command cleanup |

`Authority` accepts only `LEGACY`, `SHADOW`, `ENGINE`; absent domains default to LEGACY. `CommandQueue.register(type, domain, handler)` has one handler per type. Commands require explicit IDs, execute in enqueue order at the existing fixed step, and assert ENGINE authority at execution time. Duplicate IDs are ignored across snapshots/restores. Authority is deployment policy and is deliberately not restored from untrusted save data.

The live entry explicitly declares construction/combat/missions/physics modes. Only construction's comparison flag is exposed. `?construction=engine` does not transfer authority; the live adapter rejects ENGINE installation. No production ownership transfer has been certified. Rollback from shadow is removal of the query parameter or disposal of its identity-guarded wrapper.

`Construction.execute` is a synchronous, renderer-independent transaction API. Its kernel adapter registers one command handler and one owned system with disposal, and restores its data when the kernel emits `engine:restored`. The independent module can also be used directly by another engine; its API is intentionally not an access-control boundary. Callers must use the authority gateway for shared domains. Generic arbitrary user systems remain trusted code; the registry does not sandbox JavaScript mutation.

World components are plain data with optional registered validators. Existing dynamic components remain compatible. Systems declare `after` dependencies; register prerequisites first. Missing, cyclic and backwards-phase dependencies reject registration. Reverse disposal releases system callbacks; the construction adapter unregisters its command handler and restore subscription. External subscriptions/resources belong in `ctx.own(owner)` or a system disposer. New packages create no independent timers or workers except the asset service/pool, which explicitly own and clear theirs.

Snapshots contain entity IDs, components, resources, command ledger/pending order and simulation timing, without Three.js objects in the independent world. Consumers receive detached snapshots. Rendering follows Engine State → Scene Capture → Optional Neural Renderer → Presentation. Neither the neural backend nor pure combat/mission proposals can advance simulation.

Limits: no cross-machine floating-point determinism claim, network authority tokens, arbitrary JavaScript sandbox, full legacy scene serialization, full combat/boss FSM extraction or production construction cutover. Full-game placement wrappers include rank, cooldown, utility, multiplayer and commissioning policies beyond the initial contract slice.


## ZGE-07 update

ZGE-07 adds ConstructionPort to the independent gameplay session and PHP worker. It owns a private runtime, rejects conflicting flags and live ENGINE boundaries, and makes LEGACY/SHADOW dispatch read-only. Shadow observation uses detached candidates. Live authority remains LEGACY; see CONSTRUCTION_COVERAGE_ZGE_07.md and LIVE_AUTHORITY_READINESS_ZGE_07.md.


## ZGE-08 supervised staging boundary

The opt-in actor staging host retains PHP/SQLite as sole durable gameplay writer while a private bounded Node supervisor reuses one candidate executor per world. SQL lease generations fence every commit; a worker restart does not transfer live ZekNova authority. See [runtime contract](SUPERVISED_WORLD_RUNTIME.md) and [ZGE-08 report](ZGE_08_IMPLEMENTATION_REPORT.md). Live authority remains LEGACY.


## ZGE-09 operational extension

ZGE-09 retains PHP/SQLite as the sole durable gameplay writer and locked candidate validation. Fair local scheduling, batched quota accounting and verified read snapshots reduce contention without optimistic command success. The foreground outer service restarts owned launchers and validates established database identity; no OS daemon or production authority transfer is installed. See WORLD_SERVICE_SUPERVISION and AUTHORITY_CONTENTION_ANALYSIS.
