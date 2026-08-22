import assert from "node:assert/strict";
import {
  AdaptiveSimulationDirector,
  AdaptiveSpatialIndex,
  ADAPTIVE_FRAME_BUDGET_MS,
  SIMULATION_TIERS,
} from "../src/game/AdaptiveSimulationDirector.js";
import {
  SentinelPrimeAdaptiveSignal,
  SENTINEL_PRIME_ADAPTIVE_AUTHORITY,
} from "../src/game/SentinelPrimeAdaptiveSignal.js";

function actor(x, z, userData = {}) {
  return { position: { x, y: 0, z }, userData: { health: 100, attackCooldown: 10, ...userData } };
}

let now = 0;
const near = actor(5, 0, { enemyType: "spitter", hostile: true });
const far = actor(80, 0, { enemyType: "juggernaut", hostile: true, worldJuggernautSlot: 9 });
const boss = actor(75, 0, { isMissionBoss: true, bossId: "white-screecher" });
const game = {
  player: { group: { position: { x: 0, y: 0, z: 0 } } },
  enemies: [near, far, boss], residentNPCs: [],
  updateEnemyUnit(item, delta) { item.userData.attackCooldown -= delta; item.userData.executions = (item.userData.executions || 0) + 1; },
  updateResourceInteraction() {}, updateVillageResidents() {}, updateHud() {},
  getMissionContext() { return { mission: 4, power: this.buildings.records.filter((row) => row.type === "power").length }; },
  buildings: { records: [], addRecord(record) { this.records.push(record); }, countByType() { return { power: this.records.filter((row) => row.type === "power").length }; } },
  async save() {},
};

const director = new AdaptiveSimulationDirector({ game, now: () => now });
assert.equal(director.classify(near), "T0", "immediate threat must remain critical");
assert.equal(director.classify(boss), "T0", "boss must remain critical regardless of distance");
assert.equal(director.classify(far), "T4", "off-biome Juggernaut must sleep as data-first state");
assert.equal(SIMULATION_TIERS.T4.hz, .5);
assert.equal(ADAPTIVE_FRAME_BUDGET_MS.total, 16.67);

const index = new AdaptiveSpatialIndex({ cellSize: 10 });
index.rebuild([near, far, boss]);
assert.deepEqual(index.queryRadius({ x: 0, z: 0 }, 12), [near]);

director.install();
for (let frame = 0; frame < 121; frame += 1) {
  now += 1000 / 60;
  game.updateEnemyUnit(near, 1 / 60);
  game.updateEnemyUnit(far, 1 / 60);
  game.updateEnemyUnit(boss, 1 / 60);
  game.updateResourceInteraction();
  game.updateHud(false);
  game.getMissionContext();
  game.buildings.countByType();
}
assert.equal(near.userData.executions, 121, "near combat outcome remains full-rate");
assert.equal(boss.userData.executions, 121, "boss outcome remains full-rate");
assert.ok(Number(far.userData.executions || 0) <= 2, "off-biome actor receives at most strategic updates");
assert.ok(Math.abs(far.userData.attackCooldown - (10 - 121 / 60)) < .00001, "deferred actor cooldown still advances by authoritative elapsed time");

game.buildings.addRecord({ type: "power" });
assert.equal(game.buildings.countByType().power, 1, "building cache invalidates on authoritative mutation");
assert.equal(game.getMissionContext().power, 1, "mission context invalidates synchronously after construction");

const report = director.report();
assert.equal(report.authority.canDispatch, false);
assert.equal(report.authority.canMutateLiveWorld, false);
assert.equal(report.gameplayOutcomeMutation, false);
assert.ok(report.aiUpdates.reductionFactor > 1.4);
assert.ok(report.resourceScans.reductionFactor >= 5);
assert.ok(report.hudUpdates.reductionFactor >= 5);
assert.ok(report.missionContext.reductionFactor >= 5);
assert.ok(report.buildingCountScans.reductionFactor >= 50);

const prime = new SentinelPrimeAdaptiveSignal({ now: () => now });
const advice = prime.recommend({ actors: [{ id: "boss", boss: true, distance: 90 }, { id: "civilian", civilian: true, sameBiome: false, distance: 120 }] });
assert.equal(advice.recommendations[0].suggestedTier, "T0");
assert.equal(advice.recommendations[1].suggestedTier, "T4");
for (const [key, value] of Object.entries(SENTINEL_PRIME_ADAPTIVE_AUTHORITY)) if (key.startsWith("can")) assert.equal(value, false, `${key} must remain false`);

director.dispose();
console.log("Adaptive simulation director tests passed.");
