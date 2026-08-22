export const GAME_MODES = Object.freeze({ BATTLE: "battle", CIVILIAN: "civilian" });

const CAPABILITIES = Object.freeze({
  battle: Object.freeze({
    combatHud: true, hostilePatrols: true, ambientEnemySpawning: true, bossWarnings: true,
    civilianHud: false, civilianInteractions: false, activityLabels: false,
    mapMarkers: Object.freeze(["mission", "player", "patrol", "boss", "arena"]),
    objectivePriority: Object.freeze(["Guardian Encounter", "Commissioning", "Exploration", "Resources", "Construction", "Diplomacy"]),
  }),
  civilian: Object.freeze({
    combatHud: false, hostilePatrols: false, ambientEnemySpawning: false, bossWarnings: false,
    civilianHud: true, civilianInteractions: true, activityLabels: true,
    mapMarkers: Object.freeze(["mission", "player", "building", "transit", "resource", "settlement", "research", "inactive"]),
    objectivePriority: Object.freeze(["Exploration", "Construction", "Resources", "Diplomacy", "Commissioning", "Guardian Encounter"]),
  }),
});

export function normalizeGameMode(value) {
  return String(value || "").toLowerCase() === GAME_MODES.CIVILIAN ? GAME_MODES.CIVILIAN : GAME_MODES.BATTLE;
}

export function isBattleMode(value) { return normalizeGameMode(value) === GAME_MODES.BATTLE; }
export function isCivilianMode(value) { return normalizeGameMode(value) === GAME_MODES.CIVILIAN; }
export function getModeCapabilities(value) { return CAPABILITIES[normalizeGameMode(value)]; }

export function markerAllowed(mode, kind, { explicitMission = false } = {}) {
  if (explicitMission && ["mission", "boss", "arena"].includes(kind)) return true;
  return getModeCapabilities(mode).mapMarkers.includes(kind);
}

export function orderObjectivesForMode(objectives, mode) {
  const order = getModeCapabilities(mode).objectivePriority;
  return [...objectives].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}

export function isScriptedConfrontationActor(actor) {
  const data = actor?.userData || {};
  return Boolean(data.guardian || data.boss || data.missionId || data.commissioningAttacker || data.scriptedEncounter || data.forcedEncounter);
}

export function simulationTier(distance, mode = "battle") {
  const d = Math.max(0, Number(distance) || 0);
  if (d <= 26) return "near";
  if (d <= (isCivilianMode(mode) ? 55 : 68)) return "mid";
  if (d <= 105) return "far";
  return "off-biome";
}
