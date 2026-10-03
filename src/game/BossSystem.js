import { scaleAttackProfile, scaleProjectilePattern, healthScale, identityScale, DIFFICULTY } from "./CampaignPlan.js";
import { ENEMY_PROFILES } from "./Enemies.js";

export const BOSS_HEALTH_MULTIPLIER = 10;
export const BOSS_PROJECTILE_LIMITS = Object.freeze({
  maximumActive: 250,
  maximumRootHazards: 8,
  maximumSporeIndicators: 20,
  maximumPatternDuration: 12,
  // Recovery is the breathing room between patterns. Shortening it is the single
  // biggest difficulty lever: the boss chains attacks instead of pausing.
  minimumRecovery: 0.55,
});

export const BOSS_DAMAGE_MULTIPLIERS = Object.freeze({
  phase_1: 1.6,
  phase_2: 2.0,
  phase_3: 2.5,
});

// The animation wind-up is part of the dodge language. Recovery is deliberately
// kept between two and three seconds so complex formations never chain blindly.
export const BOSS_ATTACK_PROFILES = Object.freeze({
  desert_sunscar_colossus: Object.freeze({ windup: 0.9, recovery: 2.2, heavyRecovery: 2.7, ultimateRecovery: 3, maxCarryover: 30, projectilePlan: "aimed artillery, then expanding rings" }),
  wetlands_mire_siren: Object.freeze({ windup: 1.05, recovery: 2.25, heavyRecovery: 2.7, ultimateRecovery: 3, maxCarryover: 32, projectilePlan: "safe-gap rings and delayed flood lanes" }),
  forest_ancient_thornwarden: Object.freeze({ windup: 1.1, recovery: 2.3, heavyRecovery: 2.75, ultimateRecovery: 3, maxCarryover: 34, projectilePlan: "root lanes followed by radial thorns" }),
  highlands_stormback: Object.freeze({ windup: 0.8, recovery: 2.1, heavyRecovery: 2.65, ultimateRecovery: 3, maxCarryover: 28, projectilePlan: "hook feints, lane control, lightning crown" }),
  arctic_white_screecher: Object.freeze({ windup: 0.75, recovery: 2.15, heavyRecovery: 2.65, ultimateRecovery: 3, maxCarryover: 28, projectilePlan: "strafing fans, marked hail, committed dive" }),
  wetlands_drowned_tremor: Object.freeze({ windup: 1.05, recovery: 2.1, heavyRecovery: 2.6, ultimateRecovery: 2.9, maxCarryover: 32, projectilePlan: "leap→aerial radial burst → shockwave → descending lanes (telegraphed, safe-gap)" }),
  arctic_archive_shade: Object.freeze({ windup: 0.9, recovery: 2.2, heavyRecovery: 2.7, ultimateRecovery: 3, maxCarryover: 30, projectilePlan: "slash fans, spinning walls, judgment burst" }),
  forest_spore_cantor: Object.freeze({ windup: 1, recovery: 2.15, heavyRecovery: 2.6, ultimateRecovery: 2.9, maxCarryover: 34, projectilePlan: "6/9 pinball bounces, rotating fungal ring, bouncing walls, dividing spores" }),
  desert_cinder_scrapper: Object.freeze({ windup: 0.85, recovery: 2.2, heavyRecovery: 2.7, ultimateRecovery: 3, maxCarryover: 28, projectilePlan: "single slashes, combo barrages, judgment finale" }),
  wetlands_broodwarden: Object.freeze({ windup: 0.7, recovery: 2, heavyRecovery: 2.5, ultimateRecovery: 2.9, maxCarryover: 26, projectilePlan: "short swarm bursts separated by relocation windows" }),
  highlands_arc_gunner: Object.freeze({ windup: 0.8, recovery: 2.0, heavyRecovery: 2.5, ultimateRecovery: 2.9, maxCarryover: 32, projectilePlan: "rotating arcs, railgun lanes, electric grid, lightning nodes, bullet walls, shield" }),
  forest_rootbound_tremor: Object.freeze({ windup: 1.1, recovery: 2.3, heavyRecovery: 2.75, ultimateRecovery: 3, maxCarryover: 34, projectilePlan: "ground waves, alternating roots, final collapse" }),
});

export const BOSS_DEFENSE_PROFILES = Object.freeze({
  desert_sunscar_colossus: Object.freeze({ kind: "shield", label: "Solar Aegis" }),
  wetlands_mire_siren: Object.freeze({ kind: "dodge", label: "Undertow Slip" }),
  forest_ancient_thornwarden: Object.freeze({ kind: "shield", label: "Ironbark Guard" }),
  highlands_stormback: Object.freeze({ kind: "dodge", label: "Thunderstep" }),
  arctic_white_screecher: Object.freeze({ kind: "dodge", label: "Whiteout Veer" }),
  wetlands_drowned_tremor: Object.freeze({ kind: "shield", label: "Pressure Carapace" }),
  arctic_archive_shade: Object.freeze({ kind: "dodge", label: "Redaction Shift" }),
  forest_spore_cantor: Object.freeze({ kind: "shield", label: "Spore Veil" }),
  desert_cinder_scrapper: Object.freeze({ kind: "shield", label: "Obsidian Parry" }),
  wetlands_broodwarden: Object.freeze({ kind: "dodge", label: "Swarm Dispersal" }),
  highlands_arc_gunner: Object.freeze({ kind: "dodge", label: "Arc Blink" }),
  forest_rootbound_tremor: Object.freeze({ kind: "shield", label: "Rootwall" }),
});

export function bossDefenseProfile(configOrId) {
  const id = typeof configOrId === "string" ? configOrId : configOrId?.id;
  const defense = BOSS_DEFENSE_PROFILES[id] ?? { kind: "shield", label: "Guardian Ward" };
  return Object.freeze({ ...defense, cooldown: 10, duration: defense.kind === "shield" ? 1.6 : 0.35, damageFraction: 0.1, minimumDamage: 1 });
}

const ULTIMATE_PATTERN = /finale|final_|final_sequence|collapse|crown|sky_barrage|overcharge|blizzard|tempest|deluge/i;
const HEAVY_PATTERN = /barrage|charge|storm|spiral|lanes|eruption|meteor|whiteout|rolling|wall|double|dive|pinball/i;

export function bossAttackTiming(configOrId, patternId = "", phaseId = "phase_1") {
  const id = typeof configOrId === "string" ? configOrId : configOrId?.id;
  const profile = BOSS_ATTACK_PROFILES[id] ?? { windup: 1, recovery: 2.25, heavyRecovery: 2.7, ultimateRecovery: 3, maxCarryover: 30, projectilePlan: "telegraphed formation" };
  const tier = ULTIMATE_PATTERN.test(patternId) ? "ultimate" : HEAVY_PATTERN.test(patternId) ? "heavy" : "standard";
  const recovery = tier === "ultimate" ? profile.ultimateRecovery : tier === "heavy" ? profile.heavyRecovery : profile.recovery;
  const windup = profile.windup + (tier === "heavy" ? 0.25 : tier === "ultimate" ? 0.55 : 0) + (phaseId === "phase_3" ? 0.1 : 0);

  /* Campaign scaling. Every Guardian used to attack at the same cadence in
     mission 12 as in mission 1, so the late campaign got easier as the player
     improved. scaleAttackProfile shortens windup and recovery toward mission
     12 — and clamps windup at a reaction floor, so "faster" never becomes
     "untelegraphed". The boss's own mission decides the amount, which means a
     Guardian refought earlier is not permanently harder. */
  const missionId = typeof configOrId === "string"
    ? BOSS_CONFIGS?.[configOrId]?.missionId
    : configOrId?.missionId;
  const scaled = scaleAttackProfile({ windup, recovery }, missionId);
  const readableRecovery = Math.max(2, scaled.recovery);

  return Object.freeze({
    tier,
    windup: scaled.windup,
    recovery: readableRecovery,
    cooldown: scaled.windup + readableRecovery,
    difficultyProgress: scaled.difficultyProgress,
    maxCarryover: profile.maxCarryover,
    projectilePlan: profile.projectilePlan,
  });
}

const bossRows = [
  ["grid", "desert_sunscar_colossus", "The Sunscar Colossus", "Warden of the Exposed Seam", "desert", "burrower", 0xf6a94a],
  ["water", "wetlands_mire_siren", "The Mire Siren", "Voice of the Living Watershed", "wetlands", "skyray", 0x57e7cc],
  ["habitat", "forest_ancient_thornwarden", "The Ancient Thornwarden", "Guardian of the Living Canopy", "forest", "stalker", 0x9fe45c],
  ["tower-one", "highlands_stormback", "The Stormback", "Breaker of the Ridgeline", "highlands", "spitter", 0x8fd7ff],
  ["tower-ring", "arctic_white_screecher", "The White Screecher", "Cry of the Frozen Reach", "arctic", "skyray", 0xbdefff],
  ["supply-route", "wetlands_drowned_tremor", "The Drowned Tremor", "Beneath the Supply Line", "wetlands", "burrower", 0x4fcdb4],
  ["research", "arctic_archive_shade", "The Archive Shade", "Keeper of the Climate Vault", "arctic", "stalker", 0x94dcff],
  ["culture", "forest_spore_cantor", "The Spore Cantor", "Herald of the Sacred Grove", "forest", "spitter", 0xb6f06a],
  ["governance", "desert_cinder_scrapper", "The Obsidian Demon Knight", "Ashen Marshal of the Glass Flats", "desert", "saboteur", 0xd93a1e],
  ["population", "wetlands_broodwarden", "The Insect King", "Hive Emperor of the Reed Cities", "wetlands", "stalker", 0xc9a227],
  ["advanced-research", "highlands_arc_gunner", "The Arc Gunner", "Sentinel of the Thunder Crown", "highlands", "spitter", 0x8fa8ff],
  ["stronghold", "forest_rootbound_tremor", "The Rootbound Tremor", "Last Guardian of the Canopy", "forest", "burrower", 0xd1f06a],
];

function makePhases(color) {
  return [
    { id: "phase_1", label: "PHASE I · PATTERN RECOGNITION", healthMinPercent: 0.67, color, patterns: ["thorn_radial_burst", "spore_rain", "root_ground_wave"] },
    { id: "phase_2", label: "PHASE II · ARENA CONTROL", healthMinPercent: 0.34, color, patterns: ["double_thorn_spiral", "targeted_root_eruptions", "rotating_thorn_wall"] },
    { id: "phase_3", label: "PHASE III · CANOPY STORM", healthMinPercent: 0, color, patterns: ["canopy_storm", "alternating_root_lanes", "thornwarden_final_sequence"] },
  ];
}

function makeSunscarPhases(color) {
  return [
    { id: "phase_1", label: "PHASE I · SUNSCAR PITCH", healthMinPercent: 0.67, color, patterns: ["sunscar_fastball", "sunscar_focused_charge", "sunscar_shockwave"] },
    { id: "phase_2", label: "PHASE II · SOLAR PRESSURE", healthMinPercent: 0.34, color, patterns: ["sunscar_double_fastball", "sunscar_focused_charge", "sunscar_meteor_ring"] },
    { id: "phase_3", label: "PHASE III · CORE OVERDRIVE", healthMinPercent: 0, color, patterns: ["sunscar_fastball_barrage", "sunscar_focused_overcharge", "sunscar_finale"] },
  ];
}

function makeMireSirenPhases(color) {
  return [
    { id: "phase_1", label: "PHASE I · TIDAL HYMN", healthMinPercent: 0.67, color, patterns: ["siren_pulse_ring", "bog_bolt_fan", "undertow_mark"] },
    { id: "phase_2", label: "PHASE II · DROWNED CHORUS", healthMinPercent: 0.34, color, patterns: ["double_tidal_spiral", "brackish_geysers", "flood_lanes"] },
    { id: "phase_3", label: "PHASE III · WATERSHED TEMPEST", healthMinPercent: 0, color, patterns: ["mire_tempest", "siren_hunt", "drowning_finale"] },
  ];
}

function makeStormbackPhases(color) {
  return [
    { id: "phase_1", label: "PHASE I · RIDGELINE CHALLENGE", healthMinPercent: 0.67, color, patterns: ["thunder_punch", "shale_bolt_fan", "static_ring"] },
    { id: "phase_2", label: "PHASE II · BREAKER'S ASCENT", healthMinPercent: 0.34, color, patterns: ["seismic_hook", "rolling_stormfront", "faultline_lanes"] },
    { id: "phase_3", label: "PHASE III · TEMPEST BACK", healthMinPercent: 0, color, patterns: ["stormback_charge", "lightning_crown", "ridgeline_finale"] },
  ];
}

function makeWhiteScreecherPhases(color) {
  return [
    { id: "phase_1", label: "PHASE I · FROSTWING HUNT", healthMinPercent: 0.67, color, patterns: ["screecher_frost_fan", "screecher_strafing_run", "screecher_cryo_ring"] },
    { id: "phase_2", label: "PHASE II · WHITEOUT CHORUS", healthMinPercent: 0.34, color, patterns: ["screecher_whiteout_spiral", "screecher_hail_marks", "screecher_ice_lanes"] },
    { id: "phase_3", label: "PHASE III · FROZEN SKY", healthMinPercent: 0, color, patterns: ["screecher_blizzard_dive", "screecher_sky_barrage", "screecher_finale"] },
  ];
}

// Returnal slice: each pilot boss gets a 3-phase identity with geometric bullet-hell patterns,
// deterministic telegraphs, and phase-gated weak-point windows. Patterns reuse the shared
// projectile primitives so VFX/pooling/telegraph budgets stay consistent.
export const RETURNAL_TELEGRAPH = Object.freeze({ standard: 0.85, heavy: 1.1, ultimate: 1.45, ringWidth: 0.22, gapDegrees: 28 });
export const RETURNAL_WEAKPOINT = Object.freeze({ windowMs: 2600, bonusMultiplier: 2.1, stunMs: 1100 });
export const RETURNAL_PERF_BUDGET = Object.freeze({ maxProjectilesPerPattern: 28, maxSimultaneousPatterns: 2, patternPoolReserve: 60, frameBudgetMs: 4 });

// Reusable combat primitives — single source for telegraph math, gap enforcement, and
// phase-transition sequencing so the 12 bosses can share the same readable language.
export const RETURNAL_PATTERN_SPECS = Object.freeze({
  // Drowned Tremor — leap/hover, shockwave, aerial radial, descending lanes, tracking spray, delayed hazard
  tremor_aerial_burst: Object.freeze({ type: "radial", count: 18, speed: 6.2, gapEvery: 6, telegraph: 0.85, weakPointOnComplete: true }),
  tremor_aerial_pinball: Object.freeze({ type: "pinball", countPhase1: 6, countPhase3: 9, bounces: 4, speed: 7.5, telegraph: 0.9 }),
  tremor_shockwave: Object.freeze({ type: "expanding_ring", count: 22, speed: 5.0, gapEvery: 7, telegraph: 1.1 }),
  tremor_descending_lanes: Object.freeze({ type: "lanes", lanes: 5, spacing: 2.4, speed: 6.8, telegraph: 1.15, gapLane: 2 }),
  tremor_tracking_spray: Object.freeze({ type: "tracking", count: 7, spread: 0.82, speed: 7.6, telegraph: 0.72 }),
  tremor_delayed_eruption: Object.freeze({ type: "delayed_hazard", count: 4, gapEvery: 6, telegraph: 0.9 }),
  // Spore Cantor — 6/9 pinball, rotating rings, bouncing walls, splitting, spiral, converging lanes
  spore_fungal_ring: Object.freeze({ type: "rotating_ring", rings: 2, countPerRing: 14, gapEvery: 5, speed: 4.2, rotationDegPerSec: 18, telegraph: 0.9 }),
  spore_bouncing_wall: Object.freeze({ type: "wall", count: 12, speed: 5.6, bounces: 2, gapEvery: 4, telegraph: 1.0 }),
  spore_dividing_swarm: Object.freeze({ type: "dividing", initial: 8, splitsOnExpire: 2, speed: 5.2, telegraph: 0.85 }),
  spore_spiral_bloom: Object.freeze({ type: "spiral", arms: 2, shots: 16, speed: 5.4, telegraph: 0.95 }),
  spore_converging_lanes: Object.freeze({ type: "lanes", lanes: 5, spacing: 2.2, speed: 5.8, telegraph: 1.05, gapLane: 2 }),
  spore_delayed_bloom: Object.freeze({ type: "delayed_hazard", count: 6, fall: 12, homing: 1.2, telegraph: 1.1 }),
  // Arc Gunner — railgun lanes, rotating arcs, advancing walls, lightning nodes, grid, shield
  arc_rotating_burst: Object.freeze({ type: "rotating_burst", arms: 3, shotsPerArm: 6, speed: 6.5, spinRate: 0.45, telegraph: 0.85 }),
  arc_railgun_lanes: Object.freeze({ type: "lanes", lanes: 3, spacing: 2.8, speed: 11, damage: 22, telegraph: 1.3, gapLane: 1 }),
  arc_electric_grid: Object.freeze({ type: "grid", rows: 4, cols: 4, gapPattern: "checker", speed: 0, telegraph: 1.25 }),
  arc_lightning_nodes: Object.freeze({ type: "nodes", count: 5, tetherDamage: 9, telegraph: 1.0 }),
  arc_bullet_wall: Object.freeze({ type: "advancing_wall", count: 16, speed: 4.0, gapEvery: 4, telegraph: 1.0 }),
  arc_shield_phase: Object.freeze({ type: "shield_burn", shieldHp: 180, telegraph: 1.45, weakPointOnBreak: true }),
  arc_tracking_volley: Object.freeze({ type: "tracking", count: 5, spread: 0.42, speed: 10.2, telegraph: 0.78 }),
});

export const WEAPON_TRAITS = Object.freeze({
  chainLightning: Object.freeze({ id: "chain_lightning", label: "Chain Lightning", desc: "Shots chain to 2 nearby hostiles on hit", bonus: 1.18 }),
  ricochet: Object.freeze({ id: "ricochet", label: "Ricochet Rounds", desc: "Projectiles bounce twice; +18% weak-point bonus", bonus: 1.18 }),
  explosiveImpact: Object.freeze({ id: "explosive_impact", label: "Explosive Impact", desc: "Direct hits spawn 6-damage splash within 3.2m", bonus: 1.15 }),
  armorPenetration: Object.freeze({ id: "armor_penetration", label: "Armor Penetration", desc: "Ignores 40% of shield/boss DR", bonus: 1.2 }),
  splitting: Object.freeze({ id: "splitting", label: "Fission Rounds", desc: "Projectile splits into 3 on expire", bonus: 1.14 }),
  weakPointBonus: Object.freeze({ id: "weak_point_bonus", label: "Weak-Point Amplifier", desc: "+55% damage during weak-point window", bonus: 1.55 }),
  shieldGeneration: Object.freeze({ id: "shield_generation", label: "Aegis Bloom", desc: "3 consecutive weak hits generate 25 shield", bonus: 1.12 }),
  cooldownReduction: Object.freeze({ id: "cooldown_reduction", label: "Rapid Cycling", desc: "-30% alt-fire cooldown", bonus: 0.7 }),
});

export const ALT_FIRE_PROFILES = Object.freeze({
  arc_pulse: Object.freeze({ id: "arc_pulse", cooldown: 5.0, damage: 72, label: "Arc Pulse", effect: "chain", radius: 6.5 }),
  gravity_lance: Object.freeze({ id: "gravity_lance", cooldown: 6.2, damage: 110, label: "Gravity Lance", effect: "pierce", pierce: true }),
  drone_barrage: Object.freeze({ id: "drone_barrage", cooldown: 7.5, damage: 14, label: "Drone Barrage", effect: "barrage", count: 12 }),
  plasma_burst: Object.freeze({ id: "plasma_burst", cooldown: 4.8, damage: 88, label: "Plasma Burst", effect: "radial", count: 14 }),
  quantum_mine: Object.freeze({ id: "quantum_mine", cooldown: 6.0, damage: 95, label: "Quantum Mine", effect: "delayed", delay: 1.25 }),
});

export const RISK_REWARD_CHOICES = Object.freeze([
  Object.freeze({ id: "overclocked_servo", label: "Overclocked Servo", upside: "+22% dodge speed, +14% fire rate", downside: "+25% weapon heat, -12% heat dissipation", buff: { dodgeSpeed: 1.22, fireRate: 1.14, weaponHeat: 1.25, duration: 60 } }),
  Object.freeze({ id: "quantum_lens", label: "Quantum Lens", upside: "+45% weak-point damage", downside: "+30% incoming damage", buff: { weakPoint: 1.45, incoming: 1.30, duration: 60 } }),
  Object.freeze({ id: "adrenaline", label: "Adrenaline Pact", upside: "+25% damage, +12% move speed for 45s", downside: "enemies deal +18% damage", buff: { damage: 1.25, speed: 1.12, incoming: 1.18, duration: 45 } }),
  Object.freeze({ id: "glass_cannon", label: "Glass Cannon", upside: "+40% weak-point damage", downside: "-20% max HP for encounter", buff: { weakPoint: 1.4, maxHp: 0.8, duration: 0 } }),
  Object.freeze({ id: "stable_loop", label: "Stable Loop", upside: "No downside, +10% credits", downside: "none", buff: { credits: 1.1, duration: 0 } }),
]);

export function riskRewardForSeed(seed = 0) {
  const idx = Math.abs(Number(seed) | 0) % RISK_REWARD_CHOICES.length;
  return RISK_REWARD_CHOICES[idx];
}

function makeDrownedTremorPhases(color) {
  return [
    { id: "phase_1", label: "PHASE I · SUBMERGED HUNT", healthMinPercent: 0.67, color, patterns: ["tremor_mud_burst", "tremor_pressure_fan", "tremor_aerial_burst"] },
    { id: "phase_2", label: "PHASE II · FLOODED FAULT", healthMinPercent: 0.34, color, patterns: ["tremor_aerial_pinball", "tremor_shockwave", "tremor_descending_lanes"] },
    { id: "phase_3", label: "PHASE III · ABYSSAL BREACH", healthMinPercent: 0, color, patterns: ["tremor_breach_charge", "tremor_deluge", "tremor_aerial_pinball"] },
  ];
}


// Six bosses previously fell through to makePhases(), so seven of the twelve shared
// the Thornwarden's exact attack list. Each now has a distinct set composed from the
// implemented pattern pool, chosen to match its source enemy type and biome.
function makeSetPhases(color, rows) {
  return rows.map(([id, label, patterns], index) => ({
    id,
    label,
    healthMinPercent: index === 0 ? 0.67 : index === 1 ? 0.34 : 0,
    color,
    patterns,
  }));
}

const ARCHIVE_SHADE_PHASES = [
  ["phase_1", "PHASE I \u00b7 COLD INDEX", ["screecher_frost_fan", "thorn_radial_burst", "screecher_cryo_ring"]],
  ["phase_2", "PHASE II \u00b7 REDACTION", ["screecher_whiteout_spiral", "targeted_root_eruptions", "screecher_hail_marks"]],
  ["phase_3", "PHASE III \u00b7 SEALED VAULT", ["screecher_blizzard_dive", "rotating_thorn_wall", "screecher_finale"]],
];
const SPORE_CANTOR_PHASES = [
  ["phase_1", "PHASE I \u00b7 FIRST ANTIPHON", ["spore_fungal_ring", "spore_aerial_pinball", "spore_spiral_bloom"]],
  ["phase_2", "PHASE II \u00b7 RISING CHORUS", ["spore_bouncing_wall", "spore_aerial_pinball", "spore_converging_lanes"]],
  ["phase_3", "PHASE III \u00b7 FULL CANTICLE", ["spore_dividing_swarm", "spore_aerial_pinball", "spore_delayed_bloom"]],
];
const OBSIDIAN_KNIGHT_PHASES = [
  ["phase_1", "PHASE I \u00b7 MUSTER THE ASH", ["sunscar_fastball", "shale_bolt_fan", "sunscar_shockwave"]],
  ["phase_2", "PHASE II \u00b7 SIEGE OF EMBERS", ["sunscar_double_fastball", "static_ring", "sunscar_meteor_ring"]],
  ["phase_3", "PHASE III \u00b7 THE LAST DECREE", ["sunscar_fastball_barrage", "seismic_hook", "sunscar_finale"]],
];
const INSECT_KING_PHASES = [
  ["phase_1", "PHASE I \u00b7 THE COURT ASSEMBLES", ["bog_bolt_fan", "targeted_root_eruptions", "undertow_mark"]],
  ["phase_2", "PHASE II \u00b7 SWARM EDICT", ["brackish_geysers", "tremor_double_wake", "flood_lanes"]],
  ["phase_3", "PHASE III \u00b7 THE THRONE DESCENDS", ["mire_tempest", "tremor_eruption_chain", "drowning_finale"]],
];
const ARC_GUNNER_PHASES = [
  ["phase_1", "PHASE I \u00b7 RANGING SHOTS", ["arc_rotating_burst", "arc_railgun_lanes", "arc_tracking_volley"]],
  ["phase_2", "PHASE II \u00b7 ARC CASCADE", ["arc_electric_grid", "arc_lightning_nodes", "arc_bullet_wall"]],
  ["phase_3", "PHASE III \u00b7 THUNDER CROWN", ["arc_bullet_wall", "lightning_crown", "arc_shield_phase"]],
];
const ROOTBOUND_TREMOR_PHASES = [
  ["phase_1", "PHASE I \u00b7 UNDERGROWTH", ["tremor_mud_burst", "root_ground_wave", "tremor_sinkhole_mark"]],
  ["phase_2", "PHASE II \u00b7 SPLITTING LOAM", ["tremor_eruption_chain", "alternating_root_lanes", "tremor_double_wake"]],
  ["phase_3", "PHASE III \u00b7 LAST ROOT", ["tremor_breach_charge", "canopy_storm", "tremor_final_collapse"]],
];

const BOSS_PHASE_SETS = {
  arctic_archive_shade: ARCHIVE_SHADE_PHASES,
  forest_spore_cantor: SPORE_CANTOR_PHASES,
  desert_cinder_scrapper: OBSIDIAN_KNIGHT_PHASES,
  wetlands_broodwarden: INSECT_KING_PHASES,
  highlands_arc_gunner: ARC_GUNNER_PHASES,
  forest_rootbound_tremor: ROOTBOUND_TREMOR_PHASES,
};

export const BOSS_STRATEGIC_MECHANICS = Object.freeze({
  grid: Object.freeze({ objective: "Break its Solar Grid siphon before the Desert network overloads.", targetTypes: ["power"], strikeLabel: "Solar siphon", strikeDamage: 70, strikeInterval: 18, resolution: "Emergency batteries unlocked" }),
  water: Object.freeze({ objective: "Isolate contaminated branches and keep clean water online.", targetTypes: ["water"], strikeLabel: "Network contamination", strikeDamage: 65, strikeInterval: 20, resolution: "Ecological purification unlocked" }),
  "tower-one": Object.freeze({ objective: "Keep communications online long enough to triangulate the real Stormback.", targetTypes: ["communications", "defense"], strikeLabel: "EMP disruption", strikeDamage: 75, strikeInterval: 17, resolution: "Planetary radar unlocked" }),
  habitat: Object.freeze({ objective: "Protect Habitats and sacred terrain during the root assault.", targetTypes: ["habitat"], strikeLabel: "Root eruption", strikeDamage: 80, strikeInterval: 19, resolution: "Settlement migration unlocked" }),
  governance: Object.freeze({ objective: "Prevent the Knight from capturing regional command.", targetTypes: ["capitol", "communications"], strikeLabel: "Command seizure", strikeDamage: 85, strikeInterval: 18, resolution: "Regional policy unlocked" }),
  population: Object.freeze({ objective: "Keep hospitals operating while containing the bio-swarm.", targetTypes: ["hospital", "water"], strikeLabel: "Bio-swarm infection", strikeDamage: 78, strikeInterval: 16, resolution: "Medical revival unlocked" }),
  research: Object.freeze({ objective: "Preserve verified archives while the Shade corrupts university data.", targetTypes: ["university", "communications"], strikeLabel: "Archive redaction", strikeDamage: 72, strikeInterval: 18, resolution: "Research specialization unlocked" }),
  culture: Object.freeze({ objective: "Quarantine infected trade routes without collapsing civilian commerce.", targetTypes: ["commerce", "transit"], strikeLabel: "Spore quarantine breach", strikeDamage: 70, strikeInterval: 17, resolution: "Automated trade unlocked" }),
  "supply-route": Object.freeze({ objective: "Hold the Planetary Capitol and its transit foundations.", targetTypes: ["planetary_capitol", "transit"], strikeLabel: "Foundation collapse", strikeDamage: 90, strikeInterval: 16, resolution: "Planetary charter unlocked" }),
  stronghold: Object.freeze({ objective: "Choose between sustaining war production and protecting civilian systems.", targetTypes: ["war_economy", "defense_contractor"], strikeLabel: "Industrial siege", strikeDamage: 100, strikeInterval: 15, resolution: "Strategic production unlocked" }),
  "advanced-research": Object.freeze({ objective: "Cut hostile corporate data links before the takeover completes.", targetTypes: ["corporate_hq", "defense_contractor"], strikeLabel: "Hostile takeover", strikeDamage: 95, strikeInterval: 14, resolution: "Corporate specialization unlocked" }),
  "tower-ring": Object.freeze({ objective: "Fund repairs while defending the Exchange through a financial whiteout.", targetTypes: ["stock_exchange", "corporate_hq", "planetary_capitol"], strikeLabel: "Market crash", strikeDamage: 110, strikeInterval: 13, resolution: "ZekNova economic constitution ratified" }),
});

export const BOSS_CONFIGS = Object.freeze(Object.fromEntries(bossRows.map(([missionId, id, name, title, biome, sourceEnemyType, color]) => [id, Object.freeze({
  id, missionId, name, title, biome, sourceEnemyType, color,
  strategic: BOSS_STRATEGIC_MECHANICS[missionId],
  scaleMultiplier: id === "arctic_white_screecher" ? 2.4 : 4,
  healthMultiplier: id === "arctic_white_screecher" ? 18 : BOSS_HEALTH_MULTIPLIER,
  phases: id === "desert_sunscar_colossus"
    ? makeSunscarPhases(color)
    : id === "wetlands_mire_siren"
      ? makeMireSirenPhases(color)
      : id === "highlands_stormback"
        ? makeStormbackPhases(color)
        : id === "arctic_white_screecher"
          ? makeWhiteScreecherPhases(color)
          : id === "wetlands_drowned_tremor"
            ? makeDrownedTremorPhases(color)
            : BOSS_PHASE_SETS[id]
              ? makeSetPhases(color, BOSS_PHASE_SETS[id])
              : makePhases(color),
  limits: BOSS_PROJECTILE_LIMITS,
  rewards: Object.freeze({ credits: 100, timber: 25, iron: 15, tensionReduction: 50 }),
})])));

export const MISSION_BOSS_IDS = Object.freeze(Object.fromEntries(bossRows.map(([missionId, id]) => [missionId, id])));

export function playerHealthScale(playerCount = 1) {
  const count = Math.max(1, Math.floor(Number(playerCount) || 1));
  if (count === 1) return 1;
  if (count === 2) return 1.65;
  if (count === 3) return 2.2;
  if (count === 4) return 2.7;
  return 2.7 + (count - 4) * 0.35;
}

export function bossBaseHealth(configOrId) {
  const config = typeof configOrId === "string" ? BOSS_CONFIGS[configOrId] : configOrId;
  const source = ENEMY_PROFILES[config?.sourceEnemyType];
  if (!config || !source) throw new Error(`Boss source profile is unavailable for ${config?.id ?? configOrId}.`);
  return source.health * Number(config.healthMultiplier ?? BOSS_HEALTH_MULTIPLIER);
}

/**
 * Guardian health, scaled by campaign position as well as party size.
 *
 * This used to be base health x party size only, so mission 12's Guardian was
 * no tougher than mission 1's while the player had gained the Captain armory,
 * the mech, flight and a special attack worth 195 rather than 120. Late
 * encounters ended in three specials.
 *
 * Health is now built from the campaign floor and pulled toward the Guardian's
 * own bulk within bounds, so the ramp holds while a Tremor still reads heavier
 * than a Siren. Party scaling is unchanged and still applies on top.
 */
export function scaledBossHealth(configOrId, playerCount = 1) {
  const config = typeof configOrId === "string" ? BOSS_CONFIGS[configOrId] : configOrId;
  const base = bossBaseHealth(config);
  const identity = identityScale(base);
  const campaign = healthScale(config?.missionId);
  return Math.round(
    DIFFICULTY.HEALTH_REFERENCE * identity * campaign * playerHealthScale(playerCount)
  );
}

export function scaledBossDamage(baseDamage, phaseId = "phase_1") {
  const base = Math.max(0, Number(baseDamage) || 0);
  const multiplier = BOSS_DAMAGE_MULTIPLIERS[phaseId] ?? BOSS_DAMAGE_MULTIPLIERS.phase_1;
  return Math.round(base * multiplier);
}

export function phaseForHealth(configOrId, health, maxHealth) {
  const config = typeof configOrId === "string" ? BOSS_CONFIGS[configOrId] : configOrId;
  const normalized = Math.max(0, Math.min(1, Number(health) / Math.max(1, Number(maxHealth))));
  return config.phases.find((phase) => normalized >= phase.healthMinPercent) ?? config.phases.at(-1);
}

export function deterministicRandom(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function deterministicAttackOrder(configOrId, phaseId, seed = 1, length = 12) {
  const config = typeof configOrId === "string" ? BOSS_CONFIGS[configOrId] : configOrId;
  const phase = config.phases.find((item) => item.id === phaseId) ?? config.phases[0];
  const random = deterministicRandom(seed + phase.id.length * 997);
  const result = [];
  let previous = "";
  for (let index = 0; index < length; index += 1) {
    let choice = phase.patterns[Math.floor(random() * phase.patterns.length)];
    if (choice === previous && phase.patterns.length > 1) choice = phase.patterns[(phase.patterns.indexOf(choice) + 1) % phase.patterns.length];
    result.push(choice);
    previous = choice;
  }
  return result;
}

export function performanceGrade(metrics = {}) {
  const avoidance = Math.max(0, Math.min(1, Number(metrics.damageAvoidance ?? 0)));
  const time = Math.max(0, Math.min(1, Number(metrics.timeScore ?? 0)));
  const telegraphs = Math.max(0, Math.min(1, Number(metrics.telegraphAvoidance ?? 0)));
  const survival = Math.max(0, Math.min(1, Number(metrics.teamSurvival ?? 0)));
  const infrastructure = Math.max(0, Math.min(1, Number(metrics.infrastructureProtection ?? 0)));
  const score = avoidance * 0.35 + time * 0.25 + telegraphs * 0.2 + survival * 0.1 + infrastructure * 0.1;
  if (score >= 0.92) return { grade: "S+", multiplier: 2, score };
  if (score >= 0.82) return { grade: "S", multiplier: 1.75, score };
  if (score >= 0.7) return { grade: "A", multiplier: 1.5, score };
  if (score >= 0.55) return { grade: "B", multiplier: 1.25, score };
  return { grade: "C", multiplier: 1, score };
}

export function bossRewards(configOrId, multiplier = 1) {
  const config = typeof configOrId === "string" ? BOSS_CONFIGS[configOrId] : configOrId;
  const factor = Math.max(1, Math.min(2, Number(multiplier) || 1));
  return {
    credits: Math.round(config.rewards.credits * factor),
    timber: Math.round(config.rewards.timber * factor),
    iron: Math.round(config.rewards.iron * factor),
    tensionReduction: config.rewards.tensionReduction,
  };
}

export function encounterRewardId(missionId, seed) {
  return `${missionId}:${Number(seed) >>> 0}`;
}

export function canGrantEncounterReward(claimedIds, rewardId) {
  return !new Set(claimedIds ?? []).has(String(rewardId));
}

export function missionBossConfig(missionId) {
  return BOSS_CONFIGS[MISSION_BOSS_IDS[missionId]] ?? null;
}
