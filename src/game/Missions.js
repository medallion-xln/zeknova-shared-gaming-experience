const objectives = {
  grid: [["stat", "resourcesCollected", 1, "Collect a field resource"], ["stat", "treesChopped", 1, "Chop a small tree"], ["building", "power", 1, "Install 1 Solar Grid"]],
  water: [["stat", "resourcesCollected", 2, "Collect 2 field resources"], ["stat", "treesChopped", 2, "Harvest 2 trees"], ["building", "water", 1, "Install 1 Water Works"]],
  habitat: [["stat", "treesChopped", 3, "Harvest 3 trees"], ["stat", "resourcesCollected", 3, "Collect 3 field resources"], ["building", "habitat", 1, "Install 1 Habitat"]],
  "tower-one": [["stat", "enemiesDefeated", 1, "Defeat 1 enemy"], ["stat", "rocksMined", 1, "Mine 1 stone"], ["building", "defense", 1, "Install 1 Defense Beacon"]],
  "tower-ring": [["stat", "enemiesDefeated", 3, "Defeat 3 enemies"], ["stat", "rocksMined", 2, "Mine 2 stones"], ["building", "defense", 2, "Install 2 Defense Beacons"]],
  "supply-route": [["stat", "treesChopped", 5, "Harvest 5 trees"], ["stat", "rocksMined", 3, "Mine 3 stones"], ["either", ["bridge", "boat"], 1, "Install a Bridge or Survey Skiff"]],
  research: [["stat", "powerUpsCollected", 2, "Secure 2 power-ups"], ["stat", "rocksMined", 4, "Mine 4 rock formations"], ["building", "research", 1, "Install 1 AI Research Lab"]],
  culture: [["stat", "treesChopped", 7, "Harvest 7 trees"], ["stat", "powerUpsCollected", 3, "Secure 3 power-ups"], ["building", "culture", 1, "Install 1 Creator Commons"]],
  governance: [["stat", "enemiesDefeated", 5, "Defeat 5 enemies"], ["stat", "resourcesCollected", 5, "Collect 5 field resources"], ["building", "governance", 1, "Install 1 Civic Hall"]],
  population: [["stat", "treesChopped", 10, "Harvest 10 trees"], ["stat", "enemiesDefeated", 6, "Defeat 6 enemies"], ["building", "habitat", 2, "Install 2 Habitats"]],
  "advanced-research": [["stat", "rocksMined", 8, "Mine 8 rock formations"], ["stat", "powerUpsCollected", 5, "Secure 5 power-ups"], ["building", "research", 2, "Install 2 AI Research Labs"]],
  stronghold: [["stat", "rocksMined", 12, "Mine 12 rock formations"], ["stat", "enemiesDefeated", 10, "Defeat 10 enemies"], ["building", "defense", 3, "Install 3 Defense Beacons"]],
};

export const MISSION_OBJECTIVES = Object.freeze(Object.fromEntries(Object.entries(objectives).map(([id, rows]) => [id, rows.map(([kind, key, target, label]) => kind === "either" ? { kind, keys: key, target, label } : { kind, key, target, label })])));

export const CAMPAIGN_TIERS = Object.freeze([
  { number: 1, title: "Basic Outpost", subtitle: "Bring the first forward base online.", missions: [{ id: "grid", title: "Power the landing zone", objective: "Install a Solar Grid so every later system has stable power.", requirements: [["power", 1]] }, { id: "water", title: "Secure freshwater", objective: "Install Water Works and establish reliable life support.", requirements: [["water", 1]] }, { id: "habitat", title: "Open the command post", objective: "Install a Habitat to complete the basic staffed outpost.", requirements: [["habitat", 1]] }] },
  { number: 2, title: "Perimeter Defense", subtitle: "Turn the outpost into a defensible tower network.", missions: [{ id: "tower-one", title: "Raise the first defense tower", objective: "Install a Defense Beacon overlooking the outpost approach.", requirements: [["defense", 1]] }, { id: "tower-ring", title: "Form a defensive crossfire", objective: "Install a second Defense Beacon to create overlapping coverage.", requirements: [["defense", 2]] }, { id: "supply-route", title: "Protect the supply route", objective: "Install either a Canopy Bridge or Survey Skiff for a reliable crossing.", requirements: [], any: [["bridge", 1], ["boat", 1]] }] },
  { number: 3, title: "Expanded Operations", subtitle: "Unlock intelligence and community missions.", missions: [{ id: "research", title: "Activate mission intelligence", objective: "Install an AI Research Lab to unlock advanced field operations.", requirements: [["research", 1]] }, { id: "culture", title: "Establish crew morale", objective: "Install a Creator Commons to support the growing garrison.", requirements: [["culture", 1]] }, { id: "governance", title: "Commission local command", objective: "Install a Civic Hall to coordinate policy and diplomacy.", requirements: [["governance", 1]] }] },
  { number: 4, title: "Frontier Stronghold", subtitle: "Scale the network into a durable regional base.", missions: [{ id: "population", title: "Expand the garrison", objective: "Install a second Habitat for incoming crews and specialists.", requirements: [["habitat", 2]] }, { id: "advanced-research", title: "Unlock advanced missions", objective: "Install a second AI Research Lab to enable deep-biome operations.", requirements: [["research", 2]] }, { id: "stronghold", title: "Complete the defense grid", objective: "Install a third Defense Beacon and finish the frontier stronghold.", requirements: [["defense", 3]] }] },
]);

export function createCampaignTiers() {
  return CAMPAIGN_TIERS.map((tier) => ({ ...tier, missions: tier.missions.map((mission) => ({ ...mission, requirements: [...(mission.requirements ?? [])], any: [...(mission.any ?? [])], subObjectives: (MISSION_OBJECTIVES[mission.id] ?? []).map((objective) => ({ ...objective, keys: objective.keys ? [...objective.keys] : undefined })) })) }));
}

export function objectiveValue(objective, context = {}) {
  const buildings = context.buildings ?? context, stats = context.stats ?? {};
  if (objective.kind === "building") return Number(buildings[objective.key] ?? 0);
  if (objective.kind === "either") return Math.max(...objective.keys.map((key) => Number(buildings[key] ?? 0)));
  return Number(stats[objective.key] ?? 0);
}

export function objectiveComplete(objective, context) { return objectiveValue(objective, context) >= objective.target; }

