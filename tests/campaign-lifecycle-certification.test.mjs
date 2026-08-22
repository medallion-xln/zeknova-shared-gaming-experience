import assert from "node:assert/strict";
import {
  createCampaignTiers,
  missionReadyForBoss,
  objectiveComplete,
} from "../src/game/Missions.js";
import {
  BOSS_ENCOUNTER_STATES,
  BossEncounterDirector,
  activeCampaignMission,
  bossEncounterDecision,
} from "../src/game/BossEncounterDirector.js";
import {
  canGrantEncounterReward,
  encounterRewardId,
  missionBossConfig,
} from "../src/game/BossSystem.js";
import { resetRuntimeWorld } from "../src/game/GameReset.js";
import { BIOMES, biomeAt } from "../src/world/Biomes.js";

const BIOME_IDS = BIOMES.map((biome) => biome.id);
const MISSIONS = createCampaignTiers().flatMap((tier) => tier.missions);
const counters = { assertions: 0, wrongBiome: 0, duplicateBoss: 0, duplicateReward: 0, advancement: 0, restore: 0, reset: 0 };

function check(actual, expected, message) {
  counters.assertions += 1;
  assert.deepEqual(actual, expected, message);
}

function ok(value, message) {
  counters.assertions += 1;
  assert.ok(value, message);
}

function blankContext() {
  return {
    buildings: {},
    stats: {},
    biomes: Object.fromEntries(BIOME_IDS.map((id) => [id, { visited: false, resources: 0, stats: {}, buildings: {} }])),
    bossDefeats: {},
    claimedBossRewards: [],
    resources: { credits: 0, timber: 0, iron: 0 },
    activeBoss: null,
  };
}

function satisfy(objective, context) {
  const target = Number(objective.target || 1);
  if (objective.kind === "building") context.buildings[objective.key] = Math.max(target, Number(context.buildings[objective.key] || 0));
  else if (objective.kind === "either") context.buildings[objective.keys[0]] = Math.max(target, Number(context.buildings[objective.keys[0]] || 0));
  else if (objective.kind === "biomeVisit") context.biomes[objective.biome].visited = true;
  else if (objective.kind === "biomeResource") context.biomes[objective.biome].resources = Math.max(target, Number(context.biomes[objective.biome].resources || 0));
  else if (objective.kind === "biomeStat") context.biomes[objective.biome].stats[objective.key] = Math.max(target, Number(context.biomes[objective.biome].stats[objective.key] || 0));
  else if (objective.kind === "biomeBuilding") context.biomes[objective.biome].buildings[objective.key] = Math.max(target, Number(context.biomes[objective.biome].buildings[objective.key] || 0));
  else if (objective.kind === "biomeEither") context.biomes[objective.biome].buildings[objective.keys[0]] = Math.max(target, Number(context.biomes[objective.biome].buildings[objective.keys[0]] || 0));
  else if (objective.kind === "boss") context.bossDefeats[objective.missionId] = { missionId: objective.missionId, bossId: objective.bossId, rewardId: objective.rewardId };
}

function satisfyPrerequisites(mission, context) {
  for (const objective of mission.subObjectives.filter((row) => row.kind !== "boss")) satisfy(objective, context);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function commitReward(context, mission, seed) {
  const config = missionBossConfig(mission.id);
  const rewardId = encounterRewardId(mission.id, seed);
  if (!canGrantEncounterReward(context.claimedBossRewards, rewardId)) return false;
  context.claimedBossRewards.push(rewardId);
  context.resources.credits += config.rewards.credits;
  context.resources.timber += config.rewards.timber;
  context.resources.iron += config.rewards.iron;
  return true;
}

function wrongBiomeFor(bossBiome) {
  return BIOMES.find((biome) => biome.id !== bossBiome);
}

function vectorAt(biome) {
  return {
    x: biome.center.x,
    y: 0,
    z: biome.center.z,
    copy(value) { this.x = value.x; this.y = value.y; this.z = value.z; return this; },
  };
}

function certifyDirector(mission, context) {
  const config = missionBossConfig(mission.id);
  const outside = wrongBiomeFor(config.biome);
  const position = vectorAt(outside);
  let starts = 0;
  const manager = {
    active: false,
    config: null,
    considerStart() {},
    startEncounter({ missionId }) {
      if (this.active) return false;
      starts += 1;
      this.active = true;
      this.config = missionBossConfig(missionId);
      return true;
    },
  };
  const game = {
    bossManager: manager,
    player: { group: { position } },
    terrain: { findSafeSpawn: (x, z) => ({ x, y: 0, z }) },
    missionStats: {},
    getMissionContext: () => context,
    alignExploreCameraToPlayer() {},
    updateHud() {},
    ui: { showToast() {} },
    paused: false,
  };
  const director = new BossEncounterDirector({ game, routeDelayMs: 0, retryDelayMs: 0 });
  director.installed = true;
  for (let tick = 0; tick < 12; tick += 1) director.tick();
  check(biomeAt(position.x).id, config.biome, `${mission.id}: wrong-biome readiness must route to the canonical arena`);
  check(manager.active, true, `${mission.id}: canonical boss must activate`);
  check(manager.config.id, config.id, `${mission.id}: correct boss must activate`);
  for (let tick = 0; tick < 12; tick += 1) director.tick();
  check(starts, 1, `${mission.id}: repeated ticks must not duplicate the boss`);
  counters.wrongBiome += 1;
  counters.duplicateBoss += 1;
  return { manager, starts };
}

function certifyRestore(mission, baseContext, index) {
  const prior = MISSIONS.slice(0, index);
  const contexts = [];

  const incomplete = clone(baseContext);
  const first = mission.subObjectives.find((row) => row.kind !== "boss");
  satisfy(first, incomplete);
  contexts.push({ name: "incomplete", state: incomplete, expectedMission: mission.id, ready: false, active: false });

  const ready = clone(baseContext);
  satisfyPrerequisites(mission, ready);
  contexts.push({ name: "ready", state: ready, expectedMission: mission.id, ready: true, active: false });

  const active = clone(ready);
  active.activeBoss = { status: "active", missionId: mission.id, bossId: missionBossConfig(mission.id).id, seed: index + 1 };
  contexts.push({ name: "active", state: active, expectedMission: mission.id, ready: true, active: true });

  const defeated = clone(ready);
  satisfy(mission.subObjectives.find((row) => row.kind === "boss"), defeated);
  contexts.push({ name: "defeated", state: defeated, expectedMission: MISSIONS[index + 1]?.id ?? null, ready: null, active: false });

  const rewarded = clone(defeated);
  commitReward(rewarded, mission, index + 1);
  contexts.push({ name: "rewarded", state: rewarded, expectedMission: MISSIONS[index + 1]?.id ?? null, ready: null, active: false });

  for (const checkpoint of contexts) {
    const restored = clone(checkpoint.state);
    const selected = activeCampaignMission(restored);
    check(selected?.id ?? null, checkpoint.expectedMission, `${mission.id}/${checkpoint.name}: restore must select the canonical mission`);
    if (checkpoint.ready !== null && selected?.id === mission.id) check(missionReadyForBoss(mission.id, restored), checkpoint.ready, `${mission.id}/${checkpoint.name}: readiness must survive restore`);
    if (checkpoint.active) {
      check(restored.activeBoss.missionId, mission.id, `${mission.id}/active: correct boss restore`);
      check(restored.activeBoss.bossId, missionBossConfig(mission.id).id, `${mission.id}/active: no stale boss restore`);
    }
    for (const oldMission of prior) {
      check(Boolean(restored.bossDefeats[oldMission.id]), true, `${mission.id}/${checkpoint.name}: prior campaign defeat remains historical, not active`);
    }
    counters.restore += 1;
  }
}

function certifyReset(label, context) {
  const records = [{ type: "power" }, { type: "bridge" }];
  const game = {
    buildings: { records, group: { clear() { this.cleared = true; } } },
    missionStats: { ...clone(context), bossDefeats: clone(context.bossDefeats), claimedBossRewards: [...context.claimedBossRewards], activeBoss: context.activeBoss },
    missionProgress: { current: "dirty" },
    civilizationScore: 88,
    phase: 4,
    harvestedTreeIds: new Set(["tree"]),
    collectedPowerUpIds: new Set(["power"]),
    minedRockIds: new Set(["rock"]),
    personalObjectiveIds: new Set(["goal"]),
    treeHarvestedAt: new Map([["tree", 1]]),
    enemyProjectiles: [{}],
    enemies: [{}],
    user: { rank: "captain" },
    player: { rank: "captain" },
  };
  resetRuntimeWorld(game);
  check(game.missionStats.bossDefeats, {}, `${label}: reset clears defeats`);
  check(game.missionStats.claimedBossRewards, [], `${label}: reset clears rewards`);
  check(game.missionStats.activeBoss, null, `${label}: reset clears active boss`);
  check(game.buildings.records.length, 0, `${label}: reset clears campaign structures`);
  check(game.phase, 1, `${label}: reset returns canonical phase`);
  check(game.user.rank, "ensign", `${label}: reset returns canonical earned rank`);
  counters.reset += 1;
}

check(MISSIONS.length, 12, "campaign certification requires 12 missions");
check(new Set(MISSIONS.map((mission) => mission.id)).size, 12, "campaign mission ids must be unique");

const campaign = blankContext();
let advancementCount = 0;

for (const [index, mission] of MISSIONS.entries()) {
  const config = missionBossConfig(mission.id);
  ok(config, `${mission.id}: boss config exists`);
  check(mission.bossEncounter.bossId, config.id, `${mission.id}: mission boss id is canonical`);
  check(mission.biome, config.biome, `${mission.id}: mission boss biome is canonical`);
  check(activeCampaignMission(campaign).id, mission.id, `${mission.id}: sequential selection is correct`);
  check(missionReadyForBoss(mission.id, campaign), false, `${mission.id}: incomplete objectives cannot start boss`);

  const prerequisites = mission.subObjectives.filter((row) => row.kind !== "boss");
  for (const objective of prerequisites.slice(0, -1)) satisfy(objective, campaign);
  check(missionReadyForBoss(mission.id, campaign), false, `${mission.id}: final prerequisite is required`);
  satisfy(prerequisites.at(-1), campaign);
  check(prerequisites.every((objective) => objectiveComplete(objective, campaign)), true, `${mission.id}: production objective evaluator sees all prerequisites complete`);
  check(missionReadyForBoss(mission.id, campaign), true, `${mission.id}: final prerequisite unlocks boss readiness`);

  const decision = bossEncounterDecision(campaign);
  check(decision.state, BOSS_ENCOUNTER_STATES.PREREQUISITES_COMPLETE, `${mission.id}: readiness selects staging`);
  check(decision.mission.id, mission.id, `${mission.id}: readiness selects correct mission`);
  check(decision.config.id, config.id, `${mission.id}: readiness selects correct boss`);
  check(decision.config.biome, config.biome, `${mission.id}: readiness selects correct biome`);
  certifyDirector(mission, campaign);

  const rewardSeed = 1400 + index;
  const resourcesBefore = clone(campaign.resources);
  check(commitReward(campaign, mission, rewardSeed), true, `${mission.id}: first reward commits`);
  const resourcesAfter = clone(campaign.resources);
  check(commitReward(campaign, mission, rewardSeed), false, `${mission.id}: duplicate reward is rejected`);
  check(campaign.resources, resourcesAfter, `${mission.id}: duplicate reward cannot mutate resources`);
  ok(JSON.stringify(resourcesAfter) !== JSON.stringify(resourcesBefore), `${mission.id}: real reward changes resources`);
  check(campaign.claimedBossRewards.filter((id) => id === encounterRewardId(mission.id, rewardSeed)).length, 1, `${mission.id}: reward ledger has one entry`);
  counters.duplicateReward += 1;

  const bossObjective = mission.subObjectives.find((row) => row.kind === "boss");
  satisfy(bossObjective, campaign);
  satisfy(bossObjective, campaign);
  const next = activeCampaignMission(campaign);
  check(next?.id ?? null, MISSIONS[index + 1]?.id ?? null, `${mission.id}: defeat advances exactly once`);
  advancementCount += 1;
  check(Object.keys(campaign.bossDefeats).filter((id) => id === mission.id).length, 1, `${mission.id}: defeat ledger has one entry`);
  counters.advancement += 1;
}

check(advancementCount, 12, "all 12 mission transitions executed exactly once");
check(activeCampaignMission(campaign), null, "Mission 12 resolves to the existing null campaign-complete state");
check(bossEncounterDecision(campaign).reason, "Campaign complete", "campaign completion uses the production completion decision");

for (const index of [0, 3, 7, 11]) {
  const context = blankContext();
  for (const prior of MISSIONS.slice(0, index)) for (const objective of prior.subObjectives) satisfy(objective, context);
  certifyRestore(MISSIONS[index], context, index);
}

const stale = blankContext();
for (const objective of MISSIONS[0].subObjectives) satisfy(objective, stale);
satisfyPrerequisites(MISSIONS[1], stale);
stale.activeBoss = { status: "active", missionId: MISSIONS[0].id, bossId: missionBossConfig(MISSIONS[0].id).id };
check(activeCampaignMission(stale).id, MISSIONS[1].id, "stale prior boss cannot preempt the current campaign mission");
check(bossEncounterDecision(stale).mission.id, MISSIONS[1].id, "campaign decision ignores stale replay/run-order state");

const resetCases = [
  ["partial", (() => { const c = blankContext(); satisfy(MISSIONS[0].subObjectives[0], c); return c; })()],
  ["objectives-complete", (() => { const c = blankContext(); satisfyPrerequisites(MISSIONS[0], c); return c; })()],
  ["boss-pending", (() => { const c = blankContext(); satisfyPrerequisites(MISSIONS[0], c); c.activeBoss = { status: "pending", missionId: MISSIONS[0].id }; return c; })()],
  ["boss-active", (() => { const c = blankContext(); satisfyPrerequisites(MISSIONS[0], c); c.activeBoss = { status: "active", missionId: MISSIONS[0].id }; return c; })()],
  ["boss-defeated", (() => { const c = blankContext(); for (const o of MISSIONS[0].subObjectives) satisfy(o, c); return c; })()],
  ["reward-committed", (() => { const c = blankContext(); for (const o of MISSIONS[0].subObjectives) satisfy(o, c); commitReward(c, MISSIONS[0], 1); return c; })()],
  ["campaign-complete", clone(campaign)],
];
for (const [label, context] of resetCases) certifyReset(label, context);

console.log(JSON.stringify({
  status: "PASS",
  missionsCertified: MISSIONS.length,
  bossesCertified: MISSIONS.length,
  sequentialTransitions: advancementCount,
  wrongBiomeCases: counters.wrongBiome,
  duplicateBossCases: counters.duplicateBoss,
  duplicateRewardCases: counters.duplicateReward,
  advancementCases: counters.advancement,
  restoreCheckpoints: counters.restore,
  resetCases: counters.reset,
  staleReplayProtection: true,
  assertions: counters.assertions,
}, null, 2));
