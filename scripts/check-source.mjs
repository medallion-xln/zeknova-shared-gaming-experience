import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
assert.equal(buildingCollisionRadius("zek_beacon"), 1.45);
assert.equal(buildingCollisionRadius("zek_transit"), 2.15);
assert.equal(enemyCollisionRadius("juggernaut"), 1.75);
assert.equal(objectiveComplete({ kind: "building", key: "power", target: 1 }, { power: 1 }), true);
assert.equal(sampleHeightGrid(new Float32Array([0, 10, 20, 30]), 2, 2, 0, 0), 15);
const hash = new SpatialHash(8), marker = { id: "marker" };
hash.insert(marker, 2, 3);
assert.equal(hash.query(2, 3, 1).has(marker), true);

const runtime = readFileSync(new URL("../assets/index-02987539.js", import.meta.url), "utf8");
const zeknovanAidTypes = ["zek_clinic", "zek_watershed", "zek_beacon", "zek_grove", "zek_habitat", "zek_archive", "zek_market", "zek_watch", "zek_transit"];
for (const type of zeknovanAidTypes) {
  assert.match(runtime, new RegExp(`type:"${type}"[\\s\\S]*?cost:\\{minerals:\\d+,credits:\\d+\\}`));
}
assert.match(runtime, /PR\.prototype\.isHabitatSite=function/);
assert.match(runtime, /e==="habitat"\?!!i\?\.isHabitatSite/);
assert.match(runtime, /PR\.prototype\.bridgeDeckHeightAt=function/);
assert.match(runtime, /e\?\.type==="bridge"&&this\.utilityTerrain\?\.bridgeDeckHeightAt/);
assert.match(runtime, /LR\.prototype\.bridgeWalkHeightAt=function/);
assert.match(runtime, /PR\.prototype\.isWaterWorksLocation=function/);
assert.match(runtime, /t\.type==="water"&&!e\.utilityTerrain\?\.isWaterWorksLocation/);

console.log("ZekNova source modules passed structural checks.");
