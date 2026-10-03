/**
 * ZekNova — WorldClaw mission and boss validation
 * Location: /src/worldclaw/MissionPlacementValidator.js
 *
 * The rule this file enforces, in one line:
 *
 *     WorldClaw conforms to ZekNova gameplay.
 *     ZekNova gameplay does NOT conform to generation output.
 *
 * ── WHY THIS IS THE MOST IMPORTANT VALIDATOR ─────────────────────────────
 * A world that looks superb and cannot host mission 2 is a broken build. The
 * campaign is twelve missions, each delivering one project to all five biomes,
 * each gated by a Guardian in a specific biome. A generated region that fails
 * to leave a buildable site for the Wetlands Water Works does not degrade the
 * experience — it makes the campaign *uncompletable*, silently, several hours
 * in.
 *
 * So generation is checked against the campaign's own source of truth
 * (`CampaignPlan.PROJECT_LADDER`, `Missions.MISSION_OBJECTIVES`,
 * `BossSystem.BOSS_CONFIGS`) rather than against a copy, and a spec that fails
 * is REJECTED. There is no "ship it with a warning" path for mission failure.
 *
 * ── THE UTILITY TRAP ─────────────────────────────────────────────────────
 * The check that catches the most real problems is not "is there flat ground",
 * it is "is there flat ground WITHIN UTILITY RANGE of the rest of the
 * settlement". `zkUtilityNetwork` reaches 30 m for power and 36 m for water and
 * data. A Habitat needs power+water+data; a Habitat 40 m from its Solar Grid is
 * placeable, connects to nothing, and never satisfies its objective. That is a
 * live-game failure mode `Missions.js` documents at length — the Desert has no
 * Water Works objective precisely because the dunes leave exactly one legal
 * tile in the whole AO. This validator exists so generation can never
 * re-introduce that.
 */

import { PROJECT_LADDER, BIOMES as PLAN_BIOMES } from "../game/CampaignPlan.js";
import { MISSION_OBJECTIVES, ZEKNOVAN_AID_TYPES } from "../game/Missions.js";
import { BOSS_CONFIGS, MISSION_BOSS_IDS } from "../game/BossSystem.js";
import { HUMAN_BUILDINGS } from "../game/Buildings.js";
import { heightAt, slopeAt, isWaterAt, landformAt, prepare } from "./TerrainGenerator.js";
import { buildable } from "./SemanticPlacement.js";

/**
 * Zones every generated region must expose. Named exactly as the brief states
 * them so a region can be checked against the list mechanically.
 */
export const REQUIRED_ZONE_KINDS = Object.freeze([
  "missionSafe", "objectivePlacement", "bossArena", "spawn",
  "patrolRoute", "fastTravel", "resource", "buildable",
]);

/**
 * How many buildable, utility-connectable sites a region must offer.
 *
 * Twelve is not arbitrary: the campaign delivers twelve projects to every
 * biome, one per mission, and every one of them must have somewhere to stand
 * simultaneously at the end of the campaign. A region that can host eleven
 * strands the twelfth.
 */
export const REQUIRED_BUILD_SITES_PER_REGION = PROJECT_LADDER.length;

/**
 * World-space sampling step for the buildability lattice, in metres.
 *
 * 2.5 m is a shade under the smallest campaign building footprint (the Solar
 * Grid's collision radius is 1.55), so no legal site is missed, while keeping a
 * full-region sweep to a few hundred samples.
 */
const LATTICE_STEP_METRES = 2.5;

/** Buildings whose objectives exist in the campaign, plus the aid structures. */
const CAMPAIGN_BUILD_TYPES = Object.freeze([
  ...new Set([...PROJECT_LADDER.map((plan) => plan.type), ...ZEKNOVAN_AID_TYPES]),
]);

/**
 * Find buildable sites in a region that can also form a connected utility
 * cluster.
 *
 * Sites are returned as a cluster: a seed site plus every other legal site
 * within the tightest utility range (power, 30 m). A cluster of size N can host
 * N interdependent buildings; separate clusters cannot power each other.
 */
/**
 * Cache keyed by the spec object, then the region id.
 *
 * `findBuildClusters` is the most expensive thing WorldClaw does — every sample
 * costs five terrain evaluations — and it is asked the same question repeatedly:
 * once when siting mission hooks, once when declaring zones, and once per
 * region on every critique pass of the refinement loop. Caching per (spec,
 * region) turns roughly thirty full sweeps per generation into five. A WeakMap
 * means a discarded draft spec takes its cache with it.
 */
const clusterCache = new WeakMap();

export function findBuildClusters(spec, region, { step = LATTICE_STEP_METRES } = {}) {
  let perRegion = clusterCache.get(spec);
  if (!perRegion) { perRegion = new Map(); clusterCache.set(spec, perRegion); }
  const cached = perRegion.get(region.id);
  if (cached) return cached;

  const prepared = prepare(spec);
  const rules = {
    maxSlopeForBuild: spec.globalRules.maxSlopeForBuild,
    minBuildHeightAboveWater: spec.globalRules.minBuildHeightAboveWater,
    maxBuildHeight: spec.globalRules.maxBuildHeight,
  };
  const range = Math.min(
    spec.globalRules.utilityRange.power,
    spec.globalRules.utilityRange.water,
    spec.globalRules.utilityRange.data,
  );

  /* An ISOTROPIC lattice — a fixed world-space step on both axes, not a fixed
     sample count per axis.

     A fixed count over ZekNova's band-shaped regions (roughly 26 units wide by
     168 deep) sampled every 1 m in x and every 6.7 m in z. Farthest-point
     selection over that could not spread twelve build sites apart in any
     direction but z, and campaign projects ended up a metre from each other.
     Equal spacing in both axes is what makes "the site furthest from every
     other site" mean the same thing in both directions. */
  const sites = [];
  const { minX, maxX, minZ, maxZ } = region.bounds;
  const columns = Math.max(2, Math.round((maxX - minX) / step));
  const rows = Math.max(2, Math.round((maxZ - minZ) / step));
  for (let i = 0; i <= columns; i += 1) {
    for (let j = 0; j <= rows; j += 1) {
      const x = minX + ((maxX - minX) * i) / columns;
      const z = minZ + ((maxZ - minZ) * j) / rows;
      if (!buildable(prepared, x, z, rules)) continue;
      if (landformAt(prepared, x, z) === "riverbank") continue; // the live game refuses these too
      sites.push({ x, z, y: heightAt(prepared, x, z), slope: slopeAt(prepared, x, z) });
    }
  }

  // Greedy clustering: seed on the flattest site, absorb everything in range,
  // repeat. Deterministic because the site list order is a fixed lattice walk
  // and the sort is total (slope, then x, then z).
  const remaining = [...sites].sort((a, b) => a.slope - b.slope || a.x - b.x || a.z - b.z);
  const clusters = [];
  while (remaining.length) {
    const seed = remaining.shift();
    const members = [seed];
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const site = remaining[i];
      const dx = site.x - seed.x, dz = site.z - seed.z;
      if (dx * dx + dz * dz <= range * range) {
        members.push(site);
        remaining.splice(i, 1);
      }
    }
    clusters.push({
      x: seed.x, z: seed.z, radius: range, sites: members, size: members.length,
    });
  }
  const sorted = clusters.sort((a, b) => b.size - a.size);
  perRegion.set(region.id, sorted);
  return sorted;
}

/**
 * Validate one region against every campaign requirement it must satisfy.
 *
 * Returns findings; the caller decides whether to repair or reject. Failures
 * are typed so `WorldRepairDirector` can dispatch a bounded fix per code
 * instead of regenerating the region.
 */
export function validateRegionForMissions(spec, region) {
  const failures = [];
  const warnings = [];
  const prepared = prepare(spec);

  // 1. Enough connected buildable capacity for the whole campaign.
  const clusters = findBuildClusters(spec, region);
  const largest = clusters[0]?.size ?? 0;
  if (largest < REQUIRED_BUILD_SITES_PER_REGION) {
    failures.push({
      code: "mission.buildCapacity",
      regionId: region.id,
      message: `Region "${region.id}" offers a largest utility-connected cluster of ${largest} sites; the campaign delivers ${REQUIRED_BUILD_SITES_PER_REGION} projects to every biome and needs at least that many.`,
      detail: { largest, required: REQUIRED_BUILD_SITES_PER_REGION, clusters: clusters.length },
    });
  }

  // 2. Every declared mission hook must sit on ground a build could occupy.
  const rules = {
    maxSlopeForBuild: spec.globalRules.maxSlopeForBuild,
    minBuildHeightAboveWater: spec.globalRules.minBuildHeightAboveWater,
    maxBuildHeight: spec.globalRules.maxBuildHeight,
  };
  for (const hook of region.missionHooks ?? []) {
    if (!MISSION_OBJECTIVES[hook.missionId]) {
      failures.push({
        code: "mission.unknown", regionId: region.id,
        message: `Mission hook "${hook.missionId}" is not a real campaign mission.`,
      });
      continue;
    }
    if (!buildable(prepared, hook.x, hook.z, rules)) {
      failures.push({
        code: "mission.hookUnbuildable", regionId: region.id, hook,
        message: `Mission "${hook.missionId}" hook in "${region.id}" sits on ground no structure can occupy (height ${heightAt(prepared, hook.x, hook.z).toFixed(2)}, slope ${slopeAt(prepared, hook.x, hook.z).toFixed(2)}).`,
      });
    }
    if (hook.buildType && !CAMPAIGN_BUILD_TYPES.includes(hook.buildType)) {
      warnings.push({
        code: "mission.hookType", regionId: region.id,
        message: `Mission hook "${hook.missionId}" names build type "${hook.buildType}", which the campaign never delivers.`,
      });
    }
  }

  // 3. Boss arenas.
  for (const hook of region.bossHooks ?? []) {
    const arena = validateBossArena(spec, region, hook, prepared);
    failures.push(...arena.failures);
    warnings.push(...arena.warnings);
  }

  // 4. Required zone kinds present.
  const zoneKinds = new Set((region.zones ?? []).map((zone) => zone.kind));
  for (const kind of REQUIRED_ZONE_KINDS) {
    if (!zoneKinds.has(kind)) {
      warnings.push({
        code: "zone.missing", regionId: region.id,
        message: `Region "${region.id}" does not expose a "${kind}" zone.`,
      });
    }
  }

  return { regionId: region.id, failures, warnings, clusters };
}

/**
 * Boss arena validation (Phase 11).
 *
 * A boss arena is not merely open ground. The encounter needs an arrival path
 * the player can walk, a footprint the boss can navigate without falling out of
 * it, cover the player can use, and clearance for the phase transitions the
 * boss's own config declares. Each of those is checked separately so a failure
 * says which property is missing.
 */
export function validateBossArena(spec, region, hook, preparedTerrain = null) {
  const failures = [];
  const warnings = [];
  // Terrain preparation flattens the whole region graph, so callers that
  // already hold one pass it through rather than rebuilding per arena.
  const prepared = preparedTerrain ?? prepare(spec);
  const config = BOSS_CONFIGS[hook.bossId];

  if (!config) {
    failures.push({
      code: "boss.unknown", regionId: region.id,
      message: `Boss hook "${hook.bossId}" does not resolve to a real BOSS_CONFIGS entry.`,
    });
    return { failures, warnings };
  }
  if (config.biome !== region.biome) {
    failures.push({
      code: "boss.wrongBiome", regionId: region.id,
      message: `Boss "${hook.bossId}" belongs to the ${config.biome} AO but its arena was placed in a ${region.biome} region.`,
    });
  }

  // Footprint: the boss's own scale multiplier sets the minimum radius. A
  // 4x-scaled Guardian in a 6 m arena cannot execute a charge.
  const minRadius = 9 + config.scaleMultiplier * 2.5;
  if (hook.arenaRadius < minRadius) {
    failures.push({
      code: "boss.arenaTooSmall", regionId: region.id, hook,
      message: `Arena for "${hook.bossId}" is ${hook.arenaRadius.toFixed(1)} m; a ${config.scaleMultiplier}x Guardian needs at least ${minRadius.toFixed(1)} m.`,
      detail: { have: hook.arenaRadius, need: minRadius },
    });
  }

  /* Navigability and cover, sampled on the same lattice.
     Cover comes from two sources and both count: broken terrain (a slope band
     that is climbable but not flat), and blocking objects standing in the
     arena. Grading terrain alone marked every well-sited arena as featureless,
     because the siting search correctly prefers flat ground for the Guardian to
     charge across — the cover is *placed* on it afterwards. */
  const blockers = [
    ...(region.landmarks ?? []),
    ...(region.resources ?? []),
    ...(region.vegetation ?? []),
  ].filter((item) => (item.radius ?? 0) >= 0.8);

  let walkable = 0, total = 0, cover = 0;
  const rings = 5, spokes = 12;
  for (let r = 1; r <= rings; r += 1) {
    for (let s = 0; s < spokes; s += 1) {
      const angle = (s / spokes) * Math.PI * 2;
      const radius = (hook.arenaRadius * r) / rings;
      const x = hook.x + Math.cos(angle) * radius;
      const z = hook.z + Math.sin(angle) * radius;
      total += 1;
      const slope = slopeAt(prepared, x, z);
      const blocked = blockers.some((item) => Math.hypot(item.x - x, item.z - z) < item.radius + 1.5);
      /* Navigability is a property of the TERRAIN. A rock the player can walk
         around is cover, not an impassable arena — counting cover against
         navigability made every well-dressed arena fail the very check that
         placing the cover was meant to satisfy. */
      if (!isWaterAt(prepared, x, z) && slope < 4.2) walkable += 1;
      if (blocked || (slope >= 2.4 && slope < 5.5)) cover += 1;
    }
  }
  const walkableFraction = total ? walkable / total : 0;
  if (walkableFraction < 0.72) {
    failures.push({
      code: "boss.arenaNotNavigable", regionId: region.id, hook,
      message: `Only ${(walkableFraction * 100).toFixed(0)}% of the "${hook.bossId}" arena floor is navigable; the encounter needs at least 72%.`,
      detail: { walkableFraction },
    });
  }

  const coverFraction = total ? cover / total : 0;
  if (coverFraction < 0.08) {
    warnings.push({
      code: "boss.insufficientCover", regionId: region.id,
      message: `The "${hook.bossId}" arena is almost featureless (${(coverFraction * 100).toFixed(0)}% cover); a ranged phase will have nowhere to break line of sight.`,
    });
  } else if (coverFraction > 0.55) {
    warnings.push({
      code: "boss.excessiveCover", regionId: region.id,
      message: `The "${hook.bossId}" arena is ${(coverFraction * 100).toFixed(0)}% broken ground; the Guardian will lose the player constantly.`,
    });
  }

  // Cover that physically fills the arena is a different failure from broken
  // ground: the Guardian cannot path through it at all.
  const obstructed = blockers.filter((item) => Math.hypot(item.x - hook.x, item.z - hook.z) <= hook.arenaRadius);
  const obstructedArea = obstructed.reduce((sum, item) => sum + Math.PI * (item.radius + 1) ** 2, 0);
  const arenaArea = Math.PI * hook.arenaRadius ** 2;
  if (obstructedArea / arenaArea > 0.4) {
    failures.push({
      code: "boss.arenaObstructed", regionId: region.id, hook,
      message: `Objects occupy ${((obstructedArea / arenaArea) * 100).toFixed(0)}% of the "${hook.bossId}" arena floor; the Guardian cannot manoeuvre.`,
    });
  }

  // Arrival path: there must be walkable ground from the arena edge outward,
  // or the player can see the encounter and never reach it.
  if (!hasArrivalPath(prepared, hook)) {
    failures.push({
      code: "boss.noArrivalPath", regionId: region.id, hook,
      message: `No walkable approach reaches the "${hook.bossId}" arena; the encounter would be unreachable.`,
    });
  }

  return { failures, warnings };
}

/** Walk outward on 16 bearings; at least one must clear the arena unblocked. */
function hasArrivalPath(prepared, hook) {
  for (let s = 0; s < 16; s += 1) {
    const angle = (s / 16) * Math.PI * 2;
    let clear = true;
    for (let d = hook.arenaRadius; d <= hook.arenaRadius + 30; d += 3) {
      const x = hook.x + Math.cos(angle) * d;
      const z = hook.z + Math.sin(angle) * d;
      if (isWaterAt(prepared, x, z) || slopeAt(prepared, x, z) > 5.5) { clear = false; break; }
    }
    if (clear) return true;
  }
  return false;
}

/**
 * Whole-world campaign validation.
 *
 * The campaign requires all five canonical biomes to be present and buildable,
 * every mission to have a home, and all twelve bosses to have a reachable
 * arena. This is the gate the director will not ship a world past.
 */
export function validateCampaign(spec) {
  const failures = [];
  const warnings = [];
  const regionReports = [];

  const presentBiomes = new Set(spec.regions.map((region) => region.biome));
  for (const biome of PLAN_BIOMES) {
    if (!presentBiomes.has(biome)) {
      failures.push({
        code: "campaign.missingBiome",
        message: `The campaign delivers every project to the ${biome} AO, but the world contains no ${biome} region.`,
      });
    }
  }

  for (const region of spec.regions) {
    // Transition regions are crossings, not colonies. The campaign never asks
    // them to host a project, so holding them to the build-capacity rule would
    // reject exactly the regions that make terrain read as continuous.
    if (!PLAN_BIOMES.includes(region.biome)) continue;
    const report = validateRegionForMissions(spec, region);
    regionReports.push(report);
    failures.push(...report.failures);
    warnings.push(...report.warnings);
  }

  // Every boss must exist somewhere reachable.
  const arenaBossIds = new Set(spec.regions.flatMap((region) => (region.bossHooks ?? []).map((hook) => hook.bossId)));
  for (const [missionId, bossId] of Object.entries(MISSION_BOSS_IDS)) {
    if (!arenaBossIds.has(bossId)) {
      warnings.push({
        code: "campaign.bossArenaAbsent",
        message: `Mission "${missionId}" routes to Guardian "${bossId}", which has no generated arena; the live runtime's own encounter placement will be used.`,
      });
    }
  }

  // Build types the campaign needs must all exist in the catalogue. This
  // catches a ladder edited without its buildings.
  for (const plan of PROJECT_LADDER) {
    if (!HUMAN_BUILDINGS[plan.type]) {
      failures.push({
        code: "campaign.unknownBuildType",
        message: `Mission "${plan.mission}" delivers build type "${plan.type}", which is not in HUMAN_BUILDINGS.`,
      });
    }
  }

  return {
    valid: failures.length === 0,
    failures,
    warnings,
    regionReports,
    missionsChecked: PROJECT_LADDER.length,
    bossesChecked: Object.keys(BOSS_CONFIGS).length,
  };
}
