import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { BIOMES, biomeAt } from "../src/world/Biomes.js";
import { buildingCollisionRadius, enemyCollisionRadius, SpatialHash } from "../src/world/Collision.js";
import { ENEMY_PROFILES } from "../src/game/Enemies.js";
import { BOSS_ATTACK_PROFILES, BOSS_CONFIGS, BOSS_DEFENSE_PROFILES, BOSS_STRATEGIC_MECHANICS, bossAttackTiming, bossDefenseProfile, scaledBossDamage } from "../src/game/BossSystem.js";
import { CAMPAIGN_TIERS, MISSION_OBJECTIVES, createCampaignTiers, missionBuildObjectives, missionReadyForBoss, objectiveComplete } from "../src/game/Missions.js";
import { miningCooldown, rankGoal } from "../src/game/Player.js";
import { MECH_ASSIST_PROFILES, mechAssistPriority, mechAssistProfile } from "../src/game/MechAssist.js";
import { HUMAN_BUILDINGS, HUMAN_BUILDING_TYPES, buildingUnlocked } from "../src/game/Buildings.js";
import { sampleHeightGrid } from "../src/world/Terrain.js";
import { createWorldId, createHumanFactionId, createSettlementFactionId } from "../src/world/FactionIdentity.js";
import { createSettlementEntityId, createStructureEntityId } from "../src/world/EntityIdentity.js";
import { PERCEPTION_EVENT_CONTRACT_ID, PERCEPTION_EVENT_TYPES } from "../src/world/PerceptionEvent.js";
import { KNOWLEDGE_LEDGER_CONTRACT_ID, KNOWLEDGE_TOPICS } from "../src/world/FactionKnowledgeLedger.js";
import { FACTION_OBSERVATION_CONTRACT_ID, PRIME_OBSERVATION_FEATURE_COUNT, PRIME_OBSERVATION_FEATURE_LAYOUT_ID } from "../src/world/FactionObservation.js";
import { OBSERVATION_LEGALITY_CONTRACT_ID, OBSERVATION_ACTION_COUNT, OBSERVATION_ACTION_SPACE_ID } from "../src/world/ObservationLegality.js";
import { FOREST_DEFENSIVE_ACTION_CONTRACT_ID, FOREST_DEFENSIVE_ACTION_SPACE_ID, FOREST_DEFENSIVE_ACTION_COUNT, FOREST_DEFENSIVE_ROOT_STANCE, FOREST_DEFENSIVE_AUTHORITY } from "../src/world/ForestDefensiveActions.js";
import { PRIME_SHADOW_CONTRACT_ID, PRIME_SHADOW_ENGINE_ID, PRIME_SHADOW_FEATURE_COUNT, PRIME_SHADOW_MODE, PRIME_SHADOW_AUTHORITY } from "../src/world/PrimeShadow.js";
import { LIVE_PARITY_CONTRACT_ID, LIVE_PARITY_SPACE_ID, LIVE_PARITY_MODE, LIVE_PARITY_AUTHORITY, LIVE_PARITY_ACTION_COUNT } from "../src/world/LiveParity.js";
import { FOREST_DEFENSIVE_COMMAND_CONTRACT_ID, FOREST_DEFENSIVE_COMMAND_SPACE_ID, FOREST_DEFENSIVE_COMMAND_MODE, FOREST_DEFENSIVE_COMMAND_AUTHORITY, FOREST_DEFENSIVE_COMMAND_ACTIONS } from "../src/world/ForestDefensiveCommands.js";
import { FOREST_DEFENSIVE_COMMAND_V2_CONTRACT_ID, FOREST_DEFENSIVE_COMMAND_V2_SPACE_ID, FOREST_DEFENSIVE_COMMAND_V2_MODE, FOREST_DEFENSIVE_COMMAND_V2_AUTHORITY, FOREST_DEFENSIVE_COMMAND_V2_ACTIONS } from "../src/world/ForestDefensiveCommandsV2.js";
import { LIVE_PARITY_CLOSURE_CONTRACT_ID, LIVE_PARITY_CLOSURE_SPACE_ID, LIVE_PARITY_CLOSURE_MODE, LIVE_PARITY_CLOSURE_AUTHORITY, LIVE_PARITY_CLOSURE_ACTION_COUNT } from "../src/world/LiveParityClosure.js";
import { FOREST_OBJECTIVE_SCENARIO_CONTRACT_ID, FOREST_OBJECTIVE_PROFILE_ID, FOREST_SCENARIO_CERTIFICATION_ID, FOREST_OBJECTIVE_SCENARIO_MODE, FOREST_OBJECTIVE_SCENARIO_AUTHORITY, FOREST_OBJECTIVE_SCENARIO_COUNT } from "../src/world/ForestObjectiveScenarios.js";
import { SENTINEL_PRIME_POLICY_EVALUATION_CONTRACT_ID, SENTINEL_PRIME_POLICY_EVALUATION_ID, SENTINEL_PRIME_POLICY_EVALUATION_MODE, SENTINEL_PRIME_POLICY_EVALUATION_AUTHORITY, SENTINEL_PRIME_POLICY_COUNT, SENTINEL_PRIME_EVALUATION_SCENARIO_COUNT } from "../src/world/SentinelPrimePolicyEvaluation.js";
import { MIN_AVAILABLE_MISSION_ORE_PER_BIOME, ORE_RESPAWN_MAX_MS, ORE_RESPAWN_MIN_MS, oreReadyToRespawn, oreRespawnDelayMs, reconcileLegacyBiomeMining } from "../src/world/OreRegeneration.js";
import { RESIDENTS_PER_VILLAGE, RESIDENT_GRID_CELL_SIZE, RESIDENT_HIGH_QUALITY_LIMIT, RESIDENT_MODEL_REFRESH_SECONDS, RESIDENT_VISIBLE_DISTANCE, TRAVELERS_PER_BIOME, residentMode, residentPersonalSpace, residentSeparationWeight } from "../src/game/Residents.js";
import { GAMEPLAY_STATE_COUNT, GAMEPLAY_STATES, createGameplayProgress, gameplayStateUrls, parseGameplayState } from "../src/game/GameplayStates.js";
import { BOSS_VISUAL_IDENTITIES, PICASSO_CERTIFICATION_AUTHORITY, ROLE_COMBAT_SIGNATURES, WEAK_POINT_STATES, IMPACT_READABILITY, certifyCombatIdentityData } from "../src/game/PicassoCombatCertification.js";

const runtimeSource = readFileSync(new URL("../assets/index-02987539.js", import.meta.url), "utf8");
const bossCombatSource = readFileSync(new URL("../src/game/BossCombat.js", import.meta.url), "utf8");

assert.equal(BIOMES.length, 5);
assert.equal(HUMAN_BUILDING_TYPES.length, 17);   // the dev tree has no AI Research Lab; medallion does
assert.equal(buildingUnlocked("hospital", "ensign"), false);
assert.equal(buildingUnlocked("hospital", "lieutenant"), true);
assert.equal(buildingUnlocked("stock_exchange", "lieutenant"), false);
assert.equal(buildingUnlocked("stock_exchange", "captain"), true);
assert.deepEqual(HUMAN_BUILDINGS.planetary_capitol.utilities, ["power", "water", "data"]);
assert.equal(biomeAt(-89).id, "forest");
assert.equal(biomeAt(89).id, "wetlands");
assert.equal(createCampaignTiers().flatMap((tier) => tier.missions).length, 12);
assert.equal(Object.keys(ENEMY_PROFILES).length, 5);
assert.equal(BOSS_CONFIGS.desert_sunscar_colossus.name, "The Sunscar Colossus");
assert.equal(BOSS_CONFIGS.desert_sunscar_colossus.biome, "desert");
assert.equal(Object.keys(BOSS_ATTACK_PROFILES).length, 12);
assert.equal(Object.keys(BOSS_DEFENSE_PROFILES).length, 12);
for (const config of Object.values(BOSS_CONFIGS)) {
  const defense = bossDefenseProfile(config);
  assert.ok(["dodge", "shield"].includes(defense.kind));
  assert.equal(defense.cooldown, 10);
  assert.ok(defense.damageFraction > 0 && defense.damageFraction <= 0.1);
  for (const phase of config.phases) {
    for (const pattern of phase.patterns) {
      const timing = bossAttackTiming(config, pattern, phase.id);
      assert.ok(timing.recovery >= 2 && timing.recovery <= 3, `${config.id}:${pattern} recovery must remain readable`);
      assert.ok(timing.cooldown > timing.recovery);
      assert.ok(timing.maxCarryover >= 20);
    }
  }
}
assert.deepEqual(BOSS_CONFIGS.desert_sunscar_colossus.phases.map((phase) => phase.patterns), [
  ["sunscar_fastball", "sunscar_focused_charge", "sunscar_shockwave"],
  ["sunscar_double_fastball", "sunscar_focused_charge", "sunscar_meteor_ring"],
  ["sunscar_fastball_barrage", "sunscar_focused_overcharge", "sunscar_finale"],
]);
// Raised with the Boss 1 difficulty pass (BOSS_DAMAGE_MULTIPLIERS 1.6 / 2.0 / 2.5).
assert.equal(scaledBossDamage(10, "phase_1"), 16);
assert.equal(scaledBossDamage(10, "phase_2"), 20);
assert.equal(scaledBossDamage(10, "phase_3"), 25);
assert.equal(BOSS_CONFIGS.wetlands_mire_siren.name, "The Mire Siren");
assert.equal(BOSS_CONFIGS.wetlands_mire_siren.biome, "wetlands");
assert.deepEqual(BOSS_CONFIGS.wetlands_mire_siren.phases.map((phase) => phase.patterns.length), [3, 3, 3]);
assert.equal(BOSS_CONFIGS.highlands_stormback.name, "The Stormback");
assert.equal(BOSS_CONFIGS.highlands_stormback.biome, "highlands");
assert.deepEqual(BOSS_CONFIGS.highlands_stormback.phases.map((phase) => phase.patterns.length), [3, 3, 3]);
assert.equal(BOSS_CONFIGS.arctic_white_screecher.name, "The White Screecher");
assert.equal(BOSS_CONFIGS.arctic_white_screecher.biome, "arctic");
assert.equal(BOSS_CONFIGS.arctic_white_screecher.scaleMultiplier, 2.4);
assert.equal(BOSS_CONFIGS.arctic_white_screecher.healthMultiplier, 18);
assert.deepEqual(BOSS_CONFIGS.arctic_white_screecher.phases.map((phase) => phase.patterns), [
  ["screecher_frost_fan", "screecher_strafing_run", "screecher_cryo_ring"],
  ["screecher_whiteout_spiral", "screecher_hail_marks", "screecher_ice_lanes"],
  ["screecher_blizzard_dive", "screecher_sky_barrage", "screecher_finale"],
]);
assert.equal(BOSS_CONFIGS.wetlands_drowned_tremor.name, "The Drowned Tremor");
assert.equal(BOSS_CONFIGS.wetlands_drowned_tremor.biome, "wetlands");
assert.deepEqual(BOSS_CONFIGS.wetlands_drowned_tremor.phases.map((phase) => phase.patterns), [
  ["tremor_mud_burst", "tremor_pressure_fan", "tremor_aerial_burst"],
  ["tremor_aerial_pinball", "tremor_shockwave", "tremor_descending_lanes"],
  ["tremor_breach_charge", "tremor_deluge", "tremor_aerial_pinball"],
]);
assert.match(runtimeSource, /this\.config\?\.id!=="highlands_stormback"/, "only Stormback may remain at the player's encounter location");
assert.match(runtimeSource, /area\.id!==nextMission\.biome&&nextMission\.id!=="tower-one"/, "only tower-one may bypass the boss biome gate");
assert.ok(runtimeSource.indexOf("this.pool.active.length>245") < runtimeSource.indexOf("this.pool.active.length>Math.min(timing.maxCarryover,220)"), "emergency projectile cleanup must be reachable");
assert.match(bossCombatSource, /missionReadyForBoss\(mid, permanentContext\)/, "boss replay order must preserve permanent mission gates");
/* Campaign v8 is planetary: every mission delivers ONE project to ALL FIVE
   biomes (five preparation rows, then five construction rows), so the per-biome
   objectives these checks used to name no longer exist. The supply route is now
   a Planetary Transit Hub in every AO rather than a single Wetland crossing, and
   the ZekNovan aid objective moved off `habitat` onto the two missions that
   actually ask for reconciliation. The contract being checked is unchanged —
   the route is buildable planet-wide, and a live ZekNovan project still
   completes an aid objective — only the mission it hangs on has moved. */
const supplyRouteBuilds = MISSION_OBJECTIVES["supply-route"].filter((objective) => objective.kind === "biomeBuilding" && objective.key === "transit");
assert.equal(supplyRouteBuilds.length, 5, "the supply route must reach every biome");
assert.deepEqual(supplyRouteBuilds.map((objective) => objective.biome).sort(), ["arctic", "desert", "forest", "highlands", "wetlands"]);
assert.equal(MISSION_OBJECTIVES["supply-route"].some((objective) => objective.kind === "biomeStat" && objective.key === "treesChopped"), false);
/* AT MOST ONE AID PROJECT PER MISSION — this is the cooldown guarantee.
   Every aid build starts a 3-10 minute cooldown. Two missions used to ask for
   aid in all five biomes, so completing either meant up to fifty minutes of
   waiting. If a future edit clusters them again this assertion is what
   catches it. */
const aidObjectivesFor = (missionId) => (MISSION_OBJECTIVES[missionId] ?? [])
  .filter((objective) => objective.kind === "biomeEither" && objective.keys.includes("zek_grove"));

let totalAid = 0;
for (const missionId of Object.keys(MISSION_OBJECTIVES)) {
  const aid = aidObjectivesFor(missionId);
  assert.ok(aid.length <= 1, `${missionId} asks for ${aid.length} aid projects; the cooldown allows one per mission`);
  totalAid += aid.length;
  for (const objective of aid) {
    assert.equal(
      objectiveComplete(objective, { biomes: { [objective.biome]: { buildings: { zek_grove: 1 } } } }),
      true,
      `a live ZekNovan project must complete ${missionId}'s ${objective.biome} aid objective`
    );
  }
}
assert.ok(totalAid >= 4, `the campaign must still ask for reconciliation; found ${totalAid} aid projects`);
assert.match(runtimeSource, /OPEN ZEKNOVAN AID/);
assert.match(runtimeSource, /Hostile tension does not prevent construction/);
for (const [missionId, objectives] of Object.entries(MISSION_OBJECTIVES)) {
  const bossObjective = objectives.find((objective) => objective.kind === "boss");
  const config = BOSS_CONFIGS[bossObjective?.bossId];
  assert.ok(bossObjective, `${missionId} must have a boss objective`);
  assert.equal(bossObjective.biome, config.biome, `${missionId} boss objective must use its authoritative biome`);
  assert.match(bossObjective.label, new RegExp(`Travel to ${config.biome[0].toUpperCase()}${config.biome.slice(1)} AO to start the boss fight`));
}
assert.match(runtimeSource, /nextCommissioningAutoTriggerAt/, "commissioning must autotrigger from the regular simulation loop");
assert.match(runtimeSource, /WORLD_JUGGERNAUT_RESPAWN_MS=3\*60\*60\*1000/);
assert.match(runtimeSource, /WORLD_JUGGERNAUTS_PER_BIOME=2/);
assert.match(runtimeSource, /\["forest","desert","highlands","arctic","wetlands"\]/);
assert.match(runtimeSource, /world-juggernaut-\$\{biome\}-\$\{index\+1\}/);
assert.match(runtimeSource, /slot\.respawnAt=now\+WORLD_JUGGERNAUT_RESPAWN_MS/);
assert.match(runtimeSource, /spawnedForCommissioning=false/);
assert.match(runtimeSource, /zkJuggernautRoleSpawn\.call\(game,true,"juggernaut"\)/, "world Juggernauts must bypass ambient cap and heavy-unit uniqueness rules");
assert.match(runtimeSource, /enemy\.position\.x=He\(enemy\.position\.x,minX,maxX\)/, "world Juggernauts must remain distributed in their assigned biome bands");
assert.match(runtimeSource, /label:"perimeter patrol"/);
assert.match(runtimeSource, /label:"tree-line reconnaissance"/);
assert.match(runtimeSource, /label:"infrastructure raid"/);
assert.match(runtimeSource, /label:"ridge overwatch"/);
assert.match(runtimeSource, /label:"aerial survey"/);
assert.match(runtimeSource, /label:"mineral prospecting"/);
assert.match(runtimeSource, /offsets=\[0,\.55,-\.55,1\.05,-1\.05,1\.65,-1\.65,Math\.PI\]/, "activity steering must probe alternate headings and bounce backward");
assert.match(runtimeSource, /data\.activityStuckFor>2\.4/, "activity locomotion must recover stuck units");
assert.match(runtimeSource, /zkPicassoProjectileFamilies=Object\.freeze\(\["orb","cone","prism","beam","lance","disc","shard","spike","ring","wave_slash","segmented_trail","energy_wall"\]\)/, "Picasso combat must expose twelve readable silhouette families");
assert.match(runtimeSource, /zkPicassoStyleBossProjectile/, "boss projectiles must be restyled without replacing their authoritative projectile records");
assert.match(runtimeSource, /bossProjectilePoolLimit/, "Picasso combat must expose pool and cap diagnostics");
assert.match(runtimeSource, /zkLastMeasuredFps/, "Picasso QA must expose the adaptive renderer's measured FPS");
assert.match(runtimeSource, /zeknova-picasso-combat-qa/, "local QA must expose combat pool and memory telemetry");
assert.match(runtimeSource, /expensiveLights:0/, "combat refinement must not allocate per-projectile lights");
assert.match(runtimeSource, /ENSIGN SOLAR REPULSOR/, "the Ensign signature beam must expose a charge telegraph");
assert.match(runtimeSource, /zkApplyEnsignBeamGameplay/, "Ensign knockback must remain in game-owned logic outside Picasso's R0 profile");
assert.match(runtimeSource, /enemy\.userData\.isMissionBoss\?1\.8:5\.4/, "the Ensign beam must visibly push regular attackers farther than bosses");
assert.equal(Object.keys(ROLE_COMBAT_SIGNATURES).length, 9, "Picasso must expose nine non-interchangeable role signatures");
assert.equal(Object.keys(BOSS_VISUAL_IDENTITIES).length, 12, "every boss must have an encounter identity profile");
assert.deepEqual(WEAK_POINT_STATES, ["CLOSED", "OPENING", "ACTIVE", "HIT", "CLOSING"]);
assert.equal(Object.keys(IMPACT_READABILITY).length, 7);
assert.equal(certifyCombatIdentityData().pass, true);
assert.equal(PICASSO_CERTIFICATION_AUTHORITY.CURRENT_AUTHORITY, "R0_VISUAL");
for (const [key, value] of Object.entries(PICASSO_CERTIFICATION_AUTHORITY)) if (key.startsWith("CAN_")) assert.equal(value, false, key);
assert.match(runtimeSource, /zkPicassoReadabilityAuthority/);
assert.match(runtimeSource, /originalDuration/);
assert.match(runtimeSource, /telegraphDurationChanges/);
assert.match(runtimeSource, /maximumCriticalEmphasis:2/);
assert.match(runtimeSource, /maximumHighEmphasis:4/);
assert.match(runtimeSource, /zeknova-picasso-readability-qa/);
assert.match(runtimeSource, /gameplayStateDivergenceCount/);
assert.match(runtimeSource, /perProjectileDynamicLights:0/);
assert.match(runtimeSource, /active=this\.enemies\.filter\(enemy=>Number\(enemy\.userData\.health\)>0&&!enemy\.userData\.worldJuggernautSlot&&!enemy\.userData\.commissioningId&&!enemy\.userData\.isMissionBoss\)/, "persistent and mission units must not suppress diverse ambient groups");
assert.match(runtimeSource, /if\(role==="juggernaut"\)zkJuggernautRoleSpawn\.call\(game,true,"juggernaut"\)/, "commissioning must still spawn its Juggernaut alongside the persistent roster");
assert.match(runtimeSource, /area\.id==="highlands"&&st\.defeatedIds\.length<3\)spawnCommissioningGroup/, "commissioning autotrigger must activate in Highlands");
assert.doesNotMatch(runtimeSource, /game\.terrain\.heightAt\(x,z\)<=17/, "Highlands commissioning spawns must not reject valid elevated terrain");
assert.match(runtimeSource, /st\.defeatedIds\.indexOf\(stableId\)!==-1\) continue/, "defeated commissioning attackers must never respawn while filling a partial trio");
assert.equal(miningCooldown("ensign"), 10);
assert.equal(Object.keys(MECH_ASSIST_PROFILES).length, 3);
assert.equal(mechAssistProfile("captain").damage, 22);
assert.equal(mechAssistPriority({ bossActive: true }), "boss");
assert.equal(mechAssistPriority({ hostileDistance: 8 }), "hostile");
assert.equal(mechAssistPriority({ oreDistance: 6 }), "ore");
assert.equal(mechAssistPriority({ treeDistance: 6 }), "tree");
assert.equal(rankGoal("lieutenant").missions, 8);
assert.equal(buildingCollisionRadius("power"), 1.55);
assert.equal(buildingCollisionRadius("zek_beacon"), 1.45);
assert.equal(buildingCollisionRadius("zek_transit"), 2.15);
assert.equal(enemyCollisionRadius("juggernaut"), 1.75);
assert.equal(objectiveComplete({ kind: "building", key: "power", target: 1 }, { power: 1 }), true);
assert.equal(sampleHeightGrid(new Float32Array([0, 10, 20, 30]), 2, 2, 0, 0), 15);
const hash = new SpatialHash(8), marker = { id: "marker" };
hash.insert(marker, 7.5, 3, 2);
assert.equal(hash.query(2, 3, 1).has(marker), true);
hash.remove(marker);
assert.equal(hash.query(7.5, 3, 2).has(marker), false);
assert.equal(createWorldId({ teamCode: "forest-alpha", biomeSeed: 5207 }), "zkid:v1:world:FOREST-ALPHA:5207");
const identityWorld = createWorldId({ teamCode: "forest-alpha", biomeSeed: 5207 });
assert.equal(createHumanFactionId({ teamCode: "FOREST-ALPHA" }), "zkid:v1:faction:human:FOREST-ALPHA");
assert.notEqual(
  createSettlementFactionId({ worldId: identityWorld, settlementOrdinal: 0 }),
  createSettlementFactionId({ worldId: identityWorld, settlementOrdinal: 1 })
);
assert.match(createSettlementEntityId({ worldId: identityWorld, settlementOrdinal: 0 }), /^zkid:v1:entity:settlement:/);
assert.equal(
  createStructureEntityId({ worldId: identityWorld, recordId: "power-1" }),
  "zkid:v1:entity:structure:FOREST-ALPHA:5207:power-1"
);
assert.equal(PERCEPTION_EVENT_CONTRACT_ID, "zeknova-perception-event-contract-v1");
assert.equal(PERCEPTION_EVENT_TYPES.length, 10);
assert.equal(KNOWLEDGE_LEDGER_CONTRACT_ID, "zeknova-knowledge-ledger-contract-v1");
assert.equal(KNOWLEDGE_TOPICS.length, 6);
assert.equal(FACTION_OBSERVATION_CONTRACT_ID, "zeknova-faction-observation-contract-v1");
assert.equal(PRIME_OBSERVATION_FEATURE_LAYOUT_ID, "zeknova-prime-observation-layout-v1");
assert.equal(PRIME_OBSERVATION_FEATURE_COUNT, 592);
assert.equal(OBSERVATION_LEGALITY_CONTRACT_ID, "zeknova-observation-legality-contract-v1");
assert.equal(OBSERVATION_ACTION_SPACE_ID, "zeknova-observation-action-space-v1-development");
assert.equal(OBSERVATION_ACTION_COUNT, 6);
assert.equal(FOREST_DEFENSIVE_ACTION_CONTRACT_ID, "zeknova-forest-defensive-action-contract-v1");
assert.equal(FOREST_DEFENSIVE_ACTION_SPACE_ID, "zeknova-forest-defensive-action-space-v1");
assert.equal(FOREST_DEFENSIVE_ACTION_COUNT, 13);
assert.equal(FOREST_DEFENSIVE_ROOT_STANCE, "defensive");
assert.equal(FOREST_DEFENSIVE_AUTHORITY, "read-only-planning-no-action-execution");
assert.equal(PRIME_SHADOW_CONTRACT_ID, "zeknova-prime-shadow-contract-v1");
assert.equal(PRIME_SHADOW_ENGINE_ID, "sentinel-prime-root-puct-v1-development");
assert.equal(PRIME_SHADOW_FEATURE_COUNT, 592);
assert.equal(PRIME_SHADOW_MODE, "shadow-only");
assert.equal(PRIME_SHADOW_AUTHORITY, "none-no-action-execution");
assert.equal(LIVE_PARITY_CONTRACT_ID, "zeknova-live-parity-contract-v1");
assert.equal(LIVE_PARITY_SPACE_ID, "zeknova-forest-defensive-live-parity-v1");
assert.equal(LIVE_PARITY_MODE, "measurement-only");
assert.equal(LIVE_PARITY_AUTHORITY, "none-no-action-execution");
assert.equal(LIVE_PARITY_ACTION_COUNT, 13);
assert.equal(FOREST_DEFENSIVE_COMMAND_CONTRACT_ID, "zeknova-forest-defensive-command-contract-v1");
assert.equal(FOREST_DEFENSIVE_COMMAND_SPACE_ID, "zeknova-forest-defensive-command-space-v1");
assert.equal(FOREST_DEFENSIVE_COMMAND_MODE, "live-incumbent-command-runtime");
assert.equal(FOREST_DEFENSIVE_COMMAND_AUTHORITY, "incumbent-scripted-ai");
assert.deepEqual(FOREST_DEFENSIVE_COMMAND_ACTIONS, [1, 3, 12]);
assert.equal(FOREST_DEFENSIVE_COMMAND_V2_CONTRACT_ID, "zeknova-forest-defensive-command-contract-v2");
assert.equal(FOREST_DEFENSIVE_COMMAND_V2_SPACE_ID, "zeknova-forest-defensive-command-space-v2");
assert.equal(FOREST_DEFENSIVE_COMMAND_V2_MODE, "live-incumbent-command-runtime");
assert.equal(FOREST_DEFENSIVE_COMMAND_V2_AUTHORITY, "incumbent-scripted-ai");
assert.deepEqual(FOREST_DEFENSIVE_COMMAND_V2_ACTIONS, Array.from({ length: 13 }, (_, index) => index));
assert.equal(LIVE_PARITY_CLOSURE_CONTRACT_ID, "zeknova-live-parity-closure-contract-v1");
assert.equal(LIVE_PARITY_CLOSURE_SPACE_ID, "zeknova-forest-defensive-live-parity-closure-v1");
assert.equal(LIVE_PARITY_CLOSURE_MODE, "measurement-only-parity-closure");
assert.equal(LIVE_PARITY_CLOSURE_AUTHORITY, "none-no-action-execution");
assert.equal(LIVE_PARITY_CLOSURE_ACTION_COUNT, 13);
assert.equal(FOREST_OBJECTIVE_SCENARIO_CONTRACT_ID, "zeknova-forest-objective-scenario-contract-v1");
assert.equal(FOREST_OBJECTIVE_PROFILE_ID, "zeknova-forest-defensive-objective-v1");
assert.equal(FOREST_SCENARIO_CERTIFICATION_ID, "zeknova-forest-defensive-scenario-certification-v1");
assert.equal(FOREST_OBJECTIVE_SCENARIO_MODE, "evaluation-only-no-live-command-execution");
assert.equal(FOREST_OBJECTIVE_SCENARIO_AUTHORITY, "none-no-live-command-execution");
assert.equal(FOREST_OBJECTIVE_SCENARIO_COUNT, 7);
assert.equal(SENTINEL_PRIME_POLICY_EVALUATION_CONTRACT_ID, "zeknova-sentinel-prime-policy-evaluation-contract-v1");
assert.equal(SENTINEL_PRIME_POLICY_EVALUATION_ID, "zeknova-sentinel-prime-policy-evaluation-v1");
assert.equal(SENTINEL_PRIME_POLICY_EVALUATION_MODE, "evaluation-only-policy-comparison-no-live-command-execution");
assert.equal(SENTINEL_PRIME_POLICY_EVALUATION_AUTHORITY, "none-no-live-command-execution");
assert.equal(SENTINEL_PRIME_POLICY_COUNT, 18);
assert.equal(SENTINEL_PRIME_EVALUATION_SCENARIO_COUNT, 7);
assert.equal(MIN_AVAILABLE_MISSION_ORE_PER_BIOME, 4);
assert.equal(RESIDENTS_PER_VILLAGE, 6);
assert.equal(TRAVELERS_PER_BIOME, 6);
assert.equal(RESIDENT_VISIBLE_DISTANCE, 52);
assert.equal(RESIDENT_HIGH_QUALITY_LIMIT, 12);
assert.equal(RESIDENT_MODEL_REFRESH_SECONDS, 2);
assert.equal(RESIDENT_GRID_CELL_SIZE, 5);
assert.equal(residentPersonalSpace("villager"), 3.8);
assert.equal(residentPersonalSpace("traveler"), 4.2);
assert.equal(residentSeparationWeight(1.5, 3), 0.5);
assert.equal(residentSeparationWeight(4, 3), 0);
const oreDelay = oreRespawnDelayMs("mission-ore-desert-0");
assert.ok(oreDelay >= ORE_RESPAWN_MIN_MS && oreDelay <= ORE_RESPAWN_MAX_MS);
assert.equal(oreRespawnDelayMs("mission-ore-desert-0"), oreDelay);
assert.equal(oreReadyToRespawn("mission-ore-desert-0", 10_000, 10_000 + oreDelay - 1), false);
assert.equal(oreReadyToRespawn("mission-ore-desert-0", 10_000, 10_000 + oreDelay), true);
const legacyRepair = reconcileLegacyBiomeMining({
  rocks: [
    { position: { x: -36, z: 0 }, userData: { rockId: "old-desert-ore-1" } },
    { position: { x: -35, z: 2 }, userData: { rockId: "old-desert-ore-2" } },
  ],
  minedRockIds: new Set(["old-desert-ore-1", "old-desert-ore-2"]),
  biomeAt: (x) => biomeAt(x),
  biomeStats: { desert: { rocksMined: 0 } },
});
assert.equal(legacyRepair.biomeStats.desert.rocksMined, 2);
assert.equal(residentMode({ bossActive: false, distanceToHome: 20 }), "roaming");
assert.equal(residentMode({ bossActive: false, distanceToHome: 20, returning: true }), "returning");
assert.equal(residentMode({ bossActive: true, distanceToHome: 20 }), "seeking-shelter");
assert.equal(residentMode({ bossActive: true, distanceToHome: 1 }), "sheltered");
assert.equal(residentMode({ bossActive: true, distanceToHome: 1, distanceToShelter: 3 }), "seeking-shelter");
assert.equal(residentMode({ bossActive: true, distanceToHome: 20, distanceToShelter: 0.5 }), "sheltered");
assert.equal(GAMEPLAY_STATE_COUNT, 12);
assert.equal(Object.keys(BOSS_STRATEGIC_MECHANICS).length, 12);
for (const config of Object.values(BOSS_CONFIGS)) {
  assert.ok(config.strategic?.objective, `${config.id} needs a strategic encounter objective`);
  assert.ok(config.strategic.targetTypes.length > 0, `${config.id} needs an infrastructure target`);
}
assert.equal(GAMEPLAY_STATES.length, 12);
assert.equal(GAMEPLAY_STATES[0].bossName, "The Sunscar Colossus");
assert.equal(GAMEPLAY_STATES[11].bossName, "The White Screecher");
// Derived from the campaign order rather than hard-coded, so reordering missions
// updates these instead of silently breaking them.
assert.equal(parseGameplayState("?mission=7")?.missionId, GAMEPLAY_STATES[6].missionId);
assert.equal(parseGameplayState("?boss=12")?.kind, "boss");
assert.equal(parseGameplayState("?state=mission-3")?.bossName, GAMEPLAY_STATES[2].bossName);
assert.deepEqual(
  { kind: parseGameplayState("??demo=1&mission=1&quality=high&boss=1")?.kind, number: parseGameplayState("??demo=1&mission=1&quality=high&boss=1")?.number },
  { kind: "boss", number: 1 },
);
assert.equal(parseGameplayState("?mission=1", { local: false }), null);
assert.equal(parseGameplayState("?boss=13"), null);
assert.equal(gameplayStateUrls().length, 24);
// Staging mission N credits every earlier boss and none of mission N's own.
const stagedMissionSeven = createGameplayProgress(parseGameplayState("?mission=7"));
assert.ok(stagedMissionSeven.bossDefeats[GAMEPLAY_STATES[5].missionId]);
assert.equal(stagedMissionSeven.bossDefeats[GAMEPLAY_STATES[6].missionId], undefined);
const stagedBossSeven = createGameplayProgress(parseGameplayState("?boss=7"));
assert.equal(stagedBossSeven.biomes[GAMEPLAY_STATES[6].biome].buildings.habitat, 1);
// Every ?boss=N stage must clear the boss gate, or QA cannot reach the fight.
for (let number = 1; number <= GAMEPLAY_STATE_COUNT; number += 1) {
  const state = parseGameplayState(`?boss=${number}`);
  const staged = createGameplayProgress(state);
  assert.ok(missionReadyForBoss(state.missionId, { buildings: {}, stats: {}, biomes: staged.biomes, bossDefeats: staged.bossDefeats }), `?boss=${number} (${state.missionId}) stages a colony that does not open the boss gate`);
}
assert.equal(stagedBossSeven.bossDefeats[GAMEPLAY_STATES[6].missionId], undefined);

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
assert.match(runtime, /communications",label:"Quantum Communications Hub"/);
assert.match(runtime, /war_economy",label:"War Economy Complex"/);
assert.match(runtime, /stock_exchange",label:"ZekNova Stock Exchange"/);
assert.match(runtime, /wR\.prototype\.updateHud=function\(state\)/);
assert.match(runtime, /MISSION CRISIS/);
assert.match(runtime, /PERMANENT SYSTEM UNLOCKED/);
assert.match(runtime, /nextInfrastructureStrikeAt/);
assert.match(runtime, /rebuildWorldObstacleIndexes/);
assert.match(runtime, /refreshUtilityRecords/);
assert.match(runtime, /zkEnemyAiStep=1\/15/);
const juggernautModelRuntime = readFileSync(new URL("../assets/model-runtime-c96327ba.js", import.meta.url), "utf8");
assert.match(juggernautModelRuntime, /zeknovan-juggernaut-run\.glb/, "Juggernaut must load the valid one-second run clip");
assert.doesNotMatch(juggernautModelRuntime, /zeknovan-juggernaut-run\.anim\.glb/, "Corrupt stripped Juggernaut animation must not be loaded");
assert.match(runtime, /model-runtime-c96327ba\.js\?v=animation-audit1/);
assert.match(runtime, /startGraphicsQualityMonitor/);
assert.match(runtime, /LIEUTENANT ENERGY ARMORY/);
assert.match(runtime, /CAPTAIN HEAVY ARMORY/);
assert.match(runtime, /if\(!zkWeaponProfiles\[id\]\)return/);
assert.doesNotMatch(runtime, /playCombatAnimation\?\.\("rifle"/);
assert.match(runtime, /holdPose\?\.\("carryHeavyWeapon"/);
assert.match(runtime, /recoilWeapon\?\.\("singularity"/);
assert.match(runtime, /model-runtime-c96327ba\.js\?v=rifle-brace1/);
assert.match(runtime, /new URLSearchParams\(location\.search\)\.get\("qaRank"\)/);
assert.match(runtime, /function zkAidCooldownMs\(project\)/);
assert.match(runtime, /He\(3\+Math\.round\(\(tension-10\)\*\.7\),3,10\)/);
assert.match(runtime, /zeknovanAidCooldownUntil:Number\(game\.zeknovanAidCooldownUntil\?\?0\)/);
assert.match(runtime, /ZekNovan aid crews unavailable/);
assert.match(runtime, /data-build-audience="zeknovan"/);
assert.match(runtime, /loadSunscarBossModel/);
assert.match(runtime, /loadMireSirenBossModel/);
assert.match(runtime, /loadStormbackBossModel/);
assert.match(runtime, /loadAncientThornwardenBossModel/);
// The model runtime must stay cache-busted, but pinning one token made this
// assertion rot on every bump - check for any token instead.
assert.match(runtime, /model-runtime-c96327ba\.js\?v=[\w.-]+/);
assert.match(runtime, /loadArchiveShadeBossModel/);
assert.match(runtime, /loadObsidianKnightBossModel/);
assert.match(runtime, /loadInsectKingBossModel/);
assert.match(runtime, /new Se\(\.26,12,8\)/);
assert.match(runtime, /sunscar_focused_charge/);
assert.match(runtime, /sunscar_fastball_barrage/);
assert.match(runtime, /chargeAtBoss:!0,hazardDamage:0/);
assert.match(runtime, /scaledBossDamage\(amount,this\.phase\?\.id\)/);
assert.match(runtime, /function zkMoveMireSirenBoss/);
assert.match(runtime, /function zkMoveStormbackBoss/);
assert.match(runtime, /function zkMoveThornwardenBoss/);
assert.match(runtime, /function zkMoveWhiteScreecherBoss/);
assert.match(runtime, /function zkMoveDrownedTremorBoss/);
assert.match(runtime, /siren_pulse_ring/);
assert.match(runtime, /watershed_high_ground_surge/);
assert.match(runtime, /stormback_charge/);
assert.match(runtime, /summit_lightning_strike/);
assert.match(runtime, /canopy_high_ground_roots/);
assert.match(runtime, /whiteout_high_ground_strike/);
assert.match(runtime, /screecher_blizzard_dive/);
assert.match(runtime, /screecher_sky_barrage/);
assert.match(runtime, /loadWhiteScreecherBossModel/);
assert.match(runtime, /loadDrownedTremorBossModel/);
assert.match(runtime, /tremor_breach_charge/);
assert.match(runtime, /drowned_high_ground_breach/);
assert.match(runtime, /enemy\.userData\.skipEnemyHqModel\|\|enemy\.userData\.isMissionBoss/);
assert.match(runtime, /!enemy\.userData\.skipEnemyHqModel&&!enemy\.userData\.isMissionBoss/);
assert.match(runtime, /boss\.userData\.bossHqModelName=model\.root\.name/);
assert.match(runtime, /genericModelLoaded:!!_s\.bossManager\.boss\.userData\.hqModel/);
assert.match(runtime, /model-runtime-c96327ba\.js\?v=resident-population8/);
assert.doesNotMatch(runtime, /model\.root\.position\.set\(0,0,0\),model\.root\.scale\.setScalar\(1\)/);
assert.match(runtime, /playAttack\?\.\(patternId\)/);
assert.match(runtime, /update\?\.\(delta,bossMoving,this\.phase\?\.id==="phase_3"\|\|this\.elapsed<Number\(this\.mireHuntUntil[\s\S]*?thornwardenAdvanceUntil/);
assert.match(runtime, /burst&&distance>3\.6/);
assert.match(runtime, /e\.userData\.aoId\?\?zkAOAt\(e\.position\.x,e\.position\.z\)\?\.id/);
assert.match(runtime, /Diplomatic incident: \$\{t\.title\}/);
assert.match(runtime, /const zkBiomeAtmosphere=/);
assert.match(runtime, /updateBiomeAtmosphere/);
assert.match(runtime, /function zkWeaponAimPoint\(target\)/);
assert.match(runtime, /target\.getObjectByName\?\.\("bossWeakPoint"\)/);
assert.match(runtime, /Math\.hypot\(dx,dz\)-physicalRadius<=Number\(range\)/);
assert.match(runtime, /terrainFollow:!0,heightOffset:height/);
assert.match(runtime, /phaseSpeed=manager\.phase\?\.id==="phase_3"\?4\.3/);
assert.match(runtime, /solar_high_ground_lance/);
assert.match(runtime, /document\.documentElement\.classList\.add\("zk-boss-active"\)/);
assert.match(runtime, /hud\.parentElement!==document\.body&&document\.body\.append\(hud\)/);
assert.match(runtime, /hud\.classList\.add\("boss-hit"\)/);
assert.match(runtime, /ensureBiomeMissionMines/);
assert.match(runtime, /refreshOreFormations/);
assert.match(runtime, /residentNPCs/);
assert.match(runtime, /setResidentsSheltering/);
assert.match(runtime, /zkResidentBiomeRoutes/);
assert.match(runtime, /residentPostBossUntil/);
assert.match(runtime, /qaNoBoss/);
assert.match(runtime, /zkQaIsolatedBossApplyShared/);
assert.match(runtime, /loadResidentHighQualityModel/);
assert.match(runtime, /RESIDENT_HIGH_QUALITY_LIMIT/);
assert.match(runtime, /fallbackVisible/);
assert.match(runtime, /resident-population8/);
assert.match(runtime, /zkResidentCrowdGrid/);
assert.match(runtime, /zkResidentSeparation/);
assert.match(runtime, /const shelterSlots=new Map/);
// Residents disperse to the map edge during a boss fight rather than ringing the
// village; the tighter ring spacing is what stops them stacking into one blob.
assert.match(runtime, /ring\*1\.25/);
assert.match(runtime, /resident\.scale\.setScalar\(residentScale\)/);
assert.match(runtime, /resident\.visible=mode!=="sheltered"/);
assert.match(runtime, /this\.bossManager\?\.active&&this\.setResidentsSheltering\(!0\)/);
assert.match(runtime, /rockMinedAt:\{\.\.\.\(game\.missionStats\?\.rockMinedAt/);
assert.match(runtime, /parseGameplayState/);
assert.match(runtime, /createGameplayProgress/);
assert.match(runtime, /data-qa-gameplay-state/);
assert.match(runtime, /QA \$\{state\.kind\.toUpperCase\(\)\}/);
assert.match(runtime, /startEncounter\(\{missionId:state\.missionId,force:!0\}\)/);
assert.match(runtime, /this\.qaGameplayState\?Promise\.resolve\(\{qa:!0,isolated:!0\}\)/);

const gameplayStateGuide = readFileSync(new URL("../docs/QA_GAMEPLAY_STATES.md", import.meta.url), "utf8");
assert.match(gameplayStateGuide, /mission=1/);
assert.match(gameplayStateGuide, /mission=12/);
assert.match(gameplayStateGuide, /boss=1/);
assert.match(gameplayStateGuide, /boss=12/);

const multiplayerApi = readFileSync(new URL("../api/multiplayer.php", import.meta.url), "utf8");
assert.match(multiplayerApi, /zeknovanAidCooldownUntil/);
assert.match(multiplayerApi, /10 \* 60 \* 1000/);
assert.match(multiplayerApi, /rockMinedAt/);
assert.match(multiplayerApi, /oreRespawnMinMs = 60 \* 60 \* 1000/);
assert.match(multiplayerApi, /oreRespawnMaxMs = 90 \* 60 \* 1000/);

const modelRuntime = readFileSync(new URL("../assets/model-runtime-c96327ba.js", import.meta.url), "utf8");
for (const rank of ["ensign", "lieutenant", "captain"]) {
  assert.match(modelRuntime, new RegExp(`${rank}: \\{[\\s\\S]*?voidsting:[\\s\\S]*?singularity:[\\s\\S]*?thunderclaw:`));
}
assert.match(modelRuntime, /weaponRig: 'lieutenant'/);
assert.match(modelRuntime, /weaponRig: 'captain'/);
assert.doesNotMatch(modelRuntime, /ensign-engineer-rifle-fire\.anim\.glb/);
assert.match(modelRuntime, /ensign-engineer-heavy-minigun\.anim\.glb/);
assert.match(modelRuntime, /createWeaponRecoilController/);
assert.match(modelRuntime, /holdPose\(name/);
assert.match(modelRuntime, /validateWeaponRig/);
assert.match(modelRuntime, /setCivilianPalette/);
assert.match(modelRuntime, /fastball\|pitch\|focus\|overcharge/);
for (const asset of [
  "boss-sunscar-colossus.glb",
  "boss-sunscar-colossus.high.glb",
  "boss-sunscar-colossus.medium.glb",
  "boss-sunscar-colossus.low.glb",
  "boss-sunscar-colossus-idle.anim.glb",
  "boss-sunscar-colossus-run.anim.glb",
  "boss-sunscar-colossus-slam.anim.glb",
  "boss-sunscar-colossus-throw.anim.glb",
]) {
  const url = new URL(`../assets/models/${asset}`, import.meta.url);
  assert.equal(existsSync(url), true, `${asset} is required by the Sunscar encounter`);
  assert.ok(statSync(url).size > 1_000, `${asset} must not be empty`);
}
assert.ok(statSync(new URL("../assets/models/boss-sunscar-colossus.glb", import.meta.url)).size < 6_000_000);
assert.match(modelRuntime, /boss-sunscar-colossus-idle\.anim\.glb/);
assert.match(modelRuntime, /boss-sunscar-colossus-run\.anim\.glb/);
assert.match(modelRuntime, /boss-sunscar-colossus-slam\.anim\.glb/);
assert.match(modelRuntime, /boss-sunscar-colossus-throw\.anim\.glb/);
for (const asset of [
  "boss-mire-siren.glb",
  "boss-mire-siren-run.anim.glb",
  "boss-mire-siren-slash.anim.glb",
  "boss-mire-siren-ritual.anim.glb",
]) {
  const url = new URL(`../assets/models/${asset}`, import.meta.url);
  assert.equal(existsSync(url), true, `${asset} is required by the Mire Siren encounter`);
  assert.ok(statSync(url).size > 1_000, `${asset} must not be empty`);
}
assert.ok(statSync(new URL("../assets/models/boss-mire-siren.glb", import.meta.url)).size < 1_000_000);
assert.match(modelRuntime, /boss-mire-siren-run\.anim\.glb/);
assert.match(modelRuntime, /boss-mire-siren-slash\.anim\.glb/);
assert.match(modelRuntime, /boss-mire-siren-ritual\.anim\.glb/);
for (const asset of [
  "boss-stormback.glb",
  "boss-stormback-idle.anim.glb",
  "boss-stormback-run.anim.glb",
  "boss-stormback-hook.anim.glb",
  "boss-stormback-slam.anim.glb",
  "boss-stormback-roar.anim.glb",
]) {
  const url = new URL(`../assets/models/${asset}`, import.meta.url);
  assert.equal(existsSync(url), true, `${asset} is required by the Stormback encounter`);
  assert.ok(statSync(url).size > 1_000, `${asset} must not be empty`);
}
assert.ok(statSync(new URL("../assets/models/boss-stormback.glb", import.meta.url)).size < 1_000_000);
assert.match(modelRuntime, /boss-stormback-idle\.anim\.glb/);
assert.match(modelRuntime, /boss-stormback-run\.anim\.glb/);
assert.match(modelRuntime, /boss-stormback-hook\.anim\.glb/);
assert.match(modelRuntime, /boss-stormback-slam\.anim\.glb/);
assert.match(modelRuntime, /boss-stormback-roar\.anim\.glb/);
for (const asset of [
  "boss-ancient-thornwarden.glb",
  "boss-ancient-thornwarden-idle.anim.glb",
  "boss-ancient-thornwarden-run.anim.glb",
  "boss-ancient-thornwarden-slam.anim.glb",
]) {
  const url = new URL(`../assets/models/${asset}`, import.meta.url);
  assert.equal(existsSync(url), true, `${asset} is required by the Ancient Thornwarden encounter`);
  assert.ok(statSync(url).size > 1_000, `${asset} must not be empty`);
}
assert.ok(statSync(new URL("../assets/models/boss-ancient-thornwarden.glb", import.meta.url)).size < 1_000_000);
assert.match(modelRuntime, /boss-ancient-thornwarden-idle\.anim\.glb/);
assert.match(modelRuntime, /boss-ancient-thornwarden-run\.anim\.glb/);
assert.match(modelRuntime, /boss-ancient-thornwarden-slam\.anim\.glb/);
for (const asset of [
  "boss-white-screecher.glb",
  "boss-white-screecher-run.anim.glb",
  "boss-white-screecher-judgment.anim.glb",
  "boss-white-screecher-combo.anim.glb",
  "boss-white-screecher-dive.anim.glb",
]) {
  const url = new URL(`../assets/models/${asset}`, import.meta.url);
  assert.equal(existsSync(url), true, `${asset} is required by the White Screecher encounter`);
  assert.ok(statSync(url).size > 1_000, `${asset} must not be empty`);
}
assert.ok(statSync(new URL("../assets/models/boss-white-screecher.glb", import.meta.url)).size < 1_000_000);
assert.match(modelRuntime, /boss-white-screecher-run\.anim\.glb/);
assert.match(modelRuntime, /boss-white-screecher-judgment\.anim\.glb/);
assert.match(modelRuntime, /boss-white-screecher-combo\.anim\.glb/);
assert.match(modelRuntime, /boss-white-screecher-dive\.anim\.glb/);
assert.match(modelRuntime, /whiteScreecherBossHighQualityModel/);
for (const asset of [
  "boss-drowned-tremor.glb",
  "boss-drowned-tremor-run.anim.glb",
  "boss-drowned-tremor-volley.anim.glb",
]) {
  const url = new URL(`../assets/models/${asset}`, import.meta.url);
  assert.equal(existsSync(url), true, `${asset} is required by the Drowned Tremor encounter`);
  assert.ok(statSync(url).size > 1_000, `${asset} must not be empty`);
}
assert.ok(statSync(new URL("../assets/models/boss-drowned-tremor.glb", import.meta.url)).size < 1_000_000);
assert.match(modelRuntime, /boss-drowned-tremor-run\.anim\.glb/);
assert.match(modelRuntime, /boss-drowned-tremor-volley\.anim\.glb/);
assert.match(modelRuntime, /drownedTremorBossHighQualityModel/);

const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
assert.match(mainSource, /IdentityIntegration/);
assert.match(mainSource, /W0-O\.0 identity capture/);
assert.match(mainSource, /PerceptionEventIntegration/);
assert.match(mainSource, /W0-O\.1 event capture/);
assert.match(mainSource, /FactionKnowledgeIntegration/);
assert.match(mainSource, /W0-O\.2 knowledge capture/);
assert.match(mainSource, /FactionObservationIntegration/);
assert.match(mainSource, /W0-O\.3 observation capture/);
assert.match(mainSource, /ObservationLegalityIntegration/);
assert.match(mainSource, /W0-O\.5 read-only mask capture/);
assert.match(mainSource, /ForestDefensiveActionIntegration/);
assert.match(mainSource, /W0-AF read-only action candidates/);
assert.match(mainSource, /PrimeShadowIntegration/);
assert.match(mainSource, /W0-O\.6 recommendations or action authority/);
assert.match(mainSource, /LiveParityIntegration/);
assert.match(mainSource, /W0-P parity evidence or action authority/);
assert.match(mainSource, /ForestDefensiveCommandIntegration/);
assert.match(mainSource, /W0-P\.2 full Forest command handlers or Sentinel authority/);
assert.match(mainSource, /ForestDefensiveCommandIntegrationV2/);
assert.match(mainSource, /LiveParityClosureIntegration/);
assert.match(mainSource, /W0-P\.3 exact command parity evidence/);
assert.match(mainSource, /ForestObjectiveScenarioIntegration/);
assert.match(mainSource, /Stage 1A-Z failure-possible scenario declarations/);
assert.match(mainSource, /SentinelPrimePolicyEvaluationIntegration/);
assert.match(mainSource, /Stage 1A-Z\.1 offline policy comparison/);

const environmentRuntime = readFileSync(new URL("../assets/environment-runtime.js", import.meta.url), "utf8");
assert.match(environmentRuntime, /visibilityBuckets/);
assert.match(environmentRuntime, /registerDistanceObject/);
assert.match(environmentRuntime, /setQuality\(tier\s*=\s*["']balanced["']\)/);
assert.match(environmentRuntime, /DESERT_GROUND_TILE_ASSETS/);
assert.match(environmentRuntime, /desert-ground\/sun-cracked-sandstone\.glb/);
assert.match(environmentRuntime, /desert-ground\/root-bound-path\.glb/);
assert.match(environmentRuntime, /desert-ground\/dry-vine-ground\.glb/);
assert.match(environmentRuntime, /desert-ground\/woven-mosaic\.glb/);
assert.match(environmentRuntime, /new InstancedMesh\(source\.geometry, source\.material, DESERT_GROUND_POOL_CAPACITY\)/);
assert.match(environmentRuntime, /DESERT_GROUND_TILES_ENABLED = true/);
assert.match(environmentRuntime, /DESERT_GROUND_SKIP_CHANCE = 0/);
assert.match(environmentRuntime, /DESERT_GROUND_POOL_CAPACITY = 256/);
assert.match(environmentRuntime, /STATIC_MESH_ASSETS_ENABLED = true/);
assert.match(environmentRuntime, /loadAsset\('coralGround'\)/);
assert.match(environmentRuntime, /loadAsset\('tieredStonePillar'\)/);
assert.match(environmentRuntime, /forestVillageLoadPromise = loadForestVillage\(\)/);
assert.match(environmentRuntime, /villageLoadPromise = loadArcticVillage\(\)/);
assert.match(environmentRuntime, /instances\.userData\.collisionRadius = 0/);
assert.match(environmentRuntime, /getDesertGroundStats\(\)/);

console.log("ZekNova source modules passed structural checks.");

// --- Campaign feasibility -------------------------------------------------
// Every mission must be finishable with the buildings the campaign itself asks
// the player to raise. `requirements` are cumulative colony-wide totals, so a
// target higher than the running build total strands the player with nothing
// left to construct - exactly what stalled the Desert missions when they asked
// for a Water Works the biome's terrain cannot host.
{
  const order = createCampaignTiers().flatMap((tier) => tier.missions);
  const colony = {}, perBiome = {};
  for (const item of order) {
    const rows = MISSION_OBJECTIVES[item.id];
    const biomes = new Set(rows.filter((row) => row.biome).map((row) => row.biome));
    assert.ok(biomes.size >= 1, `${item.id} has no biome scope`);
    assert.equal(rows.at(-1).kind, "boss", `${item.id} must end on its boss`);
    const builds = missionBuildObjectives(item.id);
    assert.ok(builds.length > 0, `${item.id} has no build objective, so its boss gate can never open`);
    for (const row of builds) {
      const scope = perBiome[row.biome] ??= {};
      const key = row.key ?? row.keys[0];
      const after = Math.max(scope[key] ?? 0, row.target);
      colony[key] = (colony[key] ?? 0) + (after - (scope[key] ?? 0));
      scope[key] = after;
    }
    for (const [key, need] of item.requirements) {
      assert.ok((colony[key] ?? 0) >= need, `${item.id} requires ${key} ${need} but the campaign only produces ${colony[key] ?? 0} by then`);
    }
    if (item.any.length) assert.ok(item.any.some(([key, need]) => (colony[key] ?? 0) >= need), `${item.id} any-requirement is unsatisfiable`);
  }
  assert.equal(new Set(order.map((item) => item.id)).size, 12);
  assert.equal(CAMPAIGN_TIERS[0].missions.length, 4, "Ensign infrastructure tier must contain missions 1-4");
  assert.equal(CAMPAIGN_TIERS[1].missions.length, 5, "Lieutenant civic tier must contain missions 5-9");
  assert.equal(CAMPAIGN_TIERS[2].missions.length, 3, "Captain corporate tier must contain missions 10-12");
}
