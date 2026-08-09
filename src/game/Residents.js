export const RESIDENTS_PER_VILLAGE = 6;
export const TRAVELERS_PER_BIOME = 6;
export const RESIDENT_UPDATE_STEP = 1 / 10;
export const RESIDENT_VISIBLE_DISTANCE = 52;
export const RESIDENT_HIGH_QUALITY_LIMIT = 12;
export const RESIDENT_MODEL_REFRESH_SECONDS = 2;
export const RESIDENT_GRID_CELL_SIZE = 5;

export function residentPersonalSpace(kind = "villager") {
  return kind === "traveler" ? 4.2 : 3.8;
}

export function residentSeparationWeight(distance, preferredDistance) {
  const distanceValue = Math.max(0, Number(distance) || 0);
  const preferredValue = Math.max(0.01, Number(preferredDistance) || 0.01);
  return Math.max(0, Math.min(1, (preferredValue - distanceValue) / preferredValue));
}

export const VILLAGE_RESIDENT_ANCHORS = Object.freeze([
  Object.freeze({ id: "forest-village", biome: "forest", x: -72, z: -30 }),
  Object.freeze({ id: "desert-village", biome: "desert", x: -36, z: 30 }),
]);

export function residentMode({ bossActive = false, distanceToHome = 0, distanceToShelter = distanceToHome, returning = false } = {}) {
  if (bossActive) return distanceToShelter <= 1.1 ? "sheltered" : "seeking-shelter";
  if (returning) return "returning";
  return "roaming";
}
