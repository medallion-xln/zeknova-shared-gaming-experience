# Source architecture

`src/main.js` is the browser entry point. It exposes the editable source modules as `window.ZekNovaSource` for debugging and then loads the compatibility runtime through `game/Game.js`.

Live migrated systems:

- `game/Missions.js`: campaign tiers, objectives, and progress helpers.
- `game/Enemies.js`: high-fidelity enemy roster and combat profiles.
- `world/Biomes.js`: AO boundaries, terrain colors, resources, and hazards.
- `world/Collision.js`: collision radii and reusable spatial hashing.
- `game/Player.js`: rank progression and mining cooldown rules.

The generated Three.js renderer and main simulation loop remain in `assets/index-02987539.js` during the progressive migration. Do not add new gameplay constants to that bundle; place them in `src/` and import them instead.
