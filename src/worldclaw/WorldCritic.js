/**
 * ZekNova — WorldClaw world critic
 * Location: /src/worldclaw/WorldCritic.js
 *
 * Measurable evaluation of a generated world.
 *
 * ── WHY SCORING, NOT EYEBALLING ──────────────────────────────────────────
 * Iterative refinement is the idea that separates WorldClaw from a one-shot
 * generator, and refinement needs a gradient. "This looks wrong" is not a
 * gradient. "Physics validity 71, because nine props intersect terrain" is: it
 * names the axis, the magnitude, and the objects to fix, which is exactly what
 * `WorldRepairDirector` consumes.
 *
 * ── EVERY RULE IS OBJECTIVE ──────────────────────────────────────────────
 * No check here is a taste judgement. A prop is floating if its base sits above
 * the sampled terrain by more than a threshold. Two buildings intersect if the
 * distance between their centres is less than the sum of their collision radii.
 * A region is empty if its object density falls below a stated floor. Each
 * check is a number compared to a constant, and every constant is stated with
 * the reason it has that value.
 *
 * ── SCORING SHAPE ────────────────────────────────────────────────────────
 * Each axis starts at 100 and loses points per violation, floored at 0. Loss
 * per violation is scaled by how legible the failure is in play: a buried
 * building costs more than an over-dense shrub, because a player will notice
 * one and never the other. The overall score is a weighted mean with mission
 * accessibility and physics validity carrying the most weight, because those
 * are the two axes where a bad score means "broken" rather than "worse".
 */

import { heightAt, slopeAt, isWaterAt, prepare, regionTerrainStats } from "./TerrainGenerator.js";
import { allPlacements } from "./WorldSpec.js";
import { findAssets } from "./WorldAssetRegistry.js";
import { validateCampaign } from "./MissionPlacementValidator.js";
import { PERFORMANCE_BUDGETS, measureSpec } from "./PerformanceBudget.js";

/** Thresholds, each with the reason it is the value it is. */
export const CRITIC_THRESHOLDS = Object.freeze({
  // A prop base more than 0.35 m off the terrain reads as floating at the
  // camera heights ZekNova uses. Below that, contact shadows hide it.
  floatTolerance: 0.35,
  // Buried is worse than floating: 0.6 m swallows a doorway.
  buryTolerance: 0.6,
  // Two structures whose collision cylinders overlap at all will visibly clip.
  intersectionSlack: 0,
  /* Density bounds, calibrated against the shipped world. ZekNova plants 672
     trees plus 48 rock formations across ~2.8 playable hectares, and its
     densest biome (Forest, tree density 1.0) carries roughly 590 objects per
     hectare. Bounds set for an open world — the handful-per-hectare figures
     these replaced — flagged every authored-density region as cluttered. */
  minObjectsPerHectare: 18,
  maxObjectsPerHectare: 700,
  // Same asset repeated more than this share of a region's objects reads as
  // copy-paste, which is the most common "procedural" tell.
  maxAssetShare: 0.34,
  // Structures closer together than this are one clump, not two buildings.
  clusterRadius: 4.5,
  maxClusterShare: 0.3,
  // A combat arena narrower than this cannot hold a fight the camera can read.
  minArenaRadius: 12,
  // Objectives in DIFFERENT regions this close collapse into one location.
  minObjectiveSeparation: 14,
  /* Build sites within ONE colony only have to fit. The campaign deliberately
     packs a biome's twelve projects into a single 30 m utility cluster, so the
     real requirement here is two building footprints side by side, not
     legibility separation. */
  minColonyBuildSeparation: 5.5,
});

/** Axis weights. Mission and physics dominate: those two mean "playable". */
const WEIGHTS = Object.freeze({
  terrainCoherence: 1.0,
  traversal: 1.2,
  gameplayReadability: 1.0,
  assetVariety: 0.8,
  physicsValidity: 1.5,
  missionAccessibility: 2.0,
  performance: 1.2,
});

const clamp100 = (value) => Math.max(0, Math.min(100, value));

/**
 * Grade a world.
 *
 * Returns `{ scores, overall, findings, pass }`. `findings` are typed and
 * carry the object they refer to, so repair can act on them directly.
 */
export function critique(spec, { budgets = PERFORMANCE_BUDGETS } = {}) {
  const prepared = prepare(spec);
  const findings = [];
  const note = (severity, code, message, subject = null) =>
    findings.push({ severity, code, message, subject });

  const placements = allPlacements(spec);

  /* ── geometry / physics ──────────────────────────────────────────────── */
  let floating = 0, buried = 0, intersecting = 0, onImpossibleSlope = 0, inWater = 0;

  for (const item of placements) {
    const ground = heightAt(prepared, item.x, item.z);
    const delta = (item.y ?? ground) - ground;
    if (delta > CRITIC_THRESHOLDS.floatTolerance) {
      floating += 1;
      note("error", "geometry.floating", `"${item.id}" floats ${delta.toFixed(2)} m above the terrain.`, item);
    } else if (delta < -CRITIC_THRESHOLDS.buryTolerance) {
      buried += 1;
      note("error", "geometry.buried", `"${item.id}" is buried ${(-delta).toFixed(2)} m into the terrain.`, item);
    }
    if (item.category === "structure") {
      const slope = slopeAt(prepared, item.x, item.z);
      if (slope > spec.globalRules.maxSlopeForBuild) {
        onImpossibleSlope += 1;
        note("error", "geometry.slope", `"${item.id}" stands on a ${slope.toFixed(2)} slope; the build limit is ${spec.globalRules.maxSlopeForBuild}.`, item);
      }
      if (isWaterAt(prepared, item.x, item.z)) {
        inWater += 1;
        note("error", "geometry.submerged", `"${item.id}" stands below the waterline.`, item);
      }
    }
  }

  // Pairwise intersection, restricted to colliding objects and windowed by a
  // sort on x so this stays near-linear on the object counts ZekNova ships.
  const colliders = placements
    .filter((item) => (item.radius ?? 0) > 0)
    .sort((a, b) => a.x - b.x);
  // The sweep can only stop early against the LARGEST radius in the set — a
  // later, fatter object can still reach back past a nearer thin one.
  const maxRadius = colliders.reduce((max, item) => Math.max(max, item.radius), 0);
  for (let i = 0; i < colliders.length; i += 1) {
    const a = colliders[i];
    for (let j = i + 1; j < colliders.length; j += 1) {
      const b = colliders[j];
      if (b.x - a.x > a.radius + maxRadius) break; // sorted: nothing further can overlap
      const dx = b.x - a.x, dz = b.z - a.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < a.radius + b.radius - CRITIC_THRESHOLDS.intersectionSlack) {
        intersecting += 1;
        note("error", "geometry.intersection", `"${a.id}" and "${b.id}" overlap by ${(a.radius + b.radius - distance).toFixed(2)} m.`, { a, b });
      }
    }
  }

  const physicsViolations = floating + buried + intersecting + onImpossibleSlope + inWater;
  // 6 points per violation: ten overlapping buildings should fail outright, one
  // should be visible in the score without condemning the region.
  const physicsValidity = clamp100(100 - physicsViolations * 6);

  /* ── terrain coherence ───────────────────────────────────────────────── */
  let coherence = 100;
  const stats = spec.regions.map((region) => regionTerrainStats(spec, region.id));
  for (const stat of stats) {
    if (!stat) continue;
    // A region with a single landform is a plane with a label on it.
    const forms = Object.keys(stat.landforms).length;
    if (forms <= 1) {
      coherence -= 12;
      note("warning", "terrain.monotone", `Region "${stat.regionId}" contains only ${Object.keys(stat.landforms)[0] ?? "nothing"}; it will read as a flat plate.`, stat);
    }
    // Terrain that exceeds the buildable ceiling everywhere hosts nothing.
    if (stat.minHeight > spec.globalRules.maxBuildHeight) {
      coherence -= 20;
      note("error", "terrain.tooHigh", `Region "${stat.regionId}" never drops below the build ceiling (${spec.globalRules.maxBuildHeight}).`, stat);
    }
  }
  // Hard seams: sample across each declared border and look for a step.
  for (const rel of spec.relationships ?? []) {
    const from = spec.regions.find((region) => region.id === rel.from);
    const to = spec.regions.find((region) => region.id === rel.to);
    if (!from || !to) continue;
    const step = borderStep(prepared, from, to);
    if (step > 6) {
      coherence -= 10;
      note("warning", "terrain.seam", `The ${rel.from}->${rel.to} border steps ${step.toFixed(1)} m over a short span and will read as a wall rather than a transition.`, rel);
    }
  }
  const terrainCoherence = clamp100(coherence);

  /* ── traversal ───────────────────────────────────────────────────────── */
  let traversal = 100;
  const roads = spec.traversal?.roads ?? [];
  for (const road of roads) {
    for (let i = 1; i < road.points.length; i += 1) {
      const a = road.points[i - 1], b = road.points[i];
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      if (isWaterAt(prepared, mid.x, mid.z)) {
        traversal -= 8;
        note("error", "traversal.roadFlooded", `Road "${road.id}" crosses open water at (${mid.x.toFixed(1)}, ${mid.z.toFixed(1)}) with no bridge.`, road);
        break;
      }
      if (slopeAt(prepared, mid.x, mid.z) > 5.5) {
        traversal -= 6;
        note("warning", "traversal.roadSteep", `Road "${road.id}" climbs a ${slopeAt(prepared, mid.x, mid.z).toFixed(1)} slope; a vehicle will not follow it.`, road);
        break;
      }
    }
  }
  // Every settlement needs at least one road, or it is a place with no way in.
  for (const region of spec.regions) {
    for (const settlement of region.settlements ?? []) {
      const served = roads.some((road) => road.points.some((point) => {
        const dx = point.x - settlement.x, dz = point.z - settlement.z;
        return dx * dx + dz * dz < 400; // within 20 m
      }));
      if (!served) {
        traversal -= 10;
        note("error", "traversal.unservedSettlement", `Settlement "${settlement.id}" has no approach road.`, settlement);
      }
    }
  }
  // Fast travel is the streaming system's anchor as well as a convenience.
  if ((spec.traversal?.fastTravelNodes ?? []).length === 0 && spec.regions.length > 1) {
    traversal -= 6;
    note("warning", "traversal.noFastTravel", "The world declares no fast-travel nodes.");
  }
  const traversalScore = clamp100(traversal);

  /* ── gameplay readability ────────────────────────────────────────────── */
  let readability = 100;
  /* Objective separation is checked ACROSS regions, and only for footprint
     collision within one.

     Two mission hooks in the same region are two buildings of one colony, and
     ZekNova requires them to be close: `zkUtilityNetwork` reaches 30 m, so a
     biome's twelve projects MUST share one utility cluster or they connect to
     nothing. `Missions.js` documents that constraint at length. A rule that
     demanded 14 m between them would be demanding the campaign break itself.

     What actually confuses a player is two objectives in DIFFERENT regions
     landing on top of each other at a border — that is a genuine "which one am
     I looking at" failure, and it is what this now measures. Within a region,
     the only requirement is that two buildings can physically stand side by
     side. */
  const objectives = spec.regions.flatMap((region) => (region.missionHooks ?? []).map((hook) => ({ ...hook, regionId: region.id })));
  for (let i = 0; i < objectives.length; i += 1) {
    for (let j = i + 1; j < objectives.length; j += 1) {
      const a = objectives[i], b = objectives[j];
      const distance = Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
      const sameRegion = a.regionId === b.regionId;
      const limit = sameRegion ? CRITIC_THRESHOLDS.minColonyBuildSeparation : CRITIC_THRESHOLDS.minObjectiveSeparation;
      if (distance >= limit) continue;
      readability -= sameRegion ? 6 : 8;
      note("warning", sameRegion ? "gameplay.buildSitesOverlap" : "gameplay.objectivesCrowded",
        sameRegion
          ? `Colony build sites "${a.missionId}" and "${b.missionId}" in "${a.regionId}" are ${distance.toFixed(1)} m apart; two structures cannot both stand there.`
          : `Mission hooks "${a.missionId}" (${a.regionId}) and "${b.missionId}" (${b.regionId}) are ${distance.toFixed(1)} m apart across a border and will read as one location.`,
        [a, b]);
    }
  }
  for (const region of spec.regions) {
    for (const hook of region.bossHooks ?? []) {
      if (hook.arenaRadius < CRITIC_THRESHOLDS.minArenaRadius) {
        readability -= 12;
        note("error", "gameplay.arenaTooSmall", `Arena "${hook.bossId}" is ${hook.arenaRadius.toFixed(1)} m across; combat below ${CRITIC_THRESHOLDS.minArenaRadius} m is unreadable.`, hook);
      }
    }
    // Spawn camping: a spawn point inside a patrol route is a death loop.
    for (const zone of region.zones ?? []) {
      if (zone.kind !== "spawn") continue;
      for (const enemy of region.enemies ?? []) {
        for (const point of enemy.waypoints ?? []) {
          const dx = point.x - zone.x, dz = point.z - zone.z;
          if (dx * dx + dz * dz < 144) { // 12 m
            readability -= 10;
            note("error", "gameplay.spawnCamping", `Patrol "${enemy.id}" passes within 12 m of spawn zone "${zone.id}".`, { zone, enemy });
          }
        }
      }
    }
  }
  const gameplayReadability = clamp100(readability);

  /* ── asset variety and composition ───────────────────────────────────── */
  let variety = 100;
  for (const region of spec.regions) {
    const items = allPlacements({ ...spec, regions: [region] });
    if (!items.length) {
      const area = regionAreaHectares(region);
      if (area > 1) {
        variety -= 10;
        note("warning", "composition.emptyRegion", `Region "${region.id}" contains no objects at all.`, region);
      }
      continue;
    }
    const counts = new Map();
    for (const item of items) counts.set(item.assetId, (counts.get(item.assetId) ?? 0) + 1);
    const [topId, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = topCount / items.length;
    /* The ceiling scales with the vocabulary the biome can actually serve.
       The Arctic ships three authored structures and one plant; the Highlands
       has a single vegetation mesh. Holding a two-asset biome to the same
       repetition ceiling as a thirty-asset one is scoring the art library, not
       the generator — and no placement decision could ever satisfy it. */
    /* Vocabulary = the natural-cover meshes the biome can actually scatter, not
       every asset tagged with it. Highlands is tagged on 18 assets, but 15 of
       those are settlement structures the scatter pass never places; its
       ground-cover vocabulary is two. */
    const vocabulary = Math.max(1, findAssets({
      biome: region.biome, roles: ["vegetation", "landmark"],
    }).length);
    const ceiling = Math.max(CRITIC_THRESHOLDS.maxAssetShare, 1 / Math.min(vocabulary, 6));
    if (share > ceiling && items.length >= 8) {
      variety -= Math.round((share - ceiling) * 100);
      note("warning", "composition.repetition", `"${topId}" is ${(share * 100).toFixed(0)}% of everything in region "${region.id}" (ceiling ${(ceiling * 100).toFixed(0)}% for a ${vocabulary}-asset biome).`, region);
    }
    // Placeholders and provider-generated meshes are recorded honestly.
    const placeholders = items.filter((item) => item.sourceTier >= 6).length;
    if (placeholders) {
      variety -= placeholders * 4;
      note("error", "composition.placeholder", `Region "${region.id}" ships ${placeholders} placeholder object(s); no authored asset matched.`, region);
    }

    const hectares = regionAreaHectares(region);
    const density = hectares > 0 ? items.length / hectares : 0;
    if (density < CRITIC_THRESHOLDS.minObjectsPerHectare) {
      variety -= 8;
      note("warning", "composition.sparse", `Region "${region.id}" holds ${density.toFixed(2)} objects/ha; below ${CRITIC_THRESHOLDS.minObjectsPerHectare} it reads as unfinished.`, region);
    } else if (density > CRITIC_THRESHOLDS.maxObjectsPerHectare) {
      variety -= 8;
      note("warning", "composition.cluttered", `Region "${region.id}" holds ${density.toFixed(2)} objects/ha; above ${CRITIC_THRESHOLDS.maxObjectsPerHectare} the horizon fills with props.`, region);
    }
  }
  const assetVariety = clamp100(variety);

  /* ── missions ────────────────────────────────────────────────────────── */
  const campaign = validateCampaign(spec);
  for (const failure of campaign.failures) note("error", failure.code, failure.message, failure);
  for (const warning of campaign.warnings) note("warning", warning.code, warning.message, warning);
  // Mission accessibility is deliberately brutal: a single hard failure takes
  // it below the pass mark, because a campaign that cannot be completed is not
  // a world with a low score, it is a world that does not ship.
  /* Failures are uncapped — each one is a campaign that cannot be finished.
     Warnings are capped at 20 points total: a world can accrue dozens of
     advisory notes (one per unplanned boss arena, one per absent zone) without
     any of them meaning the campaign is unplayable, and letting them sum
     linearly turned an intact world into a failing score. */
  const missionAccessibility = clamp100(
    100 - campaign.failures.length * 25 - Math.min(20, campaign.warnings.length * 2),
  );

  /* ── performance ─────────────────────────────────────────────────────── */
  const measurement = measureSpec(spec, budgets);
  for (const breach of measurement.breaches) {
    note(breach.severity, `performance.${breach.metric}`, breach.message, breach);
  }
  const performance = clamp100(measurement.score);

  const scores = {
    terrainCoherence: Math.round(terrainCoherence * 10) / 10,
    traversal: Math.round(traversalScore * 10) / 10,
    gameplayReadability: Math.round(gameplayReadability * 10) / 10,
    assetVariety: Math.round(assetVariety * 10) / 10,
    physicsValidity: Math.round(physicsValidity * 10) / 10,
    missionAccessibility: Math.round(missionAccessibility * 10) / 10,
    performance: Math.round(performance * 10) / 10,
  };

  const weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const overall = Math.round(
    (Object.entries(scores).reduce((sum, [axis, value]) => sum + value * WEIGHTS[axis], 0) / weightSum) * 10,
  ) / 10;

  return {
    scores,
    overall,
    findings,
    /* A world passes only when the campaign is intact AND nothing is
       physically broken. A high average cannot buy its way past either. */
    pass: campaign.failures.length === 0
      && physicsViolations === 0
      && overall >= 80,
    counts: { floating, buried, intersecting, onImpossibleSlope, inWater, objects: placements.length },
    campaign,
    measurement,
  };
}

function regionAreaHectares(region) {
  const width = region.bounds.maxX - region.bounds.minX;
  const depth = region.bounds.maxZ - region.bounds.minZ;
  return (width * depth) / 10000;
}

/** Largest height step across the shared border of two regions. */
function borderStep(prepared, from, to) {
  const overlapZ = [Math.max(from.bounds.minZ, to.bounds.minZ), Math.min(from.bounds.maxZ, to.bounds.maxZ)];
  const overlapX = [Math.max(from.bounds.minX, to.bounds.minX), Math.min(from.bounds.maxX, to.bounds.maxX)];
  let worst = 0;
  const probe = (x, z) => Math.abs(heightAt(prepared, x - 3, z) - heightAt(prepared, x + 3, z));
  if (overlapZ[1] > overlapZ[0]) {
    const x = (Math.min(from.bounds.maxX, to.bounds.maxX) + Math.max(from.bounds.minX, to.bounds.minX)) / 2;
    for (let i = 0; i <= 10; i += 1) {
      worst = Math.max(worst, probe(x, overlapZ[0] + ((overlapZ[1] - overlapZ[0]) * i) / 10));
    }
  }
  if (overlapX[1] > overlapX[0]) {
    const z = (Math.min(from.bounds.maxZ, to.bounds.maxZ) + Math.max(from.bounds.minZ, to.bounds.minZ)) / 2;
    for (let i = 0; i <= 10; i += 1) {
      worst = Math.max(worst, probe(overlapX[0] + ((overlapX[1] - overlapX[0]) * i) / 10, z));
    }
  }
  return worst;
}

/** Human-readable score card, in the format the brief specifies. */
export function formatScoreCard(result) {
  const rows = [
    ["Terrain coherence", result.scores.terrainCoherence],
    ["Traversal", result.scores.traversal],
    ["Gameplay readability", result.scores.gameplayReadability],
    ["Asset variety", result.scores.assetVariety],
    ["Physics validity", result.scores.physicsValidity],
    ["Mission accessibility", result.scores.missionAccessibility],
    ["Performance", result.scores.performance],
  ];
  const lines = ["World Quality Score", ""];
  for (const [label, value] of rows) lines.push(`${label.padEnd(24)} ${String(value).padStart(5)}`);
  lines.push("-".repeat(30));
  lines.push(`${"Overall".padEnd(24)} ${String(result.overall).padStart(5)}`);
  return lines.join("\n");
}
