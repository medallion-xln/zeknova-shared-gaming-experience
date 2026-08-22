import assert from "node:assert/strict";
import { CombatFeedbackDirector, COMBAT_FEEDBACK_AUTHORITY, classifyImpactDirection, impactDescriptor } from "../src/game/CombatFeedbackDirector.js";

const position = (x, z, yaw = 0) => ({ group: { position: { x, z }, rotation: { y: yaw } } });
assert.equal(classifyImpactDirection(position(0, 2), position(0, 0)), "front");
assert.equal(classifyImpactDirection(position(2, 0), position(0, 0)), "right");
assert.equal(classifyImpactDirection(position(0, -2), position(0, 0)), "back");
assert.equal(classifyImpactDirection(position(-2, 0), position(0, 0)), "left");

const cases = [
  { mission: 1, weaponId: "rifle", damage: 8, boss: false, expected: "normal" },
  { mission: 4, weaponId: "thunderclaw-rocket", damage: 22, boss: false, expected: "heavy" },
  { mission: 7, weaponId: "minigun", damage: 7, boss: false, expected: "heavy" },
  { mission: 12, weaponId: "rifle", damage: 8, boss: true, expected: "boss" },
];
for (const scenario of cases) {
  const descriptor = impactDescriptor({ source: position(0, 2), target: { ...position(0, 0), isBoss: scenario.boss }, damage: scenario.damage, weaponId: scenario.weaponId, before: 100, after: 100 - scenario.damage, now: scenario.mission });
  assert.equal(descriptor.kind, scenario.expected, `mission ${scenario.mission} classification`);
  assert.equal(descriptor.confirmed, true);
  assert.equal(descriptor.authority.canChangeDamage, false);
}

let clock = 100;
const player = { health: 100, maxHealth: 100, ...position(0, 2) };
const game = {
  player,
  renderer: { domElement: { style: {} } },
  damageWeaponTarget(target, damage) { target.health -= damage; return true; },
  updateEnemyProjectiles() { player.health -= 5; return "projectiles-updated"; },
  updateEnemyUnit() { player.health -= 3; return "unit-updated"; },
  bossManager: { damagePlayer(amount) { player.health -= amount; return true; }, phase: { id: "one" } },
};
const director = new CombatFeedbackDirector({ game, documentRef: null, windowRef: {}, now: () => clock, requestFrame: () => 19, cancelFrame: () => {} }).install();
const target = { health: 20, ...position(0, 0) };
assert.equal(game.damageWeaponTarget(target, 6, "#fff", "rifle"), true);
assert.equal(target.health, 14, "authoritative damage is neither changed nor repeated");
assert.equal(director.events.length, 1, "one confirmed hit creates one event");
assert.equal(director.events[0].damage, 6);

game.updateEnemyProjectiles(.016);
game.updateEnemyUnit({}, .016);
game.bossManager.damagePlayer(7, "pattern", "projectile");
assert.equal(player.health, 85, "player damage remains owned by original methods");
assert.deepEqual(director.events.slice(1).map((event) => event.damage), [5, 3, 7]);
assert.ok(director.events.slice(1).every((event) => event.target === "player"));

for (let i = 0; i < 30; i += 1) director.emit(impactDescriptor({ source: player, target, damage: 1, weaponId: "rifle", before: 14, after: 13, now: ++clock }));
assert.equal(director.impulses.length, 12, "camera impulses have a hard cap");
assert.ok(director.events.length <= 64, "event history is bounded");
assert.equal(director.snapshot().sparkPoolSize, 0, "headless mode performs no DOM allocation");
assert.equal(COMBAT_FEEDBACK_AUTHORITY.canPauseSimulation, false);

director.tick(clock + 200);
assert.equal(director.impulses.length, 0);
assert.equal(game.renderer.domElement.style.transform, "");
director.dispose();
const afterDispose = director.events.length;
game.damageWeaponTarget(target, 1);
assert.equal(director.events.length, afterDispose, "dispose restores original combat method");

console.log("combat feedback director certification passed");
