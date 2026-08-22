import assert from "node:assert/strict";
import { HUMAN_BUILDINGS } from "../src/game/Buildings.js";
import { BOSS_CONFIGS, MISSION_BOSS_IDS } from "../src/game/BossSystem.js";
import { PROJECT_LADDER, campaignOrder } from "../src/game/CampaignPlan.js";
import {
  CAMPAIGN_TIERS,
  MISSION_OBJECTIVES,
  ZEKNOVAN_AID_TYPES,
  createCampaignTiers,
  missionBuildObjectives,
} from "../src/game/Missions.js";

const expectedOrder = PROJECT_LADDER.map((plan) => plan.mission);
const order = createCampaignTiers().flatMap((tier) => tier.missions);
assert.deepEqual(order.map((mission) => mission.id), expectedOrder, "mission ordering must follow CampaignPlan");
assert.deepEqual(campaignOrder(), expectedOrder, "CampaignPlan order must be deterministic");
assert.equal(new Set(expectedOrder).size, 12, "campaign must contain 12 unique missions");

const validTypes = new Set([...Object.keys(HUMAN_BUILDINGS), ...ZEKNOVAN_AID_TYPES]);
const colony = Object.create(null);
const perBiome = Object.create(null);
const ledger = [];

for (const [index, mission] of order.entries()) {
  const before = Number(colony.defense ?? 0);
  const objectives = MISSION_OBJECTIVES[mission.id] ?? [];
  assert.equal(objectives.at(-1)?.kind, "boss", `${mission.id} must terminate with its boss objective`);
  assert.equal(objectives.at(-1)?.bossId, MISSION_BOSS_IDS[mission.id], `${mission.id} must use its canonical boss route`);
  assert.ok(BOSS_CONFIGS[MISSION_BOSS_IDS[mission.id]], `${mission.id} boss route must resolve to a real config`);

  for (const objective of missionBuildObjectives(mission.id)) {
    const keys = objective.key ? [objective.key] : objective.keys;
    assert.ok(Array.isArray(keys) && keys.length > 0, `${mission.id} has a malformed build objective`);
    assert.ok(keys.every((key) => validTypes.has(key)), `${mission.id} references an unknown build type`);

    // The canonical feasibility gate treats either-objectives as the first legal
    // branch. That is conservative and deterministic: satisfying another branch
    // can only make the live campaign easier, never harder.
    const key = keys[0];
    const scope = perBiome[objective.biome] ??= Object.create(null);
    const previous = Number(scope[key] ?? 0);
    const after = Math.max(previous, Number(objective.target));
    colony[key] = Number(colony[key] ?? 0) + after - previous;
    scope[key] = after;
  }

  for (const [key, required] of mission.requirements) {
    assert.ok(Number(colony[key] ?? 0) >= required, `${mission.id} cannot produce required ${key}=${required}`);
  }
  if (mission.any.length) {
    assert.ok(mission.any.some(([key, required]) => Number(colony[key] ?? 0) >= required), `${mission.id} cannot produce any legal alternative`);
  }

  const after = Number(colony.defense ?? 0);
  ledger.push(Object.freeze({
    missionIndex: index + 1,
    missionId: mission.id,
    defenseBefore: before,
    defenseProduced: after - before,
    defenseConsumed: 0,
    defenseAfter: after,
    sourceOfChange: after === before ? "carry-forward" : "mandatory construction objectives",
  }));
  assert.ok(after >= 0, `${mission.id} defense balance must never be negative`);
}

const tower = order.find((mission) => mission.id === "tower-one");
const towerLedger = ledger.find((row) => row.missionId === "tower-one");
assert.deepEqual(towerLedger, {
  missionIndex: 3,
  missionId: "tower-one",
  defenseBefore: 0,
  defenseProduced: 5,
  defenseConsumed: 0,
  defenseAfter: 5,
  sourceOfChange: "mandatory construction objectives",
});
assert.equal(tower.requirements.find(([key]) => key === "defense")?.[1], 5, "Tower One defense requirement must remain five");
assert.equal(MISSION_OBJECTIVES["tower-one"].filter((objective) => objective.kind === "biomeBuilding" && objective.key === "defense").length, 5, "Tower One must produce one defense tower in every biome");

for (const plan of PROJECT_LADDER) {
  const generated = MISSION_OBJECTIVES[plan.mission].filter((objective) => objective.kind === "biomeBuilding" && objective.key === plan.type);
  assert.equal(generated.length, 5, `${plan.mission} must preserve all five CampaignPlan construction rows`);
  assert.equal(new Set(generated.map((objective) => objective.biome)).size, 5, `${plan.mission} must cover all five CampaignPlan biomes`);
}

assert.equal(CAMPAIGN_TIERS.flatMap((tier) => tier.missions).length, 12);
assert.equal(JSON.stringify(createCampaignTiers()), JSON.stringify(createCampaignTiers()), "campaign generation must be byte-deterministic");
assert.equal(new Set(Object.values(MISSION_BOSS_IDS)).size, 12, "all 12 missions must retain distinct boss routes");

console.table(ledger.slice(0, 3));
console.log("Campaign feasibility and Tower One defense progression tests passed.");
