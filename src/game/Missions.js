import { PROJECT_LADDER, missionItems as planMissionItems } from "./CampaignPlan.js";
import { BOSS_CONFIGS, MISSION_BOSS_IDS } from "./BossSystem.js";

const visit = (biome, label) => ({ kind: "biomeVisit", biome, target: 1, label });
const recover = (biome, target, label) => ({ kind: "biomeResource", biome, target, label });
const act = (biome, key, target, label) => ({ kind: "biomeStat", biome, key, target, label });
const build = (biome, key, target, label) => ({ kind: "biomeBuilding", biome, key, target, label });
const buildEither = (biome, keys, target, label) => ({ kind: "biomeEither", biome, keys, target, label });
const boss = (missionId, label) => {
  const bossId = MISSION_BOSS_IDS[missionId];
  const biome = BOSS_CONFIGS[bossId]?.biome;
  const biomeLabel = biome ? `${biome[0].toUpperCase()}${biome.slice(1)} AO` : "the marked AO";
  return { kind: "boss", missionId, bossId, target: 1, biome, label: `${label} — Travel to ${biomeLabel} to start the boss fight` };
};

/**
 * ZekNovan aid projects. These are built from the construction dock like any other
 * structure, but they are ZekNovan infrastructure rather than colony infrastructure:
 * each one lowers ZekNovan tension (10-20 points) and raises trust. They are also the
 * only builds permitted inside protected territory after a Shared Water outcome.
 * Any one of them satisfies the reconciliation objective.
 */
export const ZEKNOVAN_AID_TYPES = Object.freeze([
  "zek_clinic", "zek_watershed", "zek_beacon", "zek_grove",
  "zek_habitat", "zek_archive", "zek_market", "zek_watch", "zek_transit",
]);
const aid = (biome, label) => ({ kind: "biomeEither", biome, keys: [...ZEKNOVAN_AID_TYPES], target: 1, label });

// Mission 2 Highlands Commissioning — deterministic, tension-independent, 6h regeneration.
// Stable encounter group: 1 Juggernaut + 2 Red projectile shooters (spitter) per mission.
export const COMMISSIONING_REGEN_MS = 6 * 60 * 60 * 1000;
export const COMMISSIONING_MISSIONS = Object.freeze(["water", "tower-one"]);
export const COMMISSIONING_CONFIG = Object.freeze({
  "water": Object.freeze({ biome: "highlands", label: "Intercept 3 attackers during commissioning — 1 Juggernaut + 2 Red projectile shooters will immediately attack in Highlands AO.", attackers: Object.freeze([{ stableId: "juggernaut", role: "juggernaut" }, { stableId: "spitter-1", role: "spitter" }, { stableId: "spitter-2", role: "spitter" }]) }),
  "tower-one": Object.freeze({ biome: "highlands", label: "Intercept 3 attackers during commissioning — 1 Juggernaut + 2 Red projectile shooters will immediately attack in Highlands AO (tension-independent)", attackers: Object.freeze([{ stableId: "juggernaut", role: "juggernaut" }, { stableId: "spitter-1", role: "spitter" }, { stableId: "spitter-2", role: "spitter" }]) }),
});
export function commissioningAttackerIds(missionId, generation = 0) {
  const cfg = COMMISSIONING_CONFIG[missionId];
  if (!cfg) return [];
  return cfg.attackers.map((a) => `commissioning-${missionId}-${a.stableId}-g${generation}`);
}
export function getCommissioningState(context, missionId) {
  const map = context?.commissioningEncounters ?? context?.missionStats?.commissioningEncounters ?? {};
  return map?.[missionId] ?? null;
}
export function commissioningProgressValue(objective, context) {
  if (objective.kind !== "biomeStat" || objective.key !== "enemiesDefeated" || objective.biome !== "highlands" || !String(objective.label).includes("Intercept 3 attackers")) return null;
  // Derive missionId from objective label or context: both water and tower-one share same label pattern
  const missionId = objective._commissioningMissionId ?? (context?.commissioningMissionHint ?? null) ?? (COMMISSIONING_MISSIONS.find((mid) => (MISSION_OBJECTIVES[mid] ?? []).some((o) => o.label === objective.label)) ?? null);
  if (!missionId || !COMMISSIONING_CONFIG[missionId]) return null;
  const state = getCommissioningState(context, missionId);
  if (!state) {
    // QA staging fallback: if no commissioning state, use generic biome stat (supports ?boss=2 staged biomes without commissioningEncounters)
    const biome = context?.biomes?.[objective.biome] ?? {};
    const fallback = Number(biome.stats?.[objective.key] ?? 0);
    if (fallback > 0) return fallback;
    return 0;
  }
  // If completed and not yet regenerated (nextRegenAt > now), show COMPLETE (3/3)
  if (state.status === "completed") {
    const now = Date.now();
    if (Number(state.nextRegenAt) > now) return 3;
    // If regen time passed but not yet regenerated, keep COMPLETE until spawn succeeds (handled by runtime)
    return 3;
  }
  return Number(state.defeatedIds?.length ?? state.defeated?.length ?? 0);
}

// Campaign structure: one colony at a time.
//
// Each mission's buildings are placed inside a single biome, because the utility
// network only reaches 30m (power), 26m (water) and 24m (data) while AO centres sit
// 36 apart. Infrastructure spread across biomes can never connect, so a mission that
// asks for a Solar Grid in one region and a Water Works in another produces a
// permanently offline structure. Keeping each mission intra-biome means the
// dependency chain (grid -> water -> habitat/research/culture -> governance) is what
// the player actually learns.
//
// Mission ids are unchanged so existing saves and the boss bindings in BossSystem.js
// keep working; only the grouping and the build objectives are new.
const legacyObjectives = {
  // Forest colony (missions 7, 10, 12 in the current order).
  habitat: [visit("forest", "Enter the Forest AO"), recover("forest", 2, "Recover 2 Forest resources"), build("forest", "power", 1, "Install 1 Forest Solar Grid"), build("forest", "water", 1, "Connect 1 Forest Water Works"), build("forest", "habitat", 1, "Open 1 Forest Habitat"), boss("habitat", "Defeat the Ancient Thornwarden")],
  culture: [visit("forest", "Return to the Forest colony"), act("forest", "treesChopped", 3, "Harvest 3 Forest trees"), build("forest", "culture", 1, "Establish 1 Forest Creator Commons"), aid("forest", "Complete 1 ZekNovan aid project"), boss("culture", "Defeat the Spore Cantor")],
  stronghold: [visit("forest", "Hold the Forest colony"), act("forest", "enemiesDefeated", 3, "Defeat 3 Forest attackers"), build("forest", "defense", 2, "Raise 2 Forest Defense Beacons"), boss("stronghold", "Defeat the Rootbound Tremor")],

  // Desert colony (missions 1-2).
  // NO Water Works objective in the Desert. Water Works requires ground within 50m
  // of the river AND below height 18; the desert dunes exceed that cap almost
  // everywhere, leaving exactly one valid tile inside the whole AO (-18, 0) on the
  // Highlands boundary. Requiring one here made mission 1 uncompletable. The Desert
  // is a power-and-ore colony; the water-dependent chain lives in the other biomes.
  grid: [visit("desert", "Enter the Desert AO"), recover("desert", 2, "Recover 2 Desert resources"), act("desert", "rocksMined", 2, "Mine 2 Desert ore formations"), build("desert", "power", 1, "Install 1 Desert Solar Grid"), build("desert", "defense", 1, "Raise 1 Desert Defense Beacon"), boss("grid", "Defeat the Sunscar Colossus")],
  // Research and Civic Hall both need a water connection, which the Desert cannot
  // provide (see above), so this mission asks for buildings the Desert can actually
  // support and keep online.
  governance: [visit("desert", "Return to the Desert colony"), recover("desert", 4, "Recover 4 Desert resources"), act("desert", "rocksMined", 4, "Mine 4 Desert ore formations"), build("desert", "defense", 2, "Hold the seam with 2 Desert Defense Beacons"), aid("desert", "Complete 1 ZekNovan aid project"), boss("governance", "Defeat the Obsidian Demon Knight")],

  // Wetlands colony (missions 3, 4, 9).
  water: [visit("wetlands", "Enter the Wetlands AO"), recover("wetlands", 2, "Recover 2 Wetland resources"), build("wetlands", "power", 1, "Install 1 Wetland Solar Grid"), build("wetlands", "water", 1, "Connect 1 Wetland Water Works"), boss("water", "Defeat the Mire Siren")],
  "supply-route": [visit("wetlands", "Return to the Wetlands colony"), aid("wetlands", "Complete 1 ZekNovan infrastructure build"), buildEither("wetlands", ["bridge", "boat"], 1, "Install a Wetland Bridge or Survey Skiff"), boss("supply-route", "Defeat the Drowned Tremor")],
  population: [visit("wetlands", "Secure the Wetlands colony"), aid("wetlands", "Complete 1 ZekNovan infrastructure build"), build("wetlands", "habitat", 2, "Operate 2 Wetland Habitats"), boss("population", "Defeat the Insect King")],

  // Highlands and Arctic (missions 5, 6, 8, 11).
  "tower-one": [visit("highlands", "Enter the Highlands AO"), recover("highlands", 2, "Recover 2 Highland resources"), build("highlands", "power", 1, "Install 1 Highland Solar Grid"), build("highlands", "defense", 1, "Raise 1 Highland Defense Beacon"), boss("tower-one", "Defeat the Stormback")],
  "advanced-research": [visit("highlands", "Secure the Highlands colony"), act("highlands", "rocksMined", 4, "Mine 4 Highland formations"), build("highlands", "water", 1, "Connect 1 Highland Water Works"), build("highlands", "research", 2, "Operate 2 Highland AI Research Labs"), boss("advanced-research", "Defeat the Arc Gunner")],
  "tower-ring": [visit("arctic", "Enter the Arctic AO"), recover("arctic", 2, "Recover 2 Arctic resources"), build("arctic", "power", 1, "Install 1 Arctic Solar Grid"), build("arctic", "defense", 2, "Raise 2 Arctic Defense Beacons"), boss("tower-ring", "Defeat the White Screecher")],
  research: [visit("arctic", "Secure the Arctic colony"), recover("arctic", 4, "Recover 4 Arctic resources"), build("arctic", "water", 1, "Connect 1 Arctic Water Works"), build("arctic", "research", 1, "Activate 1 Arctic AI Research Lab"), boss("research", "Defeat the Archive Shade")],
};

// Campaign v8: infrastructure is planetary rather than a sequence of isolated
// outposts. Mission ids stay stable for save and boss compatibility.
const allBiomes = ["forest", "desert", "highlands", "arctic", "wetlands"];
const buildAcross = (type, label) => allBiomes.map((biome) => build(biome, type, 1, `${label} in the ${biome[0].toUpperCase()}${biome.slice(1)} AO`));
const visitAcross = (label) => allBiomes.map((biome) => visit(biome, `${label} · ${biome[0].toUpperCase()}${biome.slice(1)} AO`));
/* ── Campaign objectives: generated from the planetary plan ───────────────
   Every mission now delivers ONE ZekNova project to ALL FIVE biomes as ten
   items — five preparation (one per biome) then five construction (one per
   biome). Previously missions 1-4 spanned the planet while 5-12 dropped a
   single building in a single biome, so a region could finish the campaign
   with a Solar Grid and nothing else, and nothing told the player which biome
   was due which project.

   CampaignPlan.js owns the biome/project matrix; this file still owns how an
   item becomes an objective row, so the HUD, the boss gate and the save format
   are unchanged. Mission ids and boss labels are preserved exactly. */
const PLAN_ITEM_TO_OBJECTIVE = {
  survey:        (it) => visit(it.biome, it.label),
  recover:       (it) => recover(it.biome, it.target, it.label),
  combat:        (it) => act(it.biome, "enemiesDefeated", it.target, it.label),
  harvest:       (it) => act(it.biome, "treesChopped", it.target, it.label),
  aid:           (it) => aid(it.biome, it.label),
  biomeBuilding: (it) => build(it.biome, it.type, it.target, it.label),
};

/* Boss labels are carried over verbatim so the Guardian prompts players
   already recognise do not change under them. */
const PLAN_BOSS_LABELS = {
  "grid": "Break the Sunscar Colossus power siphon — Travel to Desert AO to start the boss fight",
  "water": "Purify the Mire Siren's corrupted network — Travel to Wetlands AO to start the boss fight",
  "tower-one": "Triangulate and defeat the Stormback — Travel to Highlands AO to start the boss fight",
  "habitat": "Resolve the Ancient Thornwarden crisis — Travel to Forest AO to start the boss fight",
  "governance": "Retake civic command from the Obsidian Demon Knight — Travel to Desert AO to start the boss fight",
  "population": "Contain the Insect King's bio-swarm — Travel to Wetlands AO to start the boss fight",
  "research": "Verify the archive and defeat its Shade — Travel to Arctic AO to start the boss fight",
  "culture": "Quarantine the Spore Cantor's trade network — Travel to Forest AO to start the boss fight",
  "supply-route": "Defeat the Drowned Tremor — Travel to Wetlands AO to start the boss fight",
  "stronghold": "Survive the Rootbound Tremor industrial siege — Travel to Forest AO to start the boss fight",
  "advanced-research": "Stop the Arc Gunner's hostile takeover — Travel to Highlands AO to start the boss fight",
  "tower-ring": "Stabilize the market and defeat the White Screecher — Travel to Arctic AO to start the boss fight",
};

// CampaignPlan owns the planetary preparation/build matrix, while these rows
// preserve mission-specific infrastructure contracts consumed by live mission
// guidance and boss readiness. They are inserted before the terminal boss row.
const REQUIRED_MISSION_OBJECTIVES = {
  "tower-one": buildAcross("defense", "Raise 1 defensive early-warning tower"),
  habitat: [
    ...buildAcross("habitat", "Open 1 powered planetary habitat"),
    aid("forest", "Complete 1 Forest ZekNovan aid project"),
  ],
  governance: [
    build("desert", "capitol", 1, "Commission 1 Desert Regional Capitol"),
    build("desert", "hospital", 1, "Open 1 Desert public hospital"),
  ],
  population: [build("wetlands", "hospital", 1, "Open 1 Wetlands population hospital")],
  research: [build("arctic", "university", 1, "Open 1 Arctic University Campus")],
  culture: [
    build("forest", "commerce", 1, "Establish 1 Forest Trade and Civic Center"),
    build("forest", "transit", 1, "Open 1 Forest regional transit hub"),
  ],
  "supply-route": [buildEither("wetlands", ["bridge", "boat"], 1, "Install a Wetland Bridge or Survey Skiff")],
  stronghold: [
    build("forest", "war_economy", 1, "Commission 1 Forest War Economy Complex"),
    build("forest", "defense_contractor", 1, "Commission 1 Forest Defense Contractor Campus"),
  ],
};

const objectives = Object.fromEntries(PROJECT_LADDER.map((plan) => [
  plan.mission,
  [
    ...planMissionItems(plan.mission).map((it) => PLAN_ITEM_TO_OBJECTIVE[it.kind](it)),
    ...(REQUIRED_MISSION_OBJECTIVES[plan.mission] ?? []),
    boss(plan.mission, PLAN_BOSS_LABELS[plan.mission]),
  ],
]));

export const MISSION_OBJECTIVES = Object.freeze(Object.fromEntries(Object.entries(objectives).map(([id, rows]) => [id, Object.freeze(rows.map((row) => Object.freeze(row)))])));

const BUILD_OBJECTIVE_KINDS = new Set(["biomeBuilding", "biomeEither", "building", "either"]);

/**
 * Construction objectives only. Survey objectives (entering the AO, recovering
 * resources, harvesting) still count toward mission completion in the HUD, but they
 * do not gate the boss - the encounter opens as soon as the settlement it defends
 * is standing. Widen this set to gate on the full checklist instead.
 */
export function missionBuildObjectives(missionId) {
  return (MISSION_OBJECTIVES[missionId] ?? []).filter((objective) => BUILD_OBJECTIVE_KINDS.has(objective.kind));
}

function mission(id, title, objective, requirements = [], any = []) {
  const bossBiome = BOSS_CONFIGS[MISSION_BOSS_IDS[id]]?.biome;
  return { id, title, objective, requirements, any, biome: bossBiome ?? MISSION_OBJECTIVES[id][0].biome, bossEncounter: { bossId: MISSION_BOSS_IDS[id], requiredForCompletion: true } };
}

// `requirements` are cumulative colony-wide totals, so they keep rising as each new
// settlement is founded rather than being satisfied by an earlier biome's buildings.
// They must never exceed what the campaign's own build objectives can produce by that
// point in the order - the whole campaign only ever raises 4 Water Works and 3 Research
// Labs, so a requirement of 5 would strand the player with nothing left to build.
const LEGACY_CAMPAIGN_TIERS = Object.freeze([
  // Order is driven by boss presentation: the nine bosses with their own dedicated
  // rig are fought first (missions 1-9), and the three that still borrow another
  // boss's mesh are held to the end. Within that, each biome's "founder" mission -
  // the one that raises the Solar Grid and Water Works - still precedes any mission
  // in that biome which depends on power or water, so the utility chain never breaks.
  {
    number: 1,
    title: "Desert and Delta",
    subtitle: "Claim the ore seam, then secure the watershed.",
    missions: [
      mission("grid", "Power the ore seam", "Bring the Desert seam online and survive its guardian.", [["power", 1], ["defense", 1]]),
      mission("governance", "Hold the glass flats", "Fortify the Desert seam and answer its Ashen Marshal.", [["defense", 2]]),
      mission("water", "Secure the watershed", "Establish a connected Wetlands settlement on the river.", [["power", 2], ["water", 1]]),
    ],
  },
  {
    number: 2,
    title: "Reed and Ice",
    subtitle: "Grow the delta town and push into the frozen reach.",
    missions: [
      mission("population", "Expand the settlement", "Grow the Wetlands colony into a populated town.", [["habitat", 2]]),
      mission("tower-ring", "Close the Arctic perimeter", "Extend the defense grid across the frozen reach.", [["power", 3], ["defense", 2]]),
      mission("research", "Open the climate vault", "Complete the Arctic research colony and face its keeper.", [["water", 2], ["research", 1]]),
    ],
  },
  {
    number: 3,
    title: "Canopy and Ridge",
    subtitle: "Found the Forest colony, hold the Highlands, link the map.",
    missions: [
      mission("habitat", "Break ground on the Forest colony", "Raise power, water and shelter in the Forest, then face the Ancient Thornwarden.", [["power", 4], ["water", 3], ["habitat", 3]]),
      mission("tower-one", "Hold the ridgeline", "Power and fortify the Highlands approach.", [["power", 5], ["defense", 3]]),
      mission("supply-route", "Open the supply route", "Create a reliable Wetlands crossing and clear what waits beneath it.", [], [["bridge", 1], ["boat", 1]]),
    ],
  },
  {
    number: 4,
    title: "The Last Guardians",
    subtitle: "Answer the three oldest powers still standing.",
    missions: [
      mission("culture", "Grow the settlement", "Give the colony a cultural heart and open a ZekNovan aid project to lower tension.", [["culture", 1]]),
      mission("advanced-research", "Build the research network", "Water and staff a protected Highlands research site.", [["water", 4], ["research", 3]]),
      mission("stronghold", "Secure the colony", "Ring the Forest colony with defenses and hold it.", [["defense", 5]]),
    ],
  },
]);

export const CAMPAIGN_TIERS = Object.freeze([
  {
    number: 1,
    title: "Planetary Infrastructure · Ensign",
    subtitle: "Bring light, water, communications, defense, and homes to every biome.",
    missions: [
      mission("grid", "Bring the lights online", "Power all five ZekNova biomes with a connected Solar Grid network.", [["power", 5]]),
      mission("water", "Water for ZekNova", "Connect every biome to the powered planetary water network.", [["water", 5]]),
      mission("tower-one", "Connect and defend the planet", "Deliver planet-wide communications and defensive early-warning coverage.", [["communications", 5], ["defense", 5]]),
      mission("habitat", "A planetary home", "Open powered, watered, connected Habitats across all five biomes.", [["habitat", 5]]),
    ],
  },
  {
    number: 2,
    title: "Public Civilization · Lieutenant",
    subtitle: "Build capitals, hospitals, education, transit, and civic life.",
    missions: [
      mission("governance", "Regional government", "Commission the first Regional Capitol and its public hospital.", [["capitol", 1], ["hospital", 1]]),
      mission("population", "Planetary healthcare", "Extend hospitals and regional government into a second population center.", [["capitol", 2], ["hospital", 2]]),
      mission("research", "Education and medicine", "Open ZekNova's first University Campus and Arctic emergency hospital.", [["university", 1], ["hospital", 3]]),
      mission("culture", "Commerce and transportation", "Establish a civilian trade center and regional transit hub.", [["commerce", 1], ["transit", 1]]),
      mission("supply-route", "Open the supply route", "Create a reliable Wetlands crossing and clear what waits beneath it.", [], [["bridge", 1], ["boat", 1]]),
    ],
  },
  {
    number: 3,
    title: "Corporate Power · Captain",
    subtitle: "Choose the institutions that will control ZekNova's mature economy.",
    missions: [
      mission("stronghold", "The war economy", "Mobilize strategic industry and commission a defense contractor.", [["war_economy", 1], ["defense_contractor", 1]]),
      mission("advanced-research", "Fortune 500 ZekNova", "Establish planet-scale corporate and defense industry.", [["corporate_hq", 1], ["defense_contractor", 1]]),
      mission("tower-ring", "The ZekNova Exchange", "Complete the financial district and open the planetary stock exchange.", [["stock_exchange", 1], ["corporate_hq", 1]]),
    ],
  },
]);

export function createCampaignTiers() {
  return CAMPAIGN_TIERS.map((tier) => ({ ...tier, missions: tier.missions.map((item) => ({ ...item, requirements: [...(item.requirements ?? [])], any: [...(item.any ?? [])], bossEncounter: { ...item.bossEncounter }, subObjectives: (MISSION_OBJECTIVES[item.id] ?? []).map((objective) => ({ ...objective, keys: objective.keys ? [...objective.keys] : undefined })) })) }));
}

export function objectiveValue(objective, context = {}) {
  const buildings = context.buildings ?? context, stats = context.stats ?? {}, biome = context.biomes?.[objective.biome] ?? {};
  if (objective.kind === "building") return Number(buildings[objective.key] ?? 0);
  if (objective.kind === "either") return Math.max(...objective.keys.map((key) => Number(buildings[key] ?? 0)));
  if (objective.kind === "biomeVisit") return biome.visited ? 1 : 0;
  if (objective.kind === "biomeResource") return Number(biome.resources ?? 0);
  if (objective.kind === "biomeStat") {
    const commissioning = commissioningProgressValue(objective, context);
    if (commissioning !== null) return commissioning;
    return Number(biome.stats?.[objective.key] ?? 0);
  }
  if (objective.kind === "biomeBuilding") return Number(biome.buildings?.[objective.key] ?? 0);
  if (objective.kind === "biomeEither") return Math.max(...objective.keys.map((key) => Number(biome.buildings?.[key] ?? 0)));
  if (objective.kind === "boss") return context.bossDefeats?.[objective.missionId] ? 1 : 0;
  return Number(stats[objective.key] ?? 0);
}

export function objectiveComplete(objective, context) { return objectiveValue(objective, context) >= objective.target; }

/**
 * True once every non-boss objective of a mission is satisfied. The boss encounter
 * is the finale of a mission, so it only becomes available after every mission
 * condition has been met (visit, resource recovery, stats, and settlement builds),
 * not just the construction gate.
 */
export function missionReadyForBoss(missionId, context) {
  const rows = (MISSION_OBJECTIVES[missionId] ?? []).filter((objective) => objective.kind !== "boss");
  return rows.length > 0 && rows.every((objective) => objectiveComplete(objective, context));
}

/**
 * Explain the boss gate using the same objective functions that authorize it.
 * UI and routing code must not maintain a second, DOM-derived definition of
 * readiness: that was the source of encounters which looked ready but stalled.
 */
export function bossReadiness(missionId, context = {}) {
  const objectives = MISSION_OBJECTIVES[missionId] ?? [];
  const prerequisites = objectives.filter((objective) => objective.kind !== "boss");
  const bossObjective = objectives.find((objective) => objective.kind === "boss") ?? null;
  const checks = prerequisites.map((objective) => Object.freeze({
    id: objective.id,
    label: objective.label,
    value: objectiveValue(objective, context),
    target: objective.target,
    complete: objectiveComplete(objective, context),
  }));
  const missing = checks.filter((check) => !check.complete);
  return Object.freeze({
    missionId,
    ready: prerequisites.length > 0 && missing.length === 0,
    defeated: Boolean(bossObjective && objectiveComplete(bossObjective, context)),
    completed: checks.length - missing.length,
    total: checks.length,
    checks: Object.freeze(checks),
    missing: Object.freeze(missing),
  });
}
