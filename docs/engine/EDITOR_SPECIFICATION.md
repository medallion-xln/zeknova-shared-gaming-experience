# ZekNova Engine Editor · Specification (design only)

Nothing in this document is implemented. The editor is milestone ZGE-07 and depends on the kernel (ZGE-01), render/asset separation (ZGE-02) and scene serialization (ZGE-03).

---

## 1. What exists that the editor can build on
- `WorldClawEditor.js` (`?worldclaw=1`): in-game panel that generates `WorldSpec`s, previews them as a scene group, runs `MissionPlacementValidator`/`WorldCritic`/`WorldRepairDirector`, and exports/imports JSON (`WorldPersistence.js`, `BlenderInterop.js`). No authority over the live world.
- `?physicsDebug` overlay (`PhysicsDebug.js`): live contacts/broadphase JSON.
- Performance fixtures + materializer (`?performanceFixture=`): deterministic scene setup and frame capture.
- QA gameplay states (`?demo=1&mission=N|boss=N`).
- Hidden telemetry `<output>` nodes (render performance, adaptive runtime, boss encounter, physics).
- Picasso theme selector (runtime material/post profile switching).

## 2. Requirements by capability
| Capability | Requirement | Depends on | Priority |
|---|---|---|---|
| 3D scene viewport | Engine render backend in an editor-owned canvas; orbit/fly camera; selection raycast; grid/gizmos; play-in-viewport | ZGE-02 render separation | P0 |
| Entity hierarchy | Tree of entities with parent/child transform components; search/filter; multi-select | ZGE-01 world model | P0 |
| Component inspector | Reflection metadata per component (field types, ranges, enums); edit → command with undo; live values while playing | ZGE-01 component registry + reflection | P0 |
| Asset browser | `@zge/assets` registry view; GLB/texture/audio previews; LOD tiers; reference counts; drag to viewport | ZGE-02 asset manager | P0 |
| Drag-and-drop placement | Prefab → entity at raycast hit; snap to terrain (`walkHeightAt`); placement validity from `MissionPlacementValidator` | P0 + world-gen | P1 |
| Terrain & biome editing | Height-grid brush, biome painting, re-run placement; WorldSpec as the document | ZGE-03 scene format + world-gen | P1 |
| Lighting controls | Sun/sky, shadow budget, time-of-day resource | ZGE-02 | P1 |
| Material/shader inspection | TSL node graph read-out, texture slots, Picasso theme overrides | ZGE-02 | P2 |
| Animation timeline | Clip list from GLB, scrub, blend weights, events | ZGE-02 assets + animation component | P2 |
| Physics debugging | Bodies/contacts/sweeps overlay (from `PhysicsDebug`), body inspector, step/pause | ZGE-02 physics authority | P1 |
| NPC & AI debugging | Observation/legality mask viewer, policy tick trace, proposal log with authority tier, replay cursor | ZGE-05 `@zge/ai` | P1 |
| Mission graph editing | Node graph over the objective DSL (`Missions.js` kinds), validation via `MissionPlacementValidator`, QA-state launch | ZGE-03 missions module | P2 |
| Prefab authoring | Entity template with overrides; nested prefabs; variant diff | ZGE-03 serialization | P1 |
| Play / pause / step | Kernel `start/pause/step`; snapshot on play, restore on stop | ZGE-01 snapshot/restore | P0 |
| Runtime profiling | `engine.metrics` per-system timings, draw calls, memory, asset stats; frozen-fixture comparison | ZGE-01 metrics | P0 |
| Scene save/load | JSON scene + prefabs; migrations; diff-friendly ordering | ZGE-03 | P0 |
| Plugin management | Manifest editor: enable/disable plugins, authority tiers, requires graph, feature flags | ZGE-05 plugin API | P1 |

## 3. Architecture
- **Host**: same browser page as the game, editor UI in a separate DOM root (or a dev-server-served SPA), talking to the engine through the public API only (no bundle DOM ids).
- **Document model**: scene file = source of truth; the running world is a derived instance; edits are commands (undoable), applied to the document and mirrored to the live world when not playing.
- **Reflection**: each component type registers a schema (`fields`, `defaults`, `editor hints`); the inspector is generated from schemas; the same schemas drive serialization and validation.
- **Data flow**: editor → `CommandBus` (tier `Editor`) → world; world → `events` → editor views. No direct mutation of engine internals.
- **Headless parity**: everything the editor does must be scriptable via `@zge/cli` (e.g. `zge scene validate`, `zge fixture capture`), so CI can run editor operations without a UI.

## 4. Sequencing
1. **ZGE-01 deliverable** — developer overlay: metrics panel, status table of guards, entity/resource dump (read-only). Replaces hidden `<output>` telemetry.
2. **ZGE-02** — physics/asset debug panels; render stats.
3. **ZGE-03** — scene save/load + inspector (read/write) + prefab authoring.
4. **ZGE-05** — AI debugger (observations, proposals, authority).
5. **ZGE-07** — full editor: viewport, hierarchy, asset browser, placement, terrain/biome, mission graph, plugin manager.

## 5. Explicitly out of scope until after ZGE-08
Collaborative multi-user editing, cloud asset pipeline, visual scripting, mobile editor.
