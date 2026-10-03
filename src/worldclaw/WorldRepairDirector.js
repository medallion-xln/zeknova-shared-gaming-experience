/**
 * ZekNova — WorldClaw world repair
 * Location: /src/worldclaw/WorldRepairDirector.js
 *
 * Bounded, local correction of critic failures.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────
 * Do not regenerate a biome because one rock is misplaced.
 *
 * That is not a performance preference, it is a correctness one. Regeneration
 * discards every placement decision that was already correct, including the
 * ones a designer approved and the ones the mission validator signed off. A
 * repair that moves one rock leaves 400 verified objects untouched; a
 * regeneration re-rolls all 401 and has to re-verify them all.
 *
 * ── HOW REPAIR STAYS BOUNDED ─────────────────────────────────────────────
 * Every repair strategy below:
 *   1. touches exactly the objects named in the finding,
 *   2. moves them by the smallest correction that clears the rule,
 *   3. re-checks only the rule it was fixing plus the rules that correction
 *      could plausibly break (which is why moving a structure re-checks
 *      overlap, and dropping one to the ground does not),
 *   4. and REFUSES rather than guessing when no bounded fix exists.
 *
 * A refusal is a real outcome. `repair()` returning `{ resolved: false }` for a
 * finding means the world genuinely needs re-planning at that spot, and saying
 * so is more useful than a silent nudge that moves the problem 2 m sideways.
 *
 * ── WHAT REPAIR MAY NEVER DO ─────────────────────────────────────────────
 * It may not move a mission hook or a boss arena. Those positions are gameplay
 * contracts: relocating one to satisfy a visual rule is exactly the inversion
 * ("gameplay conforms to generation") the whole integration forbids. When a
 * mission hook is the problem, repair moves whatever is *obstructing* it.
 */

import { heightAt, slopeAt, isWaterAt, prepare } from "./TerrainGenerator.js";
import { critique } from "./WorldCritic.js";
import { createRng } from "./SemanticPlacement.js";
import { createWorldSpec } from "./WorldSpec.js";

/** Failure codes this director knows how to fix, and the strategy for each. */
export const REPAIR_STRATEGIES = Object.freeze({
  "geometry.floating": "reseat",
  "geometry.buried": "reseat",
  "geometry.intersection": "separate",
  "geometry.slope": "relocate",
  "geometry.submerged": "relocate",
  "composition.repetition": "revary",
  "traversal.roadFlooded": "reroute",
  "traversal.roadSteep": "reroute",
  "gameplay.spawnCamping": "pushPatrol",
  "mission.hookUnbuildable": "clearObstruction",
});

const MAX_PASSES = 4;
/** Nothing may be moved further than this by a repair. Beyond it, refuse. */
const MAX_DISPLACEMENT = 12;

/**
 * Repair a world against its own critique.
 *
 * Runs up to `maxPasses` times, because one repair can reveal another (moving a
 * building off a slope can push it into a neighbour). It stops early the moment
 * a pass fixes nothing, so a world with an unfixable finding costs one wasted
 * pass rather than four.
 */
export function repair(spec, { maxPasses = MAX_PASSES, seed = spec.seed } = {}) {
  let current = spec;
  const log = [];
  let report = critique(current);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const errors = report.findings.filter((finding) => finding.severity === "error");
    if (!errors.length) break;

    const draft = mutableCopy(current);
    const prepared = prepare(current);
    const rng = createRng((seed >>> 0) + pass * 7919);
    let applied = 0;

    for (const finding of errors) {
      const strategy = REPAIR_STRATEGIES[finding.code];
      if (!strategy) {
        log.push({ pass, code: finding.code, action: "unsupported", resolved: false, message: finding.message });
        continue;
      }
      const outcome = STRATEGY_FNS[strategy]({ draft, prepared, finding, rng, spec: current });
      log.push({ pass, code: finding.code, action: strategy, ...outcome });
      if (outcome.resolved) applied += 1;
    }

    if (!applied) break;
    current = createWorldSpec(draft);
    report = critique(current);
  }

  return {
    spec: current,
    report,
    log,
    resolved: log.filter((entry) => entry.resolved).length,
    unresolved: log.filter((entry) => !entry.resolved).length,
    /* True when repair left the world shippable. A repair run that ends with
       remaining errors is reported honestly rather than presented as a fix. */
    clean: report.findings.every((finding) => finding.severity !== "error"),
  };
}

/* ── strategies ────────────────────────────────────────────────────────── */

const STRATEGY_FNS = {
  /** Snap a floating or buried object back onto the terrain surface. */
  reseat({ draft, prepared, finding }) {
    const target = locate(draft, finding.subject?.id);
    if (!target) return { resolved: false, message: "Object not found in the spec." };
    const before = target.y;
    target.y = Number(heightAt(prepared, target.x, target.z).toFixed(4));
    return { resolved: true, message: `Reseated "${target.id}" from y=${before?.toFixed(2)} to y=${target.y.toFixed(2)}.` };
  },

  /**
   * Push two overlapping objects apart along the axis between them.
   *
   * The lighter object moves; the heavier one holds its ground. "Heavier" is
   * collision radius, because the bigger structure is more likely to be the
   * one whose position carries intent (a communal hall over a shrub).
   */
  separate({ draft, prepared, finding, spec }) {
    const a = locate(draft, finding.subject?.a?.id);
    const b = locate(draft, finding.subject?.b?.id);
    if (!a || !b) return { resolved: false, message: "One of the overlapping objects is no longer in the spec." };

    const mover = (a.radius ?? 0) <= (b.radius ?? 0) ? a : b;
    const anchor = mover === a ? b : a;
    let dx = mover.x - anchor.x, dz = mover.z - anchor.z;
    let distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < 1e-4) { dx = 1; dz = 0; distance = 1; } // exactly coincident
    const need = (a.radius ?? 0) + (b.radius ?? 0) + 0.6 - distance;
    if (need > MAX_DISPLACEMENT) {
      return { resolved: false, message: `"${mover.id}" would need to move ${need.toFixed(1)} m, beyond the ${MAX_DISPLACEMENT} m repair bound.` };
    }

    const nx = mover.x + (dx / distance) * need;
    const nz = mover.z + (dz / distance) * need;
    if (!legalSite(prepared, nx, nz, spec, kindOf(draft, mover.id))) {
      return { resolved: false, message: `Separating "${mover.id}" would put it on illegal ground; this needs re-planning, not a nudge.` };
    }
    mover.x = Number(nx.toFixed(4));
    mover.z = Number(nz.toFixed(4));
    mover.y = Number(heightAt(prepared, nx, nz).toFixed(4));
    return { resolved: true, message: `Moved "${mover.id}" ${need.toFixed(2)} m clear of "${anchor.id}".` };
  },

  /**
   * Move an object off illegal ground to the nearest legal spot.
   * A spiral search outward, so the correction is the smallest that works.
   */
  relocate({ draft, prepared, finding, spec, rng }) {
    const target = locate(draft, finding.subject?.id);
    if (!target) return { resolved: false, message: "Object not found in the spec." };
    const site = nearestLegal(prepared, target.x, target.z, spec, rng, kindOf(draft, target.id));
    if (!site) {
      return { resolved: false, message: `No legal ground within ${MAX_DISPLACEMENT} m of "${target.id}"; the settlement anchor itself is wrong.` };
    }
    const moved = Math.hypot(site.x - target.x, site.z - target.z);
    target.x = site.x; target.z = site.z;
    target.y = Number(heightAt(prepared, site.x, site.z).toFixed(4));
    return { resolved: true, message: `Relocated "${target.id}" ${moved.toFixed(2)} m to legal ground.` };
  },

  /**
   * Break up asset repetition by re-rolling the most-repeated asset on a
   * minority of its instances. Only variation changes — nothing moves — so no
   * geometric rule can break as a result.
   */
  revary({ draft, finding, rng }) {
    const region = draft.regions.find((entry) => entry.id === finding.subject?.id);
    if (!region) return { resolved: false, message: "Region not found." };
    const pool = [...(region.vegetation ?? [])];
    if (pool.length < 4) return { resolved: false, message: "Too few objects to vary." };
    const counts = new Map();
    for (const item of pool) counts.set(item.assetId, (counts.get(item.assetId) ?? 0) + 1);
    const [topId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const alternatives = [...counts.keys()].filter((id) => id !== topId);
    if (!alternatives.length) return { resolved: false, message: "The region has only one asset available to vary." };

    let changed = 0;
    for (const item of pool) {
      if (item.assetId !== topId) continue;
      if (rng() > 0.4) continue;
      const replacement = pool.find((candidate) => candidate.assetId === alternatives[Math.floor(rng() * alternatives.length)]);
      if (!replacement) continue;
      item.assetId = replacement.assetId;
      item.assetPath = replacement.assetPath;
      item.radius = replacement.radius;
      item.height = replacement.height;
      item.lodLevels = replacement.lodLevels;
      item.reason = `${item.reason} Varied to break a repetition cluster.`;
      changed += 1;
    }
    return changed
      ? { resolved: true, message: `Varied ${changed} instance(s) of "${topId}" in region "${region.id}".` }
      : { resolved: false, message: "No instance qualified for variation this pass." };
  },

  /** Truncate a road at the last passable point rather than re-planning it. */
  reroute({ draft, prepared, finding, spec }) {
    const road = draft.traversal.roads.find((entry) => entry.id === finding.subject?.id);
    if (!road) return { resolved: false, message: "Road not found." };
    const kept = [road.points[0]];
    for (let i = 1; i < road.points.length; i += 1) {
      const point = road.points[i];
      if (isWaterAt(prepared, point.x, point.z)) break;
      if (slopeAt(prepared, point.x, point.z) > 5.5) break;
      kept.push(point);
    }
    if (kept.length < 4) {
      return { resolved: false, message: `Road "${road.id}" has no passable prefix; its origin needs re-planning.` };
    }
    const dropped = road.points.length - kept.length;
    road.points = kept;
    road.reason = `${road.reason} Truncated at the last passable point (${dropped} segment(s) removed).`;
    return { resolved: true, message: `Truncated road "${road.id}" by ${dropped} segment(s).` };
  },

  /** Push a patrol's waypoints away from a spawn zone. */
  pushPatrol({ draft, prepared, finding }) {
    const zone = finding.subject?.zone;
    const patrolId = finding.subject?.enemy?.id;
    let patrol = null;
    for (const region of draft.regions) {
      patrol = (region.enemies ?? []).find((entry) => entry.id === patrolId);
      if (patrol) break;
    }
    if (!patrol || !zone) return { resolved: false, message: "Patrol or spawn zone not found." };
    let moved = 0;
    for (const point of patrol.waypoints ?? []) {
      const dx = point.x - zone.x, dz = point.z - zone.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= 16) continue;
      if (distance < 1e-4) continue;
      const push = 16 - distance;
      if (push > MAX_DISPLACEMENT) continue;
      point.x = Number((point.x + (dx / distance) * push).toFixed(3));
      point.z = Number((point.z + (dz / distance) * push).toFixed(3));
      point.y = Number(heightAt(prepared, point.x, point.z).toFixed(3));
      moved += 1;
    }
    return moved
      ? { resolved: true, message: `Pushed ${moved} waypoint(s) of "${patrol.id}" clear of spawn zone "${zone.id}".` }
      : { resolved: false, message: "Every offending waypoint would exceed the repair displacement bound." };
  },

  /**
   * A mission hook on unbuildable ground.
   *
   * The hook does NOT move — it is a gameplay contract. What moves is anything
   * obstructing it. When the ground itself is the problem (slope, water) rather
   * than an object, repair refuses and says so: that is a planning failure the
   * planner must fix by choosing a different site before generation, not a
   * defect a post-hoc nudge can hide.
   */
  clearObstruction({ draft, prepared, finding, spec, rng }) {
    const hook = finding.hook ?? finding.subject?.hook;
    if (!hook) return { resolved: false, message: "Finding carried no hook." };

    const groundSlope = slopeAt(prepared, hook.x, hook.z);
    const submerged = isWaterAt(prepared, hook.x, hook.z);
    if (groundSlope > spec.globalRules.maxSlopeForBuild || submerged) {
      return {
        resolved: false,
        message: `Mission hook "${hook.missionId}" sits on terrain that is itself unbuildable (${submerged ? "submerged" : `slope ${groundSlope.toFixed(2)}`}). Mission positions are contracts and are not moved by repair — the planner must re-site this hook.`,
      };
    }

    let cleared = 0;
    for (const region of draft.regions) {
      for (const list of [region.vegetation, region.resources, region.landmarks]) {
        for (const item of list ?? []) {
          const distance = Math.hypot(item.x - hook.x, item.z - hook.z);
          if (distance > 6) continue;
          const site = nearestLegal(prepared, hook.x + (item.x - hook.x) * 2.2, hook.z + (item.z - hook.z) * 2.2, spec, rng, "prop");
          if (!site) continue;
          item.x = site.x; item.z = site.z;
          item.y = Number(heightAt(prepared, site.x, site.z).toFixed(4));
          item.reason = `${item.reason} Moved clear of mission hook "${hook.missionId}".`;
          cleared += 1;
        }
      }
    }
    return cleared
      ? { resolved: true, message: `Cleared ${cleared} object(s) from around mission hook "${hook.missionId}".` }
      : { resolved: false, message: `Nothing obstructs mission hook "${hook.missionId}"; the failure is in the terrain, not the props.` };
  },
};

/* ── helpers ───────────────────────────────────────────────────────────── */

/** Deep, mutable copy. Repair works on a draft and re-freezes at the end. */
function mutableCopy(spec) {
  return JSON.parse(JSON.stringify(spec));
}

/** Find any placed object in a draft spec by id. */
function locate(draft, id) {
  if (!id) return null;
  for (const region of draft.regions) {
    for (const settlement of region.settlements ?? []) {
      const structure = (settlement.structures ?? []).find((entry) => entry.id === id);
      if (structure) return structure;
    }
    for (const list of [region.vegetation, region.landmarks, region.resources]) {
      const item = (list ?? []).find((entry) => entry.id === id);
      if (item) return item;
    }
  }
  return null;
}

/**
 * Where a given kind of object may legally stand.
 *
 * Structures follow the live game's BUILD rules — above water, under the height
 * ceiling, under the slope limit. Props do not, and holding them to those rules
 * was wrong: an ore seam exists precisely BECAUSE it is on a slope, so every
 * attempt to separate two overlapping seams was refused as "illegal ground" and
 * the overlap shipped. A prop needs dry, non-cliff ground and nothing more.
 */
function legalSite(prepared, x, z, spec, kind = "structure") {
  const height = heightAt(prepared, x, z);
  if (height < prepared.waterLevel + 0.2) return false;
  if (kind !== "structure") return slopeAt(prepared, x, z) < 6;
  if (height < prepared.waterLevel + spec.globalRules.minBuildHeightAboveWater) return false;
  if (height > spec.globalRules.maxBuildHeight) return false;
  return slopeAt(prepared, x, z) < spec.globalRules.maxSlopeForBuild;
}

/** Structures obey build rules; everything else obeys prop rules. */
function kindOf(draft, id) {
  for (const region of draft.regions) {
    for (const settlement of region.settlements ?? []) {
      if ((settlement.structures ?? []).some((entry) => entry.id === id)) return "structure";
    }
  }
  return "prop";
}

/**
 * Nearest legal site, found by an expanding ring sweep bounded by
 * MAX_DISPLACEMENT. Rings are walked at a fixed angular resolution with a
 * seeded phase offset, so the search is deterministic but two objects repaired
 * in the same ring do not both land on the same bearing.
 */
function nearestLegal(prepared, x, z, spec, rng, kind = "structure") {
  const phase = rng() * Math.PI * 2;
  for (let radius = 1.5; radius <= MAX_DISPLACEMENT; radius += 1.5) {
    const spokes = Math.max(8, Math.round(radius * 4));
    for (let s = 0; s < spokes; s += 1) {
      const angle = phase + (s / spokes) * Math.PI * 2;
      const nx = x + Math.cos(angle) * radius;
      const nz = z + Math.sin(angle) * radius;
      if (legalSite(prepared, nx, nz, spec, kind)) {
        return { x: Number(nx.toFixed(4)), z: Number(nz.toFixed(4)) };
      }
    }
  }
  return null;
}
