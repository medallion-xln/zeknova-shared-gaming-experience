export const MECH_ASSIST_PROFILES = Object.freeze({
  ensign: Object.freeze({ range: 22, bossRange: 42, damage: 8, bossDamage: 6, combatCooldown: 1.45, workCooldown: 1.3, workRange: 10 }),
  lieutenant: Object.freeze({ range: 26, bossRange: 46, damage: 14, bossDamage: 10, combatCooldown: 1.15, workCooldown: 1.05, workRange: 11 }),
  captain: Object.freeze({ range: 30, bossRange: 50, damage: 22, bossDamage: 15, combatCooldown: 0.9, workCooldown: 0.9, workRange: 12 }),
});

export function mechAssistProfile(rank = "ensign") {
  return MECH_ASSIST_PROFILES[rank] ?? MECH_ASSIST_PROFILES.ensign;
}

export function mechAssistPriority({ bossActive = false, hostileDistance = Infinity, oreDistance = Infinity, treeDistance = Infinity, range = 22, workRange = 10 } = {}) {
  if (bossActive) return "boss";
  if (hostileDistance <= range) return "hostile";
  if (oreDistance <= workRange) return "ore";
  if (treeDistance <= workRange) return "tree";
  return "follow";
}
