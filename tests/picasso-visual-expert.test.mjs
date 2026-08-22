import assert from "node:assert/strict";
import {
  BoxGeometry,
  FogExp2,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "../assets/vendor/three.module.min.js";
import {
  Picasso,
  PICASSO_AUTHORITY,
  PICASSO_CAPABILITIES,
  PICASSO_EXPERT_ID,
} from "../src/game/Picasso.js";
import { createSentinelVisualRouter } from "../src/game/SentinelExpertRouter.js";
import { VisualThemeManager } from "../src/game/VisualThemeManager.js";
import { PICASSO_COMPILED_STYLES } from "../src/game/PicassoRuntimeStyleCompiler.js";
import { createVisualSceneContext } from "../src/game/VisualSceneContext.js";
import {
  PICASSO_COMBAT_AUTHORITY,
  PICASSO_PROJECTILE_FAMILIES,
  combatIdentityFor,
  generateCombatVisualDescriptor,
  projectileShapeFor,
} from "../src/game/PicassoCombatLanguage.js";

const expectedAuthority = [
  "canDispatchGameplay",
  "canMutateWorld",
  "canModifyMissionState",
  "canModifyPhysics",
  "canModifySaveState",
];
for (const key of expectedAuthority) assert.equal(PICASSO_AUTHORITY[key], false, key);
for (const [key, value] of Object.entries(PICASSO_AUTHORITY)) {
  if (key.startsWith("can")) assert.equal(value, false, `${key} must remain false`);
}
for (const [key, value] of Object.entries(PICASSO_COMBAT_AUTHORITY)) {
  if (key.startsWith("can")) assert.equal(value, false, `${key} must remain false`);
}
assert.equal(PICASSO_PROJECTILE_FAMILIES.length, 12);
assert.equal(new Set(PICASSO_PROJECTILE_FAMILIES).size, 12);
assert.equal(combatIdentityFor({ bossId: "forest_spore_cantor" }), "organic");
assert.equal(combatIdentityFor({ bossId: "highlands_arc_gunner" }), "mechanical");
assert.equal(combatIdentityFor({ bossId: "arctic_white_screecher" }), "mystical");
assert.equal(projectileShapeFor({ patternId: "thorn_lance" }), "lance");
assert.equal(projectileShapeFor({ patternId: "arc_grid" }), "energy_wall");
assert.equal(projectileShapeFor({ patternId: "cryo_ring" }), "ring");
assert.equal(generateCombatVisualDescriptor({ patternId: "spore_swarm" }).appearanceOnly, true);

const router = createSentinelVisualRouter();
assert.equal(router.registry()[0].id, PICASSO_EXPERT_ID);
for (const capability of PICASSO_CAPABILITIES) {
  assert.equal(router.route({ capability })?.expertId, PICASSO_EXPERT_ID);
}
for (const capability of [
  "combat_strategy",
  "mission_progression",
  "npc_control",
  "world_mutation",
  "physics",
  "collision",
  "economy",
  "save_state",
  "multiplayer_sync",
]) {
  assert.equal(router.route({ capability }), null, capability);
  assert.throws(() => router.request({ capability }), /No visual-only/);
}
assert.throws(() => router.dispatchGameplay(), /no gameplay dispatch authority/i);

Picasso.reset();
const context = { biome: "wetlands", boss: "wetlands_drowned_tremor" };
const animeA = Picasso.generateTheme("anime", context);
const animeB = Picasso.generateTheme("anime", { boss: context.boss, biome: context.biome });
assert.strictEqual(animeA, animeB, "cached theme should reuse the frozen profile");
assert.equal(animeA.diffusionPerFrame, false);
assert.ok(Object.isFrozen(animeA));
assert.notStrictEqual(animeA, Picasso.generateTheme("anime", { biome: "forest" }));
assert.equal(Picasso.generateCombatVFXProfile("anime").impactStyle, "anime-starburst");
assert.equal(Picasso.generateCombatVFXProfile("cinematic").impactStyle, "debris-bloom");
assert.notEqual(Picasso.generateCombatVFXProfile("alien_dream").trailStyle, Picasso.generateCombatVFXProfile("zeknova").trailStyle);

Picasso.configureDiffusion({
  async generateStyleTarget() {
    throw new Error("budget exceeded");
  },
});
const fallback = await Picasso.prepareTheme("anime", context);
assert.equal(fallback.source, "deterministic-shader-fallback");
assert.match(fallback.fallbackReason, /budget exceeded/);
Picasso.configureDiffusion(null);

const scene = new Group();
scene.fog = new FogExp2(0x000000, 0.001);
for (const name of [
  "player-character",
  "settlement-building",
  "wetlands_drowned_tremor-boss-arena",
  "forest_spore_cantor-boss_projectile",
  "highlands_arc_gunner-electric",
]) {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  mesh.name = name;
  scene.add(mesh);
}
const renderer = {
  isWebGLRenderer: true,
  toneMapping: 0,
  toneMappingExposure: 1,
  userData: {},
  info: { memory: { geometries: 5, textures: 0 } },
};
const canonicalGameplay = {
  mission: { id: "tremor", phase: 2 },
  physics: { gravity: 9.8 },
  collision: { enabled: true, shapes: 5 },
  combat: { hp: 100, damage: 12 },
  save: { slot: 1, checkpoint: "wetlands" },
  economy: { credits: 300 },
  multiplayer: { tick: 842, peers: ["alpha"] },
};
const game = { scene, renderer, canonicalGameplay, currentBiome: "wetlands" };
const before = structuredClone(canonicalGameplay);
const manager = new VisualThemeManager({ game, router }).init();
const compiledSignatures = new Set();
for (const theme of ["zeknova", "anime", "cartoon", "cinematic", "ultra_realistic", "alien_dream"]) {
  manager.setTheme(theme);
  const report = manager.compiledStyleReport();
  assert.equal(report.theme, theme);
  assert.ok(report.shaderFamily);
  compiledSignatures.add(JSON.stringify(report.postProcessing));
  if (theme === "anime" || theme === "cartoon" || theme === "alien_dream") assert.ok(report.outlinedMeshes > 0, `${theme} should install geometry outlines`);
  else assert.equal(report.outlinedMeshes, 0, `${theme} should not install geometry outlines`);
}
assert.equal(compiledSignatures.size, 6, "every Picasso style needs a distinct post-process signature");
assert.equal(new Set(Object.values(PICASSO_COMPILED_STYLES).map((style) => style.shaderFamily)).size, 6);
const sceneContext = createVisualSceneContext({ currentBiome: "wetlands", enemies: [{ visible: true }], player: { health: 80 } }, "anime");
assert.equal(sceneContext.biome, "wetlands");
assert.ok(sceneContext.combatIntensity > 0);
assert.deepEqual(canonicalGameplay, before, "theme switching cannot change gameplay state");
assert.deepEqual(manager.verticalSliceReport(), {
  player: 1,
  settlement: 1,
  drownedTremor: 1,
  sporeCantor: 1,
  arcGunner: 1,
  other: 0,
});
assert.equal(manager.compatibility().webgl2Fallback, true);
assert.equal(manager.compatibility().diffusionPerFrame, false);
assert.equal(manager.compatibility().combatVfx.beamStyle, "iridescent-ribbon");
assert.equal(manager.compatibility().compiledStyle.appearanceOnly, true);
assert.ok(manager.costMetadata("alien_dream").gpuCost >= manager.costMetadata("zeknova").gpuCost);
const selectedTheme = manager.activeThemeId();
const adaptiveVisual = manager.setAdaptiveQuality("Performance", { outlineScale: .32, postScale: .35, splatScale: .25, particleScale: .45 });
assert.equal(manager.activeThemeId(), selectedTheme, "adaptive quality cannot change the selected art direction");
assert.equal(adaptiveVisual.appearanceOnly, true);
assert.equal(manager.adaptiveReport().selectedThemePreserved, true);
assert.deepEqual(canonicalGameplay, before, "adaptive visual scaling cannot change gameplay state");
assert.equal(manager.splatLayer.userData.authoritativeGeometry, false);
assert.equal(manager.splatLayer.userData.collisionEnabled, false);
const splat = manager.addSplatScenery(new Group());
assert.equal(splat.userData.sceneryOnly, true);
assert.equal(splat.userData.authoritativeGeometry, false);
assert.equal(splat.userData.collisionEnabled, false);

console.log("Picasso R0 visual expert tests passed.");
