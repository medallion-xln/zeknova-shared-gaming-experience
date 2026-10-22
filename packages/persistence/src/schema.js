/**
 * Save schema knowledge for ZekNova snapshots (server accepts versions 1–4; see api/save.php)
 * plus the engine-owned extension block `zge` (schema zge.save-extension.v1) that carries
 * progression fields the legacy snapshot omits (player XP). The server stores unknown
 * top-level keys verbatim, so no PHP change is needed.
 */
export const LEGACY_VERSIONS = Object.freeze([1, 2, 3, 4]);
export const CURRENT_LEGACY_VERSION = 4;
export const EXTENSION_SCHEMA = "zge.save-extension.v1";
export const MAX_BUILDINGS = 3000;

export class SaveSchemaError extends Error { constructor(message, detail = {}) { super(message); this.name = "SaveSchemaError"; Object.assign(this, detail); } }

/** Structural validation mirroring api/save.php's acceptance rules. */
export function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new SaveSchemaError("snapshot must be an object");
  if (!LEGACY_VERSIONS.includes(snapshot.version)) throw new SaveSchemaError(`unsupported snapshot version ${snapshot.version}`, { version: snapshot.version });
  if (!Array.isArray(snapshot.buildings)) throw new SaveSchemaError("snapshot.buildings must be an array");
  if (snapshot.buildings.length > MAX_BUILDINGS) throw new SaveSchemaError(`snapshot exceeds ${MAX_BUILDINGS} buildings`, { count: snapshot.buildings.length });
  if (typeof snapshot.user?.teamCode !== "string" || !snapshot.user.teamCode) throw new SaveSchemaError("snapshot.user.teamCode is required");
  return snapshot;
}

/** Normalise any accepted legacy version to the v4 shape with defaults. Returns { snapshot, steps }. */
export function migrateSnapshot(input) {
  validateSnapshot(input);
  const steps = [];
  const snapshot = JSON.parse(JSON.stringify(input));
  if (snapshot.version < 2) { snapshot.worldProgress = { harvestedTreeIds: [], collectedPowerUpIds: [], ...(snapshot.worldProgress ?? {}) }; steps.push("v1→v2: worldProgress"); snapshot.version = 2; }
  if (snapshot.version < 3) { snapshot.missionStats = { ...(snapshot.missionStats ?? {}) }; snapshot.combat = { specialGauge: 0, ...(snapshot.combat ?? {}) }; steps.push("v2→v3: missionStats, combat"); snapshot.version = 3; }
  if (snapshot.version < 4) { snapshot.worldProgress = { minedRockIds: [], treeHarvestedAt: {}, ...(snapshot.worldProgress ?? {}) }; snapshot.diplomacy = { outcome: null, tension: 50, safeZoneCenter: null, ...(snapshot.diplomacy ?? {}) }; steps.push("v3→v4: minedRockIds, treeHarvestedAt, diplomacy"); snapshot.version = 4; }
  snapshot.worldProgress = { harvestedTreeIds: [], treeHarvestedAt: {}, collectedPowerUpIds: [], minedRockIds: [], ...(snapshot.worldProgress ?? {}) };
  snapshot.player = { x: 0, y: 0, z: 0, health: 100, stamina: 100, ...(snapshot.player ?? {}) };
  snapshot.resources = { ...(snapshot.resources ?? {}) };
  return { snapshot, steps };
}

/** Attach / read the engine extension block. */
export function attachExtension(snapshot, { xp = null, officerClass = null, rankXp = null, extra = null } = {}) {
  const zge = { schema: EXTENSION_SCHEMA, savedAt: new Date().toISOString(), player: {} };
  if (Number.isFinite(xp)) zge.player.xp = xp;
  if (typeof officerClass === "string") zge.player.officerClass = officerClass;
  if (Number.isFinite(rankXp)) zge.player.rankXp = rankXp;
  if (extra && typeof extra === "object") zge.extra = extra;
  return { ...snapshot, zge };
}

export function readExtension(saved) {
  const zge = saved?.zge;
  if (!zge || zge.schema !== EXTENSION_SCHEMA) return null;
  return Object.freeze({ schema: zge.schema, savedAt: zge.savedAt ?? null, player: { xp: Number.isFinite(zge.player?.xp) ? zge.player.xp : null, officerClass: zge.player?.officerClass ?? null, rankXp: Number.isFinite(zge.player?.rankXp) ? zge.player.rankXp : null }, extra: zge.extra ?? null });
}

/** Allocate once per intent; SaveTransport persists and reuses it for idempotent retries. */
export function operationId(seq, teamCode, userId) { return `zge-${String(teamCode).slice(0,24)}-${String(userId).slice(0,24)}-${seq}-${globalThis.crypto.randomUUID()}`; }
