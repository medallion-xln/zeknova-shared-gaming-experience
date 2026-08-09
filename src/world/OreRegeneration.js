export const ORE_RESPAWN_MIN_MS = 60 * 60 * 1000;
export const ORE_RESPAWN_MAX_MS = 90 * 60 * 1000;
export const MIN_AVAILABLE_MISSION_ORE_PER_BIOME = 4;

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function oreRespawnDelayMs(rockId) {
  const minuteRange = Math.floor((ORE_RESPAWN_MAX_MS - ORE_RESPAWN_MIN_MS) / 60000);
  return ORE_RESPAWN_MIN_MS + (stableHash(rockId) % (minuteRange + 1)) * 60000;
}

export function oreReadyToRespawn(rockId, minedAt, now = Date.now()) {
  const timestamp = Number(minedAt);
  return Number.isFinite(timestamp) && timestamp > 0 && now - timestamp >= oreRespawnDelayMs(rockId);
}

export function reconcileLegacyBiomeMining({ rocks = [], minedRockIds = [], biomeAt, biomeStats = {} } = {}) {
  const repaired = Object.fromEntries(Object.entries(biomeStats).map(([id, stats]) => [id, { ...stats }]));
  const mined = minedRockIds instanceof Set ? minedRockIds : new Set(minedRockIds);
  const discovered = {};

  for (const rock of rocks) {
    const rockId = String(rock?.userData?.rockId ?? "");
    if (!rockId || !mined.has(rockId)) continue;
    const biomeId = biomeAt?.(Number(rock.position?.x), Number(rock.position?.z))?.id;
    if (biomeId) discovered[biomeId] = Number(discovered[biomeId] ?? 0) + 1;
  }

  let repairs = 0;
  for (const [biomeId, count] of Object.entries(discovered)) {
    const stats = repaired[biomeId] ?? (repaired[biomeId] = {});
    const previous = Number(stats.rocksMined ?? 0);
    if (count <= previous) continue;
    stats.rocksMined = count;
    repairs += count - previous;
  }
  return { biomeStats: repaired, repairs, discovered };
}
