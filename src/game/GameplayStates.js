import { BOSS_CONFIGS } from "./BossSystem.js";
import { createCampaignTiers } from "./Missions.js";

export const GAMEPLAY_STATE_COUNT = 12;

const missions = createCampaignTiers().flatMap((tier) => tier.missions.map((mission) => ({
  ...mission,
  tier: tier.number,
  tierTitle: tier.title,
})));

const bossById = Object.freeze(BOSS_CONFIGS);

export const GAMEPLAY_STATES = Object.freeze(missions.map((mission, index) => {
  const boss = bossById[mission.bossEncounter.bossId];
  return Object.freeze({
    number: index + 1,
    missionId: mission.id,
    missionTitle: mission.title,
    biome: mission.biome,
    tier: mission.tier,
    tierTitle: mission.tierTitle,
    bossId: boss.id,
    bossName: boss.name,
    rank: index < 4 ? "ensign" : index < 8 ? "lieutenant" : "captain",
  });
}));

function validNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= GAMEPLAY_STATE_COUNT ? number : null;
}

export function parseGameplayState(search = "", { local = true } = {}) {
  if (!local) return null;
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(String(search).replace(/^\?+/, ""));
  let kind = null;
  let number = null;

  // Boss encounters are the more specific QA state. Let them override a stale
  // mission parameter when a copied test URL happens to contain both.
  if (params.has("boss")) {
    kind = "boss";
    number = validNumber(params.get("boss"));
  } else if (params.has("mission")) {
    kind = "mission";
    number = validNumber(params.get("mission"));
  } else {
    const match = String(params.get("state") ?? "").trim().toLowerCase().match(/^(mission|boss)-(\d{1,2})$/);
    if (match) {
      kind = match[1];
      number = validNumber(match[2]);
    }
  }

  if (!kind || !number) return null;
  return Object.freeze({ kind, ...GAMEPLAY_STATES[number - 1] });
}

function stageObjective(progress, objective) {
  const biome = objective.biome ? progress.biomes[objective.biome] : null;
  if (objective.kind === "biomeVisit" && biome) biome.visited = true;
  else if (objective.kind === "biomeResource" && biome) biome.resources = Math.max(biome.resources, objective.target);
  else if (objective.kind === "biomeStat" && biome) biome.stats[objective.key] = Math.max(Number(biome.stats[objective.key] ?? 0), objective.target);
  else if (objective.kind === "biomeBuilding" && biome) biome.buildings[objective.key] = Math.max(Number(biome.buildings[objective.key] ?? 0), objective.target);
  else if (objective.kind === "biomeEither" && biome) {
    const key = objective.keys[0];
    biome.buildings[key] = Math.max(Number(biome.buildings[key] ?? 0), objective.target);
  } else if (objective.kind === "boss") {
    progress.bossDefeats[objective.missionId] = { missionId: objective.missionId, bossId: objective.bossId, qa: true };
  }
}

export function createGameplayProgress(state) {
  const progress = {
    biomes: Object.fromEntries(["forest", "desert", "highlands", "arctic", "wetlands"].map((id) => [id, { visited: false, resources: 0, stats: {}, buildings: {} }])),
    bossDefeats: {},
  };
  if (!state) return progress;

  const stagedMissionCount = state.kind === "boss" ? state.number : state.number - 1;
  for (const mission of missions.slice(0, stagedMissionCount)) {
    // Staging a boss means "the settlement is finished, the fight is all that's
    // left", so every objective except the boss itself is credited. Missions have
    // five or six objectives depending on the biome, so this must be selected by
    // kind - a fixed slice silently left the last building unbuilt and the boss
    // gate shut.
    const objectives = state.kind === "boss" && mission.id === state.missionId
      ? mission.subObjectives.filter((objective) => objective.kind !== "boss")
      : mission.subObjectives;
    objectives.forEach((objective) => stageObjective(progress, objective));
  }
  return progress;
}

export function gameplayStateUrls(origin = "http://127.0.0.1:8790/") {
  return GAMEPLAY_STATES.flatMap((state) => [
    { ...state, kind: "mission", url: `${origin}?demo=1&mission=${state.number}` },
    { ...state, kind: "boss", url: `${origin}?demo=1&boss=${state.number}` },
  ]);
}
