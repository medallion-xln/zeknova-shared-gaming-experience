# ZekNova runtime reconstruction contract

Golden compatibility runtime: `assets/index-02987539.js` at SHA-256
`7a9cdfeec0c7b2ffe6e3f0f250fafb0e0d41ef0bd66d823240086985f36f5dab`.
Golden model runtime: `assets/model-runtime-c96327ba.js` at SHA-256
`e6af33cdf1f56c098d16156ce34ff435c7fa7a5490ed640a63c6e5e43ca726d0`.

## Compatibility capabilities

| Source segment | Capability ownership | External surface |
| --- | --- | --- |
| `01-vendor-and-bootstrap.js` | module preload, Three.js/browser runtime, configuration and base data | DOM, WebGPU/WebGL, browser events |
| `02-missions-and-ui.js` | mission catalog, objectives, authentication and UI | login/game UI and mission state |
| `03-world-and-game-core.js` | terrain, simulation, player, buildings and base game | world/game objects and state writes |
| `04-gameplay-systems.js` | diplomacy, AO, enemies, collision, multiplayer and telemetry | network/save calls, advisor telemetry |
| `05-legacy-bridge-and-combat.js` | public bridge, weapons, repair and sustainability | `ZekNovaLegacyBridge.start/dispose` |
| `06-world-missions-and-bosses.js` | aid, HUD, missions, bosses and campaign systems | game state, DOM and model imports |
| `07-boss-runtime-and-visuals.js` | boss execution, effects, physics and visual policy | boss/model adapters and diagnostics |
| `08-picasso-certification-and-entry.js` | visual certification, startup and global game publication | R0 reports and `ZekNovaGame` |

The bridge is a frozen object. `start(user)` rejects a missing authenticated
user, stores the user when storage is available, and asynchronously starts the
game. `dispose()` is idempotent through optional disposal, clears the internal
game reference, and publishes `globalThis.ZekNovaGame = null`.

The runtime consumes DOM APIs, local/session storage, Fetch, animation frames,
browser timing, WebGPU/WebGL, imported model loaders, save/auth endpoints, and
the repository-owned AZL/Sentinel adapters. Its published advisor and visual
certification surfaces remain observation-only at R0.

## Model contract

The complete model owner exports 20 loaders: five officer/companion entrypoints,
four rank-specific loaders, the Juggernaut loader, the typed enemy loader, and
nine mission-boss loaders. Loaders accept no parameters except
`loadEnemyModel(type)`. They return promises for disposable model-controller
objects (or wrapper promises for the synchronous facade exports), load assets
through the shared GLTF/KTX2/Meshopt pipeline, and preserve the golden fallback
and rejection behavior. Results are conditionally deterministic because asset
availability, renderer support, animation time, and loaded GLB contents are
external inputs.

The exact-byte reconstruction test makes every observable active and adversarial
path equivalent to the frozen reference: malformed input, missing providers,
load failures, repeat initialization, teardown, and fallback behavior execute
the same instructions. Candidate output is never used by the live binding in
this stage.

