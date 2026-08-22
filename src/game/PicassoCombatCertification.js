/** Sentinel Picasso combat-readability certification data (R0 visual-only). */
export const PICASSO_COMBAT_CERTIFICATION_ID = "PICASSO_COMBAT_READABILITY_AND_ENCOUNTER_IDENTITY";

export const PICASSO_CERTIFICATION_AUTHORITY = Object.freeze({
  CURRENT_AUTHORITY: "R0_VISUAL",
  CAN_CHANGE_DAMAGE: false,
  CAN_CHANGE_COLLISION: false,
  CAN_CHANGE_PROJECTILE_VELOCITY: false,
  CAN_CHANGE_ATTACK_TIMING: false,
  CAN_CHANGE_AI_DECISIONS: false,
  CAN_CHANGE_BOSS_PHASE: false,
  CAN_CHANGE_PHYSICS: false,
  CAN_CHANGE_SAVE_STATE: false,
  CAN_MUTATE_WORLD: false,
  CAN_DISPATCH: false,
});

export const COMBAT_READABILITY_PRIORITY = Object.freeze({
  LOW: Object.freeze({ rank: 0, silhouetteScale: 0.78, contrast: 0.72, telegraphScale: 0.9, trailIntensity: 0.45, impactScale: 0.7, renderOrder: 1, occlusion: "world", maxSimultaneousEmphasis: 12 }),
  MEDIUM: Object.freeze({ rank: 1, silhouetteScale: 1, contrast: 1, telegraphScale: 1, trailIntensity: 0.82, impactScale: 1, renderOrder: 3, occlusion: "world", maxSimultaneousEmphasis: 10 }),
  HIGH: Object.freeze({ rank: 2, silhouetteScale: 1.16, contrast: 1.24, telegraphScale: 1.08, trailIntensity: 1.15, impactScale: 1.28, renderOrder: 6, occlusion: "source-and-danger-area", maxSimultaneousEmphasis: 4 }),
  CRITICAL: Object.freeze({ rank: 3, silhouetteScale: 1.32, contrast: 1.48, telegraphScale: 1.16, trailIntensity: 1.38, impactScale: 1.58, renderOrder: 10, occlusion: "danger-area-always-visible", maxSimultaneousEmphasis: 2 }),
});

export const PICASSO_EFFECT_BUDGETS = Object.freeze({
  low: Object.freeze({ emphasis: 12, impactBursts: 8, beamEffects: 3, trailSegments: 2, particles: 48 }),
  balanced: Object.freeze({ emphasis: 20, impactBursts: 16, beamEffects: 8, trailSegments: 4, particles: 96 }),
  high: Object.freeze({ emphasis: 28, impactBursts: 20, beamEffects: 12, trailSegments: 6, particles: 144 }),
  maximumCriticalEmphasis: 2,
  maximumHighEmphasis: 4,
  perProjectileDynamicLights: 0,
  degradationOrder: Object.freeze(["ambient-particles", "extra-trail-segments", "impact-shards", "outer-beam-glow"]),
});

export const ROLE_COMBAT_SIGNATURES = Object.freeze({
  spitter: Object.freeze({ priority: "MEDIUM", primaryShape: "cone", secondaryShape: "orb", motion: "lobbed-pod", trail: "dotted-spore", telegraph: "throat-bloom", impact: "splitting-glob" }),
  skyray: Object.freeze({ priority: "MEDIUM", primaryShape: "shard", secondaryShape: "wave_slash", motion: "aerial-strafe", trail: "forked-sky-streak", telegraph: "wing-flash", impact: "downward-spark" }),
  stalker: Object.freeze({ priority: "MEDIUM", primaryShape: "wave_slash", secondaryShape: "spike", motion: "ground-dash", trail: "short-claw-arc", telegraph: "shoulder-crouch", impact: "claw-cross" }),
  saboteur: Object.freeze({ priority: "MEDIUM", primaryShape: "prism", secondaryShape: "lance", motion: "infrastructure-tether", trail: "broken-data-line", telegraph: "hack-glyph", impact: "pixel-fracture" }),
  burrower: Object.freeze({ priority: "HIGH", primaryShape: "ring", secondaryShape: "spike", motion: "subterranean-ripple", trail: "ground-fissure", telegraph: "seismic-rings", impact: "eruption-column" }),
  juggernaut: Object.freeze({ priority: "HIGH", primaryShape: "energy_wall", secondaryShape: "ring", motion: "linear-charge-and-slam", trail: "dust-segments", telegraph: "shoulder-drop-lane", impact: "heavy-radial-slam" }),
  player_ballistics: Object.freeze({ priority: "MEDIUM", primaryShape: "prism", secondaryShape: "lance", motion: "fast-straight", trail: "short-segmented-plasma", telegraph: "muzzle-wedge", impact: "compact-burst" }),
  missiles: Object.freeze({ priority: "HIGH", primaryShape: "lance", secondaryShape: "cone", motion: "homing-arc", trail: "segmented-contrail", telegraph: "lock-brackets", impact: "shock-ring-debris" }),
  ensign_solar_repulsor: Object.freeze({ priority: "CRITICAL", primaryShape: "beam", secondaryShape: "ring", motion: "focused-sustained-line", trail: "yellow-core-glow", telegraph: "solar-charge-convergence", impact: "heroic-repulsor-wave" }),
});

export const BOSS_VISUAL_IDENTITIES = Object.freeze({
  forest_ancient_thornwarden: Object.freeze({ family: "ancient-canopy-siege", primary: "lance", secondary: "spike", telegraph: "root-rune-and-thorn-lane", phaseTransition: "canopy-shedding-ring", weakPoint: "amber-heartwood-star", arenaHazard: "advancing-root-wall", impact: "bark-shard-burst" }),
  wetlands_mire_siren: Object.freeze({ family: "tidal-chorus", primary: "ring", secondary: "wave_slash", telegraph: "concentric-ripple-hymn", phaseTransition: "rising-water-helix", weakPoint: "pearl-sonar-diamond", arenaHazard: "undertow-lanes", impact: "brackish-crescent-splash" }),
  highlands_stormback: Object.freeze({ family: "ridgeline-tempest", primary: "disc", secondary: "prism", telegraph: "faultline-chevron", phaseTransition: "thunder-crown-spokes", weakPoint: "white-bolt-cross", arenaHazard: "rolling-stormfront", impact: "forked-electric-crack" }),
  arctic_white_screecher: Object.freeze({ family: "frozen-sky-hunt", primary: "shard", secondary: "wave_slash", telegraph: "frost-wing-reticle", phaseTransition: "whiteout-shard-vortex", weakPoint: "blue-snowflake-aperture", arenaHazard: "descending-ice-lanes", impact: "crystalline-star-fracture" }),
  wetlands_drowned_tremor: Object.freeze({ family: "abyssal-pressure", primary: "ring", secondary: "spike", telegraph: "mud-ripple-and-sinkhole", phaseTransition: "pressure-breach-column", weakPoint: "cyan-pressure-seam", arenaHazard: "flooded-fault-wake", impact: "mud-column-shockwave" }),
  arctic_archive_shade: Object.freeze({ family: "redacted-archive", primary: "prism", secondary: "shard", telegraph: "broken-index-glyph", phaseTransition: "data-redaction-slice", weakPoint: "magenta-index-bracket", arenaHazard: "sealed-vault-grid", impact: "pixel-shard-redaction" }),
  desert_cinder_scrapper: Object.freeze({ family: "obsidian-command", primary: "lance", secondary: "disc", telegraph: "ember-sword-lane", phaseTransition: "ash-decree-wheel", weakPoint: "orange-forge-crack", arenaHazard: "siege-of-embers", impact: "obsidian-spark-cleave" }),
  wetlands_broodwarden: Object.freeze({ family: "reed-hive-court", primary: "cone", secondary: "segmented_trail", telegraph: "hex-egg-cluster", phaseTransition: "swarm-coronation", weakPoint: "gold-hive-hex", arenaHazard: "bio-swarm-nest", impact: "chitin-splinter-cloud" }),
  desert_sunscar_colossus: Object.freeze({ family: "solar-fastball", primary: "prism", secondary: "ring", telegraph: "solar-pitch-lock", phaseTransition: "core-overdrive-corona", weakPoint: "white-solar-core", arenaHazard: "meteor-ring", impact: "solar-flare-crater" }),
  forest_spore_cantor: Object.freeze({ family: "fungal-canticle", primary: "orb", secondary: "segmented_trail", telegraph: "spore-bloom-measure", phaseTransition: "chorus-bloom-spiral", weakPoint: "lime-spore-stamen", arenaHazard: "bouncing-fungal-wall", impact: "splitting-spore-pod" }),
  highlands_arc_gunner: Object.freeze({ family: "thunder-geometry", primary: "prism", secondary: "energy_wall", telegraph: "rail-lane-and-node-grid", phaseTransition: "arc-cascade-circuit", weakPoint: "violet-capacitor-cross", arenaHazard: "electric-checker-grid", impact: "hex-electric-burst" }),
  forest_rootbound_tremor: Object.freeze({ family: "undergrowth-fault", primary: "spike", secondary: "wave_slash", telegraph: "root-fissure-arrow", phaseTransition: "splitting-loam-ring", weakPoint: "yellow-root-knot", arenaHazard: "alternating-root-lanes", impact: "loam-shard-eruption" }),
});

export const WEAK_POINT_STATES = Object.freeze(["CLOSED", "OPENING", "ACTIVE", "HIT", "CLOSING"]);
export const WEAK_POINT_SEMANTICS = Object.freeze({
  CLOSED: Object.freeze({ scale: 0.72, pulseHz: 0, contrast: 0.4, shapeCue: "sealed-dot", screenLabel: "SEALED" }),
  OPENING: Object.freeze({ scale: 1.05, pulseHz: 5, contrast: 1.15, shapeCue: "opening-brackets", screenLabel: "OPENING" }),
  ACTIVE: Object.freeze({ scale: 1.38, pulseHz: 8, contrast: 1.55, shapeCue: "four-point-aperture", screenLabel: "WEAK POINT" }),
  HIT: Object.freeze({ scale: 1.72, pulseHz: 14, contrast: 1.9, shapeCue: "white-cross-flash", screenLabel: "WEAK HIT" }),
  CLOSING: Object.freeze({ scale: 1, pulseHz: 3, contrast: 0.9, shapeCue: "contracting-brackets", screenLabel: "CLOSING" }),
});

export const IMPACT_READABILITY = Object.freeze({
  normal_hit: Object.freeze({ shape: "compact-ring", scale: 1, rhythm: "single", debris: 2 }),
  weak_point_hit: Object.freeze({ shape: "four-point-star", scale: 1.5, rhythm: "double", debris: 4 }),
  armor_hit: Object.freeze({ shape: "flat-chevron", scale: 0.9, rhythm: "ricochet", debris: 3 }),
  shield_blocked: Object.freeze({ shape: "hex-disc", scale: 1.25, rhythm: "inward", debris: 0 }),
  critical_hit: Object.freeze({ shape: "radial-spikes", scale: 1.7, rhythm: "triple", debris: 6 }),
  boss_phase_threshold: Object.freeze({ shape: "arena-ring", scale: 2.25, rhythm: "expanding", debris: 6 }),
  environmental_impact: Object.freeze({ shape: "ground-crescent", scale: 0.82, rhythm: "single", debris: 3 }),
});

export const THEME_READABILITY_VARIANTS = Object.freeze({
  zeknova: Object.freeze({ edge: "clean-energy", dangerPattern: "circuit", weakPointPattern: "aperture" }),
  anime: Object.freeze({ edge: "ink-outline", dangerPattern: "speed-hatch", weakPointPattern: "four-point-star" }),
  cartoon: Object.freeze({ edge: "thick-outline", dangerPattern: "dashed", weakPointPattern: "chunky-brackets" }),
  cinematic: Object.freeze({ edge: "volumetric-rim", dangerPattern: "ground-haze", weakPointPattern: "lens-aperture" }),
  ultra_realistic: Object.freeze({ edge: "physical-emission", dangerPattern: "heat-ripple", weakPointPattern: "mechanical-iris" }),
  alien_dream: Object.freeze({ edge: "chromatic-rim", dangerPattern: "glyph", weakPointPattern: "impossible-diamond" }),
});

export const BIOME_DANGER_CONTRAST = Object.freeze({
  forest: Object.freeze({ luminanceBand: "bright", redundantCue: "thorn-notch", edgeContrast: 1.35 }),
  desert: Object.freeze({ luminanceBand: "dark", redundantCue: "double-chevron", edgeContrast: 1.5 }),
  highlands: Object.freeze({ luminanceBand: "bright", redundantCue: "forked-line", edgeContrast: 1.4 }),
  arctic: Object.freeze({ luminanceBand: "dark", redundantCue: "broken-ring", edgeContrast: 1.55 }),
  wetlands: Object.freeze({ luminanceBand: "bright", redundantCue: "concentric-ripple", edgeContrast: 1.42 }),
});

export function priorityForCombatVisual({ source = "ambient", kind = "", boss = false, highRisk = false } = {}) {
  if (boss || highRisk || kind === "ensign_solar_repulsor" || kind === "arena_hazard") return "CRITICAL";
  if (["missile", "volley", "juggernaut", "burrower", "heavy"].includes(kind)) return "HIGH";
  if (["enemy_projectile", "player_ballistic", "standard_attack"].includes(kind) || source === "enemy") return "MEDIUM";
  return "LOW";
}

export function bossVisualIdentity(bossId) {
  return BOSS_VISUAL_IDENTITIES[String(bossId)] ?? null;
}

export function weakPointState({ active = false, previousActive = false, hitUntil = 0, activeUntil = 0, now = 0, transitionMs = 220 } = {}) {
  if (Number(hitUntil) > Number(now)) return "HIT";
  if (active && !previousActive) return "OPENING";
  if (active && Number(activeUntil) - Number(now) <= Number(transitionMs)) return "CLOSING";
  if (active) return "ACTIVE";
  return "CLOSED";
}

export function certifyCombatIdentityData() {
  const authorityViolations = Object.entries(PICASSO_CERTIFICATION_AUTHORITY).filter(([key, value]) => key.startsWith("CAN_") && value !== false);
  const bossSignatures = Object.values(BOSS_VISUAL_IDENTITIES).map((profile) => JSON.stringify([profile.family, profile.primary, profile.secondary, profile.telegraph, profile.arenaHazard]));
  const roleSignatures = Object.values(ROLE_COMBAT_SIGNATURES).map((profile) => JSON.stringify([profile.primaryShape, profile.secondaryShape, profile.motion, profile.telegraph]));
  return Object.freeze({
    id: PICASSO_COMBAT_CERTIFICATION_ID,
    authorityViolations: authorityViolations.length,
    bossCount: bossSignatures.length,
    uniqueBossSignatures: new Set(bossSignatures).size,
    roleCount: roleSignatures.length,
    uniqueRoleSignatures: new Set(roleSignatures).size,
    weakPointStateCount: WEAK_POINT_STATES.length,
    impactTypeCount: Object.keys(IMPACT_READABILITY).length,
    pass: authorityViolations.length === 0 && bossSignatures.length === 12 && new Set(bossSignatures).size === 12 && roleSignatures.length === 9 && new Set(roleSignatures).size === 9,
  });
}

export default Object.freeze({
  id: PICASSO_COMBAT_CERTIFICATION_ID,
  authority: PICASSO_CERTIFICATION_AUTHORITY,
  priorities: COMBAT_READABILITY_PRIORITY,
  budgets: PICASSO_EFFECT_BUDGETS,
  roles: ROLE_COMBAT_SIGNATURES,
  bosses: BOSS_VISUAL_IDENTITIES,
  weakPoints: WEAK_POINT_SEMANTICS,
  impacts: IMPACT_READABILITY,
  themes: THEME_READABILITY_VARIANTS,
  biomes: BIOME_DANGER_CONTRAST,
  priorityForCombatVisual,
  bossVisualIdentity,
  weakPointState,
  certify: certifyCombatIdentityData,
});
