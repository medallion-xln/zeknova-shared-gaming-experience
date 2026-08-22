import assert from "node:assert/strict";
import { CombatResultPublisher, COMBAT_RESULT_SUPPORT } from "../src/game/CombatResult.js";
import { CombatFeedbackDirector } from "../src/game/CombatFeedbackDirector.js";
import { ZEK21_LIVE_COMBAT_FIXTURES, fixtureById } from "../src/game/PerformanceFixtures.js";
import { certifyLiveCombat } from "../src/game/CombatLiveCertification.js";

assert.deepEqual(ZEK21_LIVE_COMBAT_FIXTURES.map((fixture) => [fixture.missionId, fixture.boss.id]), [["habitat", "forest_ancient_thornwarden"], ["culture", "forest_spore_cantor"]]);
assert.equal(fixtureById("zek21-mission-4-boss").boss.phase, 2);
assert.equal(certifyLiveCombat({}), null, "live probe is unavailable outside localhost fixture authority");

const pose = (x = 0, z = 0) => ({ position: { x, y: 0, z }, rotation: { y: 0 } });
const player = { health: 100, maxHealth: 100, group: pose(0, 3) };
const boss = { userData: { health: 100, isMissionBoss: true, bossStunnedAt: 0 }, ...pose(0, 0) };
const game = {
  player, enemies: [], enemyProjectiles: [], renderer: { domElement: { style: {} } },
  damageWeaponTarget(target, damage) {
    const healthOwner = target.userData || target;
    healthOwner.health = Math.max(0, healthOwner.health - damage);
    if (target.userData?.isMissionBoss) { target.userData.hitCount = (target.userData.hitCount || 0) + 1; if (target.userData.hitCount === 4) target.userData.bossStunnedAt = 55; }
    return true;
  },
  updateEnemyProjectiles() { return false; }, updateEnemyUnit() { return false; },
  bossManager: { boss, defense: { kind: "shield" }, damagePlayer(amount, patternId, projectileId) { player.health -= amount; this.lastDamageAttribution = { bossId: "mission-boss", patternId, projectileId, damage: amount }; return true; } },
};
const publisher = new CombatResultPublisher({ game }).install();
let time = 1;
const feedback = new CombatFeedbackDirector({ game, resultSource: publisher, documentRef: null, windowRef: {}, now: () => time, requestFrame: () => 1, cancelFrame: () => {} }).install();

for (let hit = 0; hit < 4; hit += 1) game.damageWeaponTarget(boss, 5, "#fff", "rifle");
assert.equal(boss.userData.health, 80, "publisher never changes authoritative damage");
assert.equal(publisher.results.length, 4);
assert.equal(feedback.events.length, 4);
assert.equal(publisher.results.at(-1).bossStaggered, true, "real boss stun transition is exposed");
assert.equal(feedback.events.at(-1).kind, "boss-stagger");
assert.equal(publisher.results[0].weakPoint, false);
assert.equal(publisher.results[0].critical, false);
assert.equal(COMBAT_RESULT_SUPPORT.weakPoint, false, "visual-only weak-point vocabulary is not promoted to combat truth");
assert.equal(COMBAT_RESULT_SUPPORT.armor, false);

const oneResult = publisher.results[0];
assert.equal(feedback.consume(oneResult, boss), false, "duplicate result id is ignored");
assert.equal(feedback.events.length, 4);
assert.equal(feedback.impulses.length, 4);

game.bossManager.damagePlayer(9, "screecher_dive", "projectile-7");
const playerResult = publisher.results.at(-1);
assert.equal(playerResult.targetType, "player");
assert.equal(playerResult.damageAmount, 9);
assert.equal(playerResult.attribution.projectileId, "projectile-7");
assert.equal(playerResult.sourceId, "mission-boss");

for (const count of [10, 25, 50, 100, 250]) {
  for (let index = 0; index < count; index += 1) publisher.publish({ source: player, target: { health: 9, group: pose(0, 0) }, weaponId: "rifle", requestedDamage: 1, beforeHealth: 10, afterHealth: 9 });
  assert.ok(feedback.impulses.length <= 12, `${count} hits remain camera-bounded`);
  assert.ok(feedback.events.length <= 64, `${count} hits remain history-bounded`);
  assert.ok(publisher.results.length <= 64, `${count} results remain publisher-bounded`);
}
time = 10000; feedback.tick(time);
assert.equal(feedback.impulses.length, 0, "camera stack recovers to zero");
assert.equal(feedback.snapshot().activeAudioNodes, 0);

feedback.dispose(); publisher.dispose();
console.log("ZEK-21 authoritative combat result semantics: PASS");
