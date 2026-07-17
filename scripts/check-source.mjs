import assert from "node:assert/strict";
import { BIOMES, biomeAt } from "../src/world/Biomes.js";
import { buildingCollisionRadius, enemyCollisionRadius, SpatialHash } from "../src/world/Collision.js";
import { ENEMY_PROFILES } from "../src/game/Enemies.js";
import { createCampaignTiers, objectiveComplete } from "../src/game/Missions.js";
import { miningCooldown, rankGoal } from "../src/game/Player.js";
import { sampleHeightGrid } from "../src/world/Terrain.js";

assert.equal(BIOMES.length, 5);
assert.equal(biomeAt(-89).id, "forest");
assert.equal(biomeAt(89).id, "wetlands");
assert.equal(createCampaignTiers().flatMap((tier) => tier.missions).length, 12);
assert.equal(Object.keys(ENEMY_PROFILES).length, 5);
assert.equal(miningCooldown("ensign"), 10);
assert.equal(rankGoal("lieutenant").missions, 8);
assert.equal(buildingCollisionRadius("power"), 1.55);
assert.equal(enemyCollisionRadius("juggernaut"), 1.75);
assert.equal(objectiveComplete({ kind: "building", key: "power", target: 1 }, { power: 1 }), true);
assert.equal(sampleHeightGrid(new Float32Array([0, 10, 20, 30]), 2, 2, 0, 0), 15);
const hash = new SpatialHash(8), marker = { id: "marker" };
hash.insert(marker, 2, 3);
assert.equal(hash.query(2, 3, 1).has(marker), true);

console.log("ZekNova source modules passed structural checks.");

