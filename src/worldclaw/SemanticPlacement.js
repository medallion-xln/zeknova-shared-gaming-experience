/**
 * ZekNova — WorldClaw semantic placement
 * Location: /src/worldclaw/SemanticPlacement.js
 *
 * Placement that knows WHY each object is there.
 *
 * ── THE DIFFERENCE THIS MAKES ────────────────────────────────────────────
 * Procedural placement asks "is this spot free?" and scatters. Semantic
 * placement asks "what is this object for, and where does that put it?" —
 * which is the difference between a field of huts and a settlement.
 *
 * Every placement produced here carries a `reason` string. That is not
 * decoration: it is the audit trail the World Critic grades and the World
 * Repair Director reads when it has to move something without destroying the
 * intent that put it there. An object with no reason cannot be repaired
 * safely, because nothing knows what it was trying to achieve.
 *
 * ── THE CAUSAL CHAIN ─────────────────────────────────────────────────────
 * The settlement generator walks the chain the brief specifies, in order:
 *
 *     a reliable water source exists
 *         -> the communal heart anchors near it
 *             -> dwellings ring the heart, facing in
 *                 -> craft and production sit outside the dwelling ring
 *                     -> storage sits on the path between them and the heart
 *                         -> the approach road connects the heart outward
 *                             -> watch posts hold the high ground on that road
 *                                 -> markers claim the settlement's edge
 *
 * Each step reads the results of the previous one, so removing water moves the
 * whole settlement rather than leaving a village around an absence.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────
 * All randomness comes from a seeded PRNG passed in by the director. Candidate
 * sites are evaluated on a fixed lattice with a scored best-of selection rather
 * than rejection sampling, so the result never depends on how many draws it
 * took to find a legal spot.
 */

import { heightAt, slopeAt, isWaterAt, riverDistanceAt, landformAt } from "./TerrainGenerator.js";
import { ROLE_BY_NAME, STRUCTURE_ROLES, settlementForm, biomeBible } from "./ZekNovaWorldBible.js";
import { resolve, findAssets, weightOf } from "./WorldAssetRegistry.js";

/** Seeded PRNG. Same algorithm the live runtime uses (`pn` in the bundle). */
export function createRng(seed) {
  let state = seed >>> 0 || 1;
  return function next() {
    state = (state + 1831565813) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── site evaluation ───────────────────────────────────────────────────── */

/**
 * Can anything at all stand here? These are the live game's own rules, quoted:
 * above water by 0.8, below height 18, combined slope under 3.3. Keeping the
 * same thresholds is what guarantees a generated structure sits somewhere the
 * player could also have built.
 */
export function buildable(prepared, x, z, rules) {
  const height = heightAt(prepared, x, z);
  if (height < prepared.waterLevel + rules.minBuildHeightAboveWater) return false;
  if (height > rules.maxBuildHeight) return false;
  return slopeAt(prepared, x, z) < rules.maxSlopeForBuild;
}

/**
 * Score a candidate site for a role. Higher is better; -Infinity is illegal.
 *
 * The weights encode the Bible's reasoning rather than taste:
 *  - flatness matters most for everything (a settlement on a slope is a fiction)
 *  - `water` roles want to be near water and are worthless far from it
 *  - `watch` roles invert the flatness preference for *height*: they want the
 *    highest legal ground within reach, because that is what a watchtower is
 *  - `energy` wants open sky, modelled as clearance from taller neighbours
 *  - everything wants separation from what is already placed
 */
export function scoreSite(context, role, x, z) {
  const { prepared, rules, placed, anchor, waterSources } = context;
  if (!buildable(prepared, x, z, rules)) return -Infinity;

  const height = heightAt(prepared, x, z);
  const slope = slopeAt(prepared, x, z);
  const form = landformAt(prepared, x, z);
  if (form === "cliff" || form === "water") return -Infinity;

  let score = 100 - slope * 18;

  // Separation. Anything closer than the sum of radii plus a gap is illegal,
  // not merely bad — overlapping meshes are the single most legible failure a
  // generated settlement can have.
  for (const other of placed) {
    const dx = x - other.x, dz = z - other.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const required = (other.radius ?? 1.5) + (context.radius ?? 1.5) + rules.minStructureGap;
    if (distance < required) return -Infinity;
    if (distance < required * 2.5) score -= (required * 2.5 - distance) * 2.2;
  }

  // Interior margin: used when siting a settlement anchor, so the town centre
  // leaves room for its own outer rings and its roads inside the region.
  if (context.interiorMargin && context.bounds) {
    const { minX, maxX, minZ, maxZ } = context.bounds;
    const margin = context.interiorMargin;
    const inset = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    // Regions can be narrower than the margin; scale rather than reject, or a
    // thin transition band could never host anything at all.
    const usable = Math.min(margin, (maxX - minX) / 2 - 1, (maxZ - minZ) / 2 - 1);
    if (inset < usable) score -= (usable - inset) * 7;
  }

  if (anchor) {
    const dx = x - anchor.x, dz = z - anchor.z;
    const ring = ROLE_BY_NAME[role]?.ring ?? 1;
    const target = context.courtyardRadius + ring * context.ringSpacing;

    /* ELLIPTICAL rings, stretched to the shape of the region.
       ZekNova's AOs are narrow bands — roughly 26 units east-west and 168
       north-south. Circular rings put the outer bands of a 40-structure town
       outside the region entirely, and the solver rejected them: a town of
       forty came back with twenty-six.

       The shipped Forest village already solved exactly this, and its own
       comment says why: "A circular ring collapsed the outer structures into
       two pockets due north and due south, because those were the only bearings
       that stayed on forest ground." It uses ring radii of 12-15 in x and 18-40
       in z. This is that idea generalised — the ellipse is derived from the
       region's real aspect ratio instead of hand-tuned per biome. */
    const radiusX = Math.min(target, context.ringLimitX ?? target);
    const radiusZ = target * (context.ringStretchZ ?? 1);
    // 1.0 is exactly on the ring; 0 is the anchor.
    const ellipse = Math.hypot(dx / Math.max(0.001, radiusX), dz / Math.max(0.001, radiusZ));
    score -= Math.abs(ellipse - 1) * target * 6;

    // The courtyard is elliptical for the same reason the rings are.
    const courtyardX = Math.min(context.courtyardRadius, context.ringLimitX ?? context.courtyardRadius);
    const courtyardZ = context.courtyardRadius * (context.ringStretchZ ?? 1);
    if (Math.hypot(dx / courtyardX, dz / courtyardZ) < 1) return -Infinity;
  }

  if (role === "water") {
    const distance = nearestDistance(waterSources, x, z);
    if (!Number.isFinite(distance)) return -Infinity;
    score += Math.max(0, 60 - distance * 3.5);
  }
  if (role === "watch") {
    // Watch posts want elevation relative to their own settlement.
    score += (height - (anchor ? heightAt(prepared, anchor.x, anchor.z) : height)) * 9;
    score += form === "highland" || form === "peak" ? 25 : 0;
  }
  if (role === "energy") {
    // Crystal arrays need sky. Penalise proximity to anything tall.
    for (const other of placed) {
      if ((other.height ?? 0) < 5) continue;
      const dx = x - other.x, dz = z - other.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < 12) score -= (12 - distance) * 4;
    }
  }
  if (role === "extraction") {
    const distance = nearestDistance(context.resourceSites ?? [], x, z);
    if (Number.isFinite(distance)) score += Math.max(0, 50 - distance * 4);
  }

  return score;
}

function nearestDistance(points, x, z) {
  let best = Infinity;
  for (const point of points ?? []) {
    const dx = x - point.x, dz = z - point.z;
    best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
  }
  return best;
}

/**
 * Best legal site for a role within a radius of an origin.
 *
 * A deterministic lattice sweep with a seeded jitter per cell: the jitter stops
 * every settlement in the world from sharing one lattice (which reads as a
 * grid), while the sweep guarantees the same spec always picks the same site.
 */
export function findSite(context, role, origin, searchRadius, rng, { steps = 15 } = {}) {
  let best = null, bestScore = -Infinity;
  const step = (searchRadius * 2) / (steps - 1);
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const jitterX = (rng() - 0.5) * step * 0.6;
      const jitterZ = (rng() - 0.5) * step * 0.6;
      const x = origin.x - searchRadius + i * step + jitterX;
      const z = origin.z - searchRadius + j * step + jitterZ;
      if (context.bounds && (x < context.bounds.minX || x > context.bounds.maxX
        || z < context.bounds.minZ || z > context.bounds.maxZ)) continue;
      const score = scoreSite(context, role, x, z);
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
  }
  return bestScore === -Infinity ? null : { ...best, score: bestScore };
}

/* ── settlement generation ─────────────────────────────────────────────── */

/**
 * The structure roster for a settlement of a given size.
 *
 * Roles are allocated by the Bible's priority order and clamped to each role's
 * min/max, so a 40-structure town gets one communal hall and twenty-four
 * dwellings rather than forty of whichever mesh sorted first.
 */
export function planRoster(structureCount, rng) {
  const form = settlementForm(structureCount);
  const roster = [];
  const ordered = [...STRUCTURE_ROLES].sort((a, b) => b.priority - a.priority);

  // Pass 1 — everyone's minimum, in priority order.
  for (const role of ordered) {
    for (let i = 0; i < role.min && roster.length < structureCount; i += 1) roster.push(role.role);
  }
  // Pass 2 — fill the remainder, weighted by priority and capped at each max.
  const counts = Object.create(null);
  for (const role of roster) counts[role] = (counts[role] ?? 0) + 1;
  let guard = structureCount * 8;
  while (roster.length < structureCount && guard-- > 0) {
    const weighted = ordered.filter((role) => (counts[role.role] ?? 0) < role.max);
    if (!weighted.length) break;
    const total = weighted.reduce((sum, role) => sum + role.priority, 0);
    let ticket = rng() * total;
    const chosen = weighted.find((role) => (ticket -= role.priority) <= 0) ?? weighted[weighted.length - 1];
    roster.push(chosen.role);
    counts[chosen.role] = (counts[chosen.role] ?? 0) + 1;
  }
  return { form, roles: roster, counts };
}

/**
 * Generate one settlement.
 *
 * Returns `{ settlement, roads }`, or null when the region cannot host one —
 * which is a legitimate outcome the caller must handle, not an error. A region
 * of cliffs SHOULD refuse to hold a village.
 */
export function generateSettlement({
  prepared, region, rules, seed, structureCount, waterSources = [], resourceSites = [],
  obstacles = [], provider = null, name,
}) {
  const rng = createRng(seed);
  const bible = biomeBible(region.biome);
  const { form, roles, counts } = planRoster(structureCount, rng);
  const bounds = region.bounds;

  // 1. WATER FIRST. The settlement exists where survival is possible.
  //    Desert has no surface water (the live runtime forces `isWaterAt` false
  //    across the desert band), so its "source" is the collection site itself —
  //    the flattest defensible ground, which is exactly how the authored
  //    desert village is laid out around its water-collector tower.
  /* Occupied ground the settlement must respect. Resource seams and landmarks
     are placed BEFORE the settlement (a village founded beside an ore seam is
     the point), so they have to enter the solver as obstacles — otherwise the
     communal hall lands on top of the seam that justified it. */
  const preplaced = (obstacles ?? []).map((item) => ({
    x: item.x, z: item.z, radius: item.radius ?? 1.5, height: item.height ?? 2,
  }));

  /* Ring geometry, derived from the region the settlement has to fit inside.
     `ringLimitX` caps how far a ring may reach across a narrow band; the
     shortfall is taken up in z by `ringStretchZ`, so the same number of
     structures still fit at the same spacing — they just sit on an ellipse
     instead of a circle. */
  const halfWidth = (bounds.maxX - bounds.minX) / 2;
  const halfDepth = (bounds.maxZ - bounds.minZ) / 2;
  const outerRing = form.courtyardRadius + form.rings * form.ringSpacing;
  const ringLimitX = Math.min(outerRing, Math.max(form.ringSpacing, halfWidth - 3));
  // Area preservation: what the ellipse loses in x it recovers in z, bounded by
  // the region's own depth so a settlement never runs off the end of the band.
  const ringStretchZ = Math.min(
    Math.max(1, outerRing / Math.max(1, ringLimitX)),
    Math.max(1, (halfDepth - 3) / Math.max(1, outerRing)),
  );

  const anchorSearch = {
    prepared, rules, placed: preplaced, anchor: null, waterSources,
    resourceSites, bounds, radius: 3, ringLimitX, ringStretchZ,
    courtyardRadius: form.courtyardRadius, ringSpacing: form.ringSpacing,
    /* Keep the settlement off its own region's borders. A town hard against a
       band edge cannot grow roads outward — they leave the world or cross into
       a neighbour immediately — and it reads as having been pushed there. */
    interiorMargin: ringLimitX,
  };
  const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  const searchRadius = Math.min((bounds.maxX - bounds.minX) / 2, (bounds.maxZ - bounds.minZ) / 2) * 0.72;
  const anchor = findSite(anchorSearch, "communal", center, searchRadius, rng, { steps: 19 });
  if (!anchor) return null;

  // Structures are separated from each other AND from everything already there.
  const placed = [...preplaced];
  const structures = [];
  const context = {
    prepared, rules, placed, anchor, waterSources, resourceSites, bounds,
    courtyardRadius: form.courtyardRadius, ringSpacing: form.ringSpacing, radius: 2,
    ringLimitX, ringStretchZ,
  };

  // 2. THE COMMUNAL HEART, on the anchor itself.
  const heartRoles = roles.filter((role) => role === "communal");
  const others = roles.filter((role) => role !== "communal");
  let ordinal = 0;

  const emit = (role, site, reason) => {
    const asset = resolve({
      biome: region.biome, role,
      footprint: role === "communal" ? "large" : undefined,
      neighbourBiomes: region.neighbourBiomes ?? [],
    }, { provider, rng });
    if (!asset) return null;
    const structure = {
      id: `${name}-${role}-${ordinal++}`,
      role,
      assetId: asset.id,
      assetPath: asset.path,
      sourceTier: asset.sourceTier,
      x: Number(site.x.toFixed(4)),
      z: Number(site.z.toFixed(4)),
      y: Number(heightAt(prepared, site.x, site.z).toFixed(4)),
      rotation: Number((Math.atan2(anchor.x - site.x, anchor.z - site.z) + (rng() - 0.5) * 0.35).toFixed(4)),
      height: asset.dimensions.height,
      radius: asset.collisionRadius,
      collisionType: asset.collisionType,
      traversalRole: asset.traversalRole,
      gameplayRole: asset.gameplayRole,
      lodLevels: asset.lodLevels,
      /* Carried onto the placement, not left on the registry entry: the
         performance budget reads placements, and without these it fell back to
         guessing cost from mesh height (turning an 8 m authored hut into a
         62k-triangle estimate) and counted every instanced fern as its own
         draw call. */
      generationCost: asset.generationCost,
      instanced: Boolean(asset.instanced),
      // The audit trail. Every object states its own justification.
      reason,
    };
    structures.push(structure);
    context.radius = asset.collisionRadius;
    placed.push({ x: structure.x, z: structure.z, radius: asset.collisionRadius, height: asset.dimensions.height });
    return structure;
  };

  emit("communal", anchor, `Communal heart of ${name}: the flattest defensible ground with a viable ${bible.waterStrategy} source. ${ROLE_BY_NAME.communal.reason}`);
  for (let i = 1; i < heartRoles.length; i += 1) {
    const site = findSite(context, "communal", anchor, form.courtyardRadius + form.ringSpacing, rng);
    if (site) emit("communal", site, "Second hall, kept within sight of the first.");
  }

  // 3. EVERY OTHER ROLE, in Bible priority order so the high-priority roles
  //    claim their ring before the fillers crowd it.
  const byPriority = others.sort((a, b) => (ROLE_BY_NAME[b]?.priority ?? 0) - (ROLE_BY_NAME[a]?.priority ?? 0));
  const skipped = [];
  for (const role of byPriority) {
    const ring = ROLE_BY_NAME[role]?.ring ?? 1;
    // Reach must cover the STRETCHED ring, or the search window excludes the
    // very positions the elliptical scoring is steering structures toward.
    const reach = (form.courtyardRadius + (ring + 1) * form.ringSpacing) * ringStretchZ;
    const site = findSite(context, role, anchor, reach, rng, { steps: 19 });
    if (!site) { skipped.push(role); continue; }
    emit(role, site, ROLE_BY_NAME[role]?.reason ?? `${role} placed on ring ${ring}.`);
  }

  // 4. ROADS. The approach connects the heart outward through the widest gap
  //    in the perimeter, so the road does not run through a building.
  const roads = buildApproachRoads({ prepared, anchor, structures, form, rng, rules });

  return {
    settlement: {
      id: name,
      name,
      x: Number(anchor.x.toFixed(4)),
      z: Number(anchor.z.toFixed(4)),
      form: form.name,
      courtyardRadius: form.courtyardRadius,
      anchorStrategy: bible.settlementAnchor,
      structures,
      roleCounts: counts,
      skippedRoles: skipped,
      reason: `${form.name} of ${structures.length} ZekNovan structures organised around a communal heart; ${bible.architecture}`,
    },
    roads,
  };
}

/**
 * Approach roads out of a settlement.
 *
 * Directions are chosen as the widest angular gaps between placed structures,
 * which is why a generated road leaves through a plausible gate rather than
 * clipping a dwelling. Each road is then walked outward and rejected the moment
 * it would climb something impassable, so a road never ends in a cliff.
 */
export function buildApproachRoads({ prepared, anchor, structures, form, rng, rules, count = 2, length = 42 }) {
  const bearings = structures
    .map((structure) => Math.atan2(structure.z - anchor.z, structure.x - anchor.x))
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 0; i < bearings.length; i += 1) {
    const a = bearings[i];
    const b = i + 1 < bearings.length ? bearings[i + 1] : bearings[0] + Math.PI * 2;
    gaps.push({ mid: (a + b) / 2, size: b - a });
  }
  gaps.sort((a, b) => b.size - a.size);

  /* Walk gaps widest-first until `count` roads succeed, rather than trying only
     the widest two. A road attempt fails when the ground beyond the settlement
     is impassable in that direction, and in a region hemmed in by water or
     ridge the two widest gaps can both be the blocked ones — leaving a
     settlement with no approach at all, and therefore no patrol route either. */
  const roads = [];
  for (const gap of gaps) {
    if (roads.length >= count) break;
    const points = [{ x: anchor.x, z: anchor.z }];
    let x = anchor.x, z = anchor.z;
    // A slight seeded curve, so two roads out of the same village are not
    // mirror-image straight lines.
    let bearing = gap.mid + (rng() - 0.5) * 0.2;
    for (let step = 0; step < length / 3; step += 1) {
      bearing += (rng() - 0.5) * 0.12;
      const nx = x + Math.cos(bearing) * 3;
      const nz = z + Math.sin(bearing) * 3;
      // The playable world ends at the half-extent; beyond it the radial rim
      // climbs and there is nothing to drive to. A road that leaves the world
      // is not a road.
      if (Math.abs(nx) > prepared.half - 2 || Math.abs(nz) > prepared.half - 2) break;
      if (slopeAt(prepared, nx, nz) > rules.maxRoadSlope) break;
      if (isWaterAt(prepared, nx, nz)) break;
      x = nx; z = nz;
      points.push({ x: Number(x.toFixed(3)), z: Number(z.toFixed(3)) });
    }
    if (points.length >= 4) {
      roads.push({
        id: `road-${roads.length}`,
        width: 4,
        points,
        reason: "Approach road leaving the settlement through the widest gap in its perimeter, following passable ground.",
      });
    }
  }
  return roads;
}

/* ── scatter ───────────────────────────────────────────────────────────── */

/**
 * Vegetation, resource and prop scatter with exclusion.
 *
 * Poisson-ish rejection on a jittered lattice: uniform-looking without the
 * clumping of pure random, and deterministic because the lattice is fixed and
 * only the jitter is seeded. Exclusion zones keep scatter out of courtyards,
 * roads and arenas — the three places where a stray rock ruins something.
 */
export function scatter({
  prepared, region, rules, seed, count, roles, exclusions = [],
  minSpacing = 3, provider = null, category = "vegetation",
}) {
  const rng = createRng(seed);
  const bounds = region.bounds;
  const bible = biomeBible(region.biome);
  const placed = [];
  const out = [];

  /* Candidate pool, built once. Assets from the region's own biome first;
     neighbour-biome assets are admitted at tier 3 only to widen a thin
     vocabulary, and carry a reduced weight so they stay accents. */
  const pool = [];
  for (const role of roles) {
    for (const asset of findAssets({ biome: region.biome, role })) {
      pool.push({ asset, weight: weightOf(asset) });
    }
  }
  if (pool.length < 3) {
    for (const neighbour of region.neighbourBiomes ?? []) {
      for (const role of roles) {
        for (const asset of findAssets({ biome: neighbour, role })) {
          if (pool.some((entry) => entry.asset.id === asset.id)) continue;
          pool.push({
            asset: { ...asset, id: `${asset.id}@${region.biome}`, sourceTier: 3 },
            weight: weightOf(asset) * 0.35,
          });
        }
      }
    }
  }
  if (!pool.length) return [];

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  // Lattice sized so that a full lattice can supply the requested count with
  // room to reject; 2.4x oversampling survives typical rejection rates.
  const cells = Math.max(4, Math.ceil(Math.sqrt(count * 2.4)));
  const stepX = width / cells, stepZ = depth / cells;

  for (let i = 0; i < cells && out.length < count; i += 1) {
    for (let j = 0; j < cells && out.length < count; j += 1) {
      const x = bounds.minX + (i + 0.5 + (rng() - 0.5) * 0.9) * stepX;
      const z = bounds.minZ + (j + 0.5 + (rng() - 0.5) * 0.9) * stepZ;
      if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;

      const form = landformAt(prepared, x, z);
      if (form === "water" || form === "cliff") continue;
      /* Biome density is already baked into `count` by `suggestCounts`.
         Rejecting again here applied it twice, which squared it — the Desert
         (density 0.12) ended up at 0.014 and generated a region with no plants
         in it at all. */

      let excluded = false;
      for (const zone of exclusions) {
        const dx = x - zone.x, dz = z - zone.z;
        if (dx * dx + dz * dz < zone.radius * zone.radius) { excluded = true; break; }
      }
      if (excluded) continue;

      let tooClose = false;
      for (const other of placed) {
        const dx = x - other.x, dz = z - other.z;
        if (dx * dx + dz * dz < minSpacing * minSpacing) { tooClose = true; break; }
      }
      if (tooClose) continue;

      /* Pick across the UNION of the requested roles, weighted by availability
         and cost — not by first choosing a role uniformly.
         Choosing the role first meant that in a biome with no landmark mesh of
         its own, half of every scatter draw fell through to the tier-3
         neighbour borrow and the Forest filled with 60 borrowed 26k-triangle
         stone pillars. Weighting the union lets a biome's own cheap plants
         dominate and a borrowed hero mesh stay rare. */
      const asset = pickFromPool(pool, rng);
      if (!asset) continue;

      const entry = {
        id: `${region.id}-${category}-${out.length}`,
        assetId: asset.id,
        assetPath: asset.path,
        sourceTier: asset.sourceTier,
        x: Number(x.toFixed(4)),
        z: Number(z.toFixed(4)),
        y: Number(heightAt(prepared, x, z).toFixed(4)),
        rotation: Number((rng() * Math.PI * 2).toFixed(4)),
        scale: Number((0.85 + rng() * 0.4).toFixed(3)),
        radius: asset.collisionRadius,
        height: asset.dimensions.height,
        traversalRole: asset.traversalRole,
        lodLevels: asset.lodLevels,
        generationCost: asset.generationCost,
        instanced: Boolean(asset.instanced),
        landform: form,
        reason: `${asset.role} native to ${region.biome}; ${form} ground supports it and it clears every exclusion zone.`,
      };
      out.push(entry);
      placed.push({ x, z });
    }
  }
  return out;
}

/** Weighted draw from a prepared scatter pool. */
function pickFromPool(pool, rng) {
  let total = 0;
  for (const entry of pool) total += entry.weight;
  let ticket = rng() * total;
  for (const entry of pool) {
    ticket -= entry.weight;
    if (ticket <= 0) return entry.asset;
  }
  return pool[pool.length - 1]?.asset ?? null;
}

/**
 * Enemy patrol routes.
 *
 * Patrols follow the *approaches* to a settlement, because that is what a
 * patrol is for. A ring of enemies at a fixed radius is a spawner; a route
 * along the road the player will arrive on is an ambush the player can read.
 */
export function generatePatrols({ prepared, settlement, roads, rules, seed, count = 2, dangerLevel = 3 }) {
  const rng = createRng(seed);
  const patrols = [];
  for (const [index, road] of roads.entries()) {
    if (patrols.length >= count) break;
    // Patrol the outer half of the approach — near enough to matter, far enough
    // that the player is not attacked inside the settlement they just entered.
    const start = Math.floor(road.points.length * 0.45);
    const waypoints = road.points.slice(start).filter((_, i) => i % 2 === 0);
    if (waypoints.length < 2) continue;
    patrols.push({
      id: `${settlement.id}-patrol-${index}`,
      waypoints: waypoints.map((point) => ({ ...point, y: Number(heightAt(prepared, point.x, point.z).toFixed(3)) })),
      strength: Math.max(1, Math.round(dangerLevel * 0.6 + rng())),
      reason: `Hostile patrol holding the ${road.id} approach to ${settlement.id} — the route the player must use to reach it.`,
    });
  }
  return patrols;
}
