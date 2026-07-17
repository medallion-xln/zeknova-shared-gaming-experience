export const ENEMY_PROFILES = Object.freeze({
  stalker: { label: "ZekNovan Stalker", nickname: "The Shade", health: 62, speed: 3.45, damage: 12, color: 0x316c7f, height: 3.7, toast: "Camouflage hunter detected. Its outline distorts while moving." },
  saboteur: { label: "ZekNovan Saboteur", nickname: "The Scrapper", health: 48, speed: 4.15, damage: 4, color: 0x41e377, height: 3.25, toast: "Infrastructure raider detected. Protect utility lines and machinery." },
  spitter: { label: "ZekNovan Spitter", nickname: "The Gunner", health: 74, speed: 2.45, damage: 9, color: 0x1ae7c7, height: 3.85, toast: "Ranged Gunner detected. It will retreat, reposition, and fire volleys." },
  skyray: { label: "ZekNovan Skyray", nickname: "The Screecher", health: 56, speed: 4.35, damage: 7, color: 0x26d597, height: 3.8, altitude: 6.2, toast: "Aerial caster detected. Expect strafing bolts and disruption pulses." },
  burrower: { label: "ZekNovan Burrower", nickname: "The Tremor", health: 165, speed: 1.7, damage: 20, color: 0x707c71, height: 4.2, toast: "Seismic contact detected. Moving soil is converging on active machinery." },
});

export const ENEMY_ROSTER = Object.freeze(["stalker", "saboteur", "spitter", "skyray", "burrower", "juggernaut"]);
export const HIGH_FIDELITY_ENEMIES = Object.freeze(new Set(["stalker", "saboteur", "spitter", "skyray"]));

export function enemyProfile(role) {
  return ENEMY_PROFILES[role] ?? null;
}

