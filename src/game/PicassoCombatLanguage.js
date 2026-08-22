/**
 * Deterministic combat-art vocabulary for Picasso.
 *
 * This module describes appearance only. It intentionally has no access to the
 * game, physics, damage, mission, save, economy, or multiplayer systems.
 */
export const PICASSO_COMBAT_AUTHORITY = Object.freeze({
  level: "R0",
  role: "visual-only",
  canDispatchGameplay: false,
  canMutateWorld: false,
  canModifyMissionState: false,
  canModifyPhysics: false,
  canModifySaveState: false,
  canModifyCollision: false,
  canModifyCombatOutcomes: false,
  canModifyEconomy: false,
  canModifyMultiplayerSync: false,
});

export const PICASSO_PROJECTILE_FAMILIES = Object.freeze([
  "orb",
  "cone",
  "prism",
  "beam",
  "lance",
  "disc",
  "shard",
  "spike",
  "ring",
  "wave_slash",
  "segmented_trail",
  "energy_wall",
]);

export const PICASSO_ATTACK_LANGUAGES = Object.freeze({
  organic: Object.freeze(["orb", "cone", "spike", "lance", "segmented_trail"]),
  mechanical: Object.freeze(["beam", "prism", "lance", "disc", "energy_wall"]),
  mystical: Object.freeze(["ring", "shard", "wave_slash", "disc", "segmented_trail"]),
  marine: Object.freeze(["prism", "beam", "lance", "disc"]),
});

const ORGANIC = /spore|fung|thorn|root|mire|mud|bloom|pod|brood|swarm|tremor|undertow/i;
const MECHANICAL = /arc_gunner|\barc\b|rail|electric|grid|lightning|solar|sunscar|cinder|scrapper|hex|gunner/i;
const MYSTICAL = /shade|screecher|whiteout|frost|ice|blizzard|storm|thunder|crown|cryo|dream/i;

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function combatIdentityFor({ bossId = "", enemyType = "", patternId = "" } = {}) {
  const key = `${bossId} ${enemyType} ${patternId}`;
  if (ORGANIC.test(key)) return "organic";
  if (MECHANICAL.test(key)) return "mechanical";
  if (MYSTICAL.test(key)) return "mystical";
  return enemyType === "marine" || enemyType === "player" ? "marine" : "mystical";
}

export function projectileShapeFor(context = {}) {
  const key = `${context.bossId ?? ""} ${context.enemyType ?? ""} ${context.patternId ?? ""}`.toLowerCase();
  if (/beam|laser/.test(key)) return "beam";
  if (/rail|lance|root_line|thorn/.test(key)) return "lance";
  if (/wall|lane|grid/.test(key)) return "energy_wall";
  if (/ring|shockwave|pulse|crown/.test(key)) return "ring";
  if (/slash|crescent|sweep/.test(key)) return "wave_slash";
  if (/shard|hail|ice|cryo/.test(key)) return "shard";
  if (/spike|eruption/.test(key)) return "spike";
  if (/disc|hex/.test(key)) return "disc";
  if (/spiral|swarm|segmented/.test(key)) return "segmented_trail";
  if (/fan|cone|spray/.test(key)) return "cone";
  if (/prism|arc|electric|fastball/.test(key)) return "prism";
  const identity = combatIdentityFor(context);
  const language = PICASSO_ATTACK_LANGUAGES[identity];
  return language[stableHash(key) % language.length];
}

export function generateCombatVisualDescriptor(context = {}) {
  const identity = combatIdentityFor(context);
  const shape = projectileShapeFor(context);
  return Object.freeze({
    appearanceOnly: true,
    authority: PICASSO_COMBAT_AUTHORITY,
    identity,
    shape,
    silhouetteKey: `${identity}:${shape}`,
    deterministic: true,
  });
}

export default Object.freeze({
  authority: PICASSO_COMBAT_AUTHORITY,
  families: PICASSO_PROJECTILE_FAMILIES,
  languages: PICASSO_ATTACK_LANGUAGES,
  combatIdentityFor,
  projectileShapeFor,
  generateCombatVisualDescriptor,
});
