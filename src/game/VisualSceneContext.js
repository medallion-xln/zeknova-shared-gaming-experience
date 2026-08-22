/** Compact, deterministic scene description for Picasso's visual compiler. */
const MATERIAL_HINTS = Object.freeze({
  forest: ["organic", "wood", "water"],
  desert: ["sand", "stone", "metal"],
  highlands: ["stone", "metal", "crystal"],
  arctic: ["ice", "snow", "metal"],
  wetlands: ["water", "organic", "mist"],
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createVisualSceneContext(game, theme = "zeknova") {
  const biome = String(game?.currentAO?.id || game?.currentBiome || game?.biome || "forest");
  const mission = game?.getMissionContext?.()?.missionIndex ?? game?.ui?.lastState?.missionIndex ?? 0;
  const boss = String(game?.bossManager?.config?.id || game?.bossManager?.active?.config?.id || "");
  const hostileCount = Array.isArray(game?.enemies)
    ? game.enemies.filter((enemy) => enemy?.visible !== false && enemy?.userData?.hostile !== false).length
    : 0;
  const playerHealth = finite(game?.player?.health, 100);
  const combatIntensity = Math.max(0, Math.min(1, hostileCount / 12 + (100 - playerHealth) / 200));
  const timeOfDay = String(game?.timeOfDay || "day");
  const weather = String(game?.weather || (biome === "wetlands" ? "mist" : biome === "arctic" ? "snow" : "clear"));
  return Object.freeze({
    biome,
    mission: finite(mission, 0),
    boss,
    timeOfDay,
    weather,
    combatIntensity: +combatIntensity.toFixed(3),
    dominantMaterials: Object.freeze([...(MATERIAL_HINTS[biome] || ["organic", "stone", "metal"])]),
    theme: String(theme || "zeknova"),
  });
}

export default createVisualSceneContext;
