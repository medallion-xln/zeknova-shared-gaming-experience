# Editor and SDK readiness — ZGE-09

`packages/tooling/src/index.js` exports the minimal in-process `EditorSession` and `validateProjectManifest` interfaces. Four new tests cover their successful use and denied operations. This is an SDK boundary for a future independent editor; no visual editor or HTTP debug route is installed.

The embedding developer must explicitly enable a session, provide a plain-data principal and implement an authorization callback. Every method checks its named capability; the default callback denies everything. A callback must return the boolean `true`, so an accidentally asynchronous policy cannot grant access. Reads can expose private simulation data and require permission too. Authentication, human role assignment and secure transport remain responsibilities of any future embedding application.

| Interface | Capability and contract |
|---|---|
| `saveScene()` / `loadScene(scene)` | `scene.read` / `scene.write`; versioned `zge.scene.v1`, finite plain JSON, bounded to 4,194,304 serialized JavaScript characters and 10,000 entities; unique positive entity IDs, safe next ID, registered component validators |
| `inspectEntity(id)` / `inspectComponent(id,type)` | `entity.read` / `component.read`; immutable detached data or `null` |
| `snapshot()` | `world.read`; immutable current ECS world snapshot |
| `serializePrefab(id,assetIds)` / `instantiatePrefab(prefab)` | `prefab.read` / `prefab.write`; `zge.prefab.v1`, registered components and project-known asset IDs; new entity identity on instantiation |
| `metrics()` | `metrics.read`; existing engine diagnostics, lifecycle, clock, plugin/system ownership and metric summaries |
| `setComponent(id,type,value)` | `debug.write`; existing component validator; detached plain input |
| `pause()` / `resume()` / `step(count)` | `simulation.control`; existing kernel lifecycle and owned clock, 1–120 explicit fixed steps while paused |
| `registerPlugin(plugin)` | `plugin.register`; existing dependency/disposal registry; registration before initialization only |
| `setProject(manifest)` / `project()` | `project.write` / `project.read`; immutable `zge.project.v1`, unique asset IDs, relative asset paths, declared SHA-256, entry scene and plugin IDs |

Mutation additionally requires a session constructed with `authority:'sandbox'` and an owned simulation clock. `authority:'inspect'` remains read-only even if its permission callback grants all capabilities. Delegated clocks cannot enter sandbox mode. Scene/component/prefab edits require pause. Scene restoration validates a temporary `World` before replacing the current scene, so malformed IDs or components cannot partially clear a world. Scene load returns only the loaded world ID/revision and does not require an additional read capability after mutation.

Project manifests reject absolute paths, traversal, URLs, backslashes, duplicate identifiers and malformed hashes. They describe asset identity; this milestone does not fetch an asset or prove that external bytes match its declared hash. Plugins are trusted JavaScript supplied by the local embedding developer, not sandboxed untrusted code. Component validators likewise belong to the trusted engine host.

These tools are intentionally separate from `MultiplayerConstructionRuntime`, PHP mutation routing and the supervised authoritative world workers. They do not grant reset/repair/aid actions, skip SQL transactions, replace command receipts, transfer live authority or bypass player permissions. A production editor transport, per-field privacy policy, signed projects, artifact registry and transactional live authoring remain future work.

Run `node --test packages/tooling/test/editor.test.mjs`. The independent source snapshot also compiles these exports into the standalone ESM engine and executes these four tests without the historical minified game bundle.
