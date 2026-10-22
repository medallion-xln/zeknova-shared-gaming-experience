# Independent engine certification — ZGE-03

Run from the repository root:

```sh
npm run demo:engine
npm run test:engine
npm run dev
# Open http://127.0.0.1:8790/examples/construction-world/
```

`examples/construction-world/main.mjs` uses public module entries for `@zge/core` and `@zge/gameplay-construction`. It starts an engine with manual scheduling and ENGINE construction ownership, creates a world and builder entity with a validated position component, supplies a generic shelter definition and stone inventory, submits two commands, advances three fixed steps, and publishes plain state. One shelter costs four of twelve stone; the overlapping second request rejects without a deduction. It serializes to JSON, restores the initial state, replays the commands and compares complete snapshots, then restores the saved state and disposes the engine.

The HTML example draws the resulting building and shows the transaction/snapshot result. Its Replay button reruns the same independent simulation. No ZekNova missions, characters, catalog, configuration, authentication, save PHP endpoint, GLTF models, minified runtime or neural model is imported. A recursive import-graph test rejects legacy/game dependencies; a Node execution test checks actual final inventory, occupancy rejection, entity count and deterministic replay. Browser certification executes the same module in a separate page.

ENGINE construction authority is certified for this isolated fixture. Terrain is an injected bounded plane and collision is circle occupancy, not a migrated whole-game physics backend. There is no claim of a complete production game engine, rigid-body physics, utility networks or multiplayer determinism. Rendering can consume the detached world/construction snapshot; presentation does not mutate the transaction state.
