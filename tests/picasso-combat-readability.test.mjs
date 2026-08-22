import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOSS_CONFIGS } from "../src/game/BossSystem.js";
import { Picasso, PICASSO_THEMES } from "../src/game/Picasso.js";
import {
  BIOME_DANGER_CONTRAST,
  BOSS_VISUAL_IDENTITIES,
  COMBAT_READABILITY_PRIORITY,
  IMPACT_READABILITY,
  PICASSO_CERTIFICATION_AUTHORITY,
  PICASSO_EFFECT_BUDGETS,
  ROLE_COMBAT_SIGNATURES,
  THEME_READABILITY_VARIANTS,
  WEAK_POINT_SEMANTICS,
  WEAK_POINT_STATES,
  certifyCombatIdentityData,
  priorityForCombatVisual,
  weakPointState,
} from "../src/game/PicassoCombatCertification.js";

const runtime = readFileSync(new URL("../assets/index-02987539.js", import.meta.url), "utf8");
const allowedShapes = new Set(["orb", "cone", "prism", "beam", "lance", "disc", "shard", "spike", "ring", "wave_slash", "segmented_trail", "energy_wall"]);

assert.equal(PICASSO_CERTIFICATION_AUTHORITY.CURRENT_AUTHORITY, "R0_VISUAL");
for (const [key, value] of Object.entries(PICASSO_CERTIFICATION_AUTHORITY)) {
  if (key.startsWith("CAN_")) assert.equal(value, false, key);
}
assert.deepEqual(Object.keys(COMBAT_READABILITY_PRIORITY), ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
assert.deepEqual(Object.values(COMBAT_READABILITY_PRIORITY).map((item) => item.rank), [0, 1, 2, 3]);
assert.equal(priorityForCombatVisual({ source: "ambient" }), "LOW");
assert.equal(priorityForCombatVisual({ source: "enemy" }), "MEDIUM");
assert.equal(priorityForCombatVisual({ kind: "juggernaut" }), "HIGH");
assert.equal(priorityForCombatVisual({ boss: true }), "CRITICAL");
assert.equal(PICASSO_EFFECT_BUDGETS.maximumCriticalEmphasis, 2);
assert.equal(PICASSO_EFFECT_BUDGETS.maximumHighEmphasis, 4);
assert.equal(PICASSO_EFFECT_BUDGETS.perProjectileDynamicLights, 0);

assert.equal(Object.keys(ROLE_COMBAT_SIGNATURES).length, 9);
const roleSignatures = new Set();
for (const [role, signature] of Object.entries(ROLE_COMBAT_SIGNATURES)) {
  assert.ok(allowedShapes.has(signature.primaryShape), `${role} primary shape`);
  assert.ok(allowedShapes.has(signature.secondaryShape), `${role} secondary shape`);
  roleSignatures.add(JSON.stringify([signature.primaryShape, signature.secondaryShape, signature.motion, signature.telegraph]));
}
assert.equal(roleSignatures.size, 9);

assert.equal(Object.keys(BOSS_VISUAL_IDENTITIES).length, 12);
assert.deepEqual(new Set(Object.keys(BOSS_VISUAL_IDENTITIES)), new Set(Object.keys(BOSS_CONFIGS)));
const bossSignatures = new Set();
for (const [bossId, profile] of Object.entries(BOSS_VISUAL_IDENTITIES)) {
  for (const field of ["family", "primary", "secondary", "telegraph", "phaseTransition", "weakPoint", "arenaHazard", "impact"]) {
    assert.ok(profile[field], `${bossId}.${field}`);
  }
  assert.ok(allowedShapes.has(profile.primary), `${bossId} primary`);
  assert.ok(allowedShapes.has(profile.secondary), `${bossId} secondary`);
  bossSignatures.add(JSON.stringify(profile));
}
assert.equal(bossSignatures.size, 12);

assert.deepEqual(Object.keys(WEAK_POINT_SEMANTICS), WEAK_POINT_STATES);
assert.equal(weakPointState({ active: false }), "CLOSED");
assert.equal(weakPointState({ active: true, previousActive: false }), "OPENING");
assert.equal(weakPointState({ active: true, previousActive: true, activeUntil: 1000, now: 500 }), "ACTIVE");
assert.equal(weakPointState({ active: true, previousActive: true, activeUntil: 650, now: 500 }), "CLOSING");
assert.equal(weakPointState({ active: true, hitUntil: 600, now: 500 }), "HIT");
assert.equal(Object.keys(IMPACT_READABILITY).length, 7);
assert.deepEqual(Object.keys(BIOME_DANGER_CONTRAST), ["forest", "desert", "highlands", "arctic", "wetlands"]);

const canonical = Object.freeze({ projectile: { x: 12, y: 3, z: -4, velocity: 9, damage: 12, lifetime: 2.8 }, boss: { phase: "phase_2", health: 411, weakPoint: "ACTIVE" }, outcome: { hit: true, playerHealth: 82 } });
const gameplaySnapshots = [];
const visualVariants = new Set();
for (const theme of PICASSO_THEMES) {
  const before = structuredClone(canonical);
  const profile = Picasso.generateCombatReadabilityProfile(theme, { biome: "highlands", bossId: "highlands_arc_gunner" });
  gameplaySnapshots.push(JSON.stringify(before));
  visualVariants.add(JSON.stringify(profile.variant));
  assert.deepEqual(before, canonical, `${theme} cannot mutate canonical combat state`);
  assert.strictEqual(profile.roles, ROLE_COMBAT_SIGNATURES);
  assert.strictEqual(profile.weakPoints, WEAK_POINT_SEMANTICS);
  assert.strictEqual(profile.impacts, IMPACT_READABILITY);
  assert.equal(profile.appearanceOnly, true);
}
assert.equal(new Set(gameplaySnapshots).size, 1);
assert.equal(visualVariants.size, 6);
assert.deepEqual(new Set(Object.keys(THEME_READABILITY_VARIANTS)), new Set(PICASSO_THEMES));
assert.equal(certifyCombatIdentityData().pass, true);

assert.match(runtime, /zkPicassoReadabilityAuthority/);
assert.match(runtime, /originalDuration/);
assert.match(runtime, /telegraphDurationChanges/);
assert.match(runtime, /maximumCriticalEmphasis:2/);
assert.match(runtime, /maximumHighEmphasis:4/);
assert.match(runtime, /\["CLOSED","OPENING","ACTIVE","HIT","CLOSING"\]/);
for (const impactType of Object.keys(IMPACT_READABILITY)) assert.match(runtime, new RegExp(impactType));
assert.match(runtime, /zeknova-picasso-readability-qa/);
assert.match(runtime, /gameplayStateDivergenceCount/);
assert.match(runtime, /perProjectileDynamicLights:0/);

console.log("Picasso combat readability and encounter identity tests passed.");
