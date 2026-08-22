import assert from "node:assert/strict";
import { bossEncounterDecision, BOSS_ENCOUNTER_STATES } from "../src/game/BossEncounterDirector.js";
import { createCampaignTiers, objectiveComplete } from "../src/game/Missions.js";
import { missionBossConfig } from "../src/game/BossSystem.js";

function blankContext() {
  return {
    buildings: {},
    stats: {},
    biomes: Object.fromEntries(["forest", "desert", "highlands", "arctic", "wetlands"].map((id) => [id, { visited: false, resources: 0, stats: {}, buildings: {} }])),
    bossDefeats: {},
  };
}

function satisfy(objective, context) {
  const target = Number(objective.target || 1);
  if (objective.kind === "building") context.buildings[objective.key] = target;
  else if (objective.kind === "either") context.buildings[objective.keys[0]] = target;
  else if (objective.kind === "biomeVisit") context.biomes[objective.biome].visited = true;
  else if (objective.kind === "biomeResource") context.biomes[objective.biome].resources = target;
  else if (objective.kind === "biomeStat") context.biomes[objective.biome].stats[objective.key] = target;
  else if (objective.kind === "biomeBuilding") context.biomes[objective.biome].buildings[objective.key] = target;
  else if (objective.kind === "biomeEither") context.biomes[objective.biome].buildings[objective.keys[0]] = target;
  else if (objective.kind === "boss") context.bossDefeats[objective.missionId] = { defeatedAt: 1 };
}

const missions = createCampaignTiers().flatMap((tier) => tier.missions);
assert.equal(missions.length, 12, "the campaign matrix must cover all 12 missions");

for (let index = 0; index < missions.length; index += 1) {
  const context = blankContext();
  for (let previous = 0; previous < index; previous += 1) {
    for (const objective of missions[previous].subObjectives) satisfy(objective, context);
  }
  for (const objective of missions[index].subObjectives.filter((item) => item.kind !== "boss")) satisfy(objective, context);

  const decision = bossEncounterDecision(context);
  const expected = missionBossConfig(missions[index].id);
  assert.equal(decision.state, BOSS_ENCOUNTER_STATES.PREREQUISITES_COMPLETE, `${missions[index].id} should become boss-ready`);
  assert.equal(decision.mission.id, missions[index].id, "the active mission must win over replay-ledger candidates");
  assert.equal(decision.config.id, expected.id);
  assert.equal(decision.config.biome, expected.biome, "the canonical arena biome must be retained");
  assert.ok(missions[index].subObjectives.filter((item) => item.kind !== "boss").every((item) => objectiveComplete(item, context)));

  satisfy(missions[index].subObjectives.find((item) => item.kind === "boss"), context);
  const next = bossEncounterDecision(context);
  if (index < missions.length - 1) assert.equal(next.mission.id, missions[index + 1].id, "defeat must advance exactly one mission");
}

console.log(`boss encounter director: ${missions.length}/12 mission routes verified`);
