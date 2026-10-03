/**
 * ZekNova — WorldClaw spatial streaming
 * Location: /src/worldclaw/WorldStreaming.js
 *
 * Residency management for a world that may be larger than one frame's budget.
 *
 *     World -> Regions -> Chunks -> Cells -> Entities
 *
 * ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────
 * It is a residency PLAN: which cells should be at full simulation, which at
 * reduced LOD, which unloaded, given a viewer position. It computes that plan
 * as pure data and hands it to whoever owns the scene graph.
 *
 * It is NOT a second renderer. ZekNova already has `RenderPerformanceDirector`
 * (distance LOD and a shadow-caster budget) and `AdaptiveSimulationDirector`
 * (tiered simulation). Those keep authority over the live scene; this module
 * tells them *what exists where* in a generated world so their existing
 * policies have something to apply. Building a parallel scene manager would be
 * exactly the duplicate system the integration brief forbids.
 *
 * ── WHY CELLS AND NOT JUST DISTANCE ──────────────────────────────────────
 * Per-object distance checks are O(objects) every frame and they thrash: an
 * object at the boundary flips state each time the camera breathes. Bucketing
 * into fixed cells makes residency O(cells near the viewer), gives every object
 * in a cell the same fate (so a settlement never half-loads), and lets
 * hysteresis be expressed once per cell rather than once per prop.
 *
 * ── HYSTERESIS ───────────────────────────────────────────────────────────
 * A cell loads at `loadRadius` and unloads only past `unloadRadius`, which is
 * strictly larger. Without that gap, a player walking a boundary would load and
 * unload the same chunk every few frames — the single most common streaming
 * defect, and the one most likely to be mistaken for a memory leak.
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────
 * Cell assignment is a pure function of position and cell size, so the same
 * world always partitions identically. `plan()` is pure: same spec, same
 * viewer, same result. Nothing here reads a clock or mutates the spec.
 */

import { allPlacements } from "./WorldSpec.js";
import { PERFORMANCE_BUDGETS, degradeFor } from "./PerformanceBudget.js";

/**
 * Residency tiers, coarsest first.
 *
 * These map onto systems ZekNova already has rather than inventing new ones:
 * `full` is what the live game does today, `reduced` is what
 * RenderPerformanceDirector's distance LOD already produces, and `unloaded`
 * is simply absent from the scene.
 */
export const RESIDENCY = Object.freeze({
  FULL: "full",         // rendered at best LOD, physics active, AI ticking
  REDUCED: "reduced",   // rendered at low LOD, physics static, AI suspended
  DORMANT: "dormant",   // not rendered; state retained in memory
  UNLOADED: "unloaded", // not in memory; rebuilt deterministically on demand
});

/** Default cell size in world units. */
export const CELL_SIZE = 24;
/** Chunks group cells for coarse queries and for asset-load batching. */
export const CHUNK_SIZE = CELL_SIZE * 3;

export function cellKey(x, z, size = CELL_SIZE) {
  return `${Math.floor(x / size)}:${Math.floor(z / size)}`;
}

export function chunkKeyFor(x, z) {
  return `${Math.floor(x / CHUNK_SIZE)}:${Math.floor(z / CHUNK_SIZE)}`;
}

/**
 * Partition a world into chunks and cells.
 *
 * Built once per spec. Every object is assigned to exactly one cell, and each
 * cell records its own cost so the residency planner can respect a budget
 * without re-walking the objects.
 */
export function partition(spec, { cellSize = CELL_SIZE } = {}) {
  const cells = new Map();
  const chunks = new Map();

  for (const item of allPlacements(spec)) {
    const key = cellKey(item.x, item.z, cellSize);
    let cell = cells.get(key);
    if (!cell) {
      const cx = Math.floor(item.x / cellSize);
      const cz = Math.floor(item.z / cellSize);
      cell = {
        key,
        chunkKey: chunkKeyFor(item.x, item.z),
        center: { x: (cx + 0.5) * cellSize, z: (cz + 0.5) * cellSize },
        bounds: { minX: cx * cellSize, maxX: (cx + 1) * cellSize, minZ: cz * cellSize, maxZ: (cz + 1) * cellSize },
        regionIds: new Set(),
        entities: [],
        physicsBodies: 0,
        shadowCasters: 0,
        distinctAssets: new Set(),
      };
      cells.set(key, cell);
    }
    cell.entities.push(item);
    cell.regionIds.add(item.regionId);
    if ((item.radius ?? 0) > 0) cell.physicsBodies += 1;
    if (item.category === "structure" && (item.height ?? 0) >= 4) cell.shadowCasters += 1;
    if (item.assetId) cell.distinctAssets.add(item.assetId);

    let chunk = chunks.get(cell.chunkKey);
    if (!chunk) {
      chunk = { key: cell.chunkKey, cellKeys: new Set(), entityCount: 0, assets: new Set() };
      chunks.set(cell.chunkKey, chunk);
    }
    chunk.cellKeys.add(key);
    chunk.entityCount += 1;
    if (item.assetPath) chunk.assets.add(item.assetPath);
  }

  // Zones and boss arenas are residency ANCHORS, not entities: a boss arena
  // must be resident whenever the player is anywhere near it, even if it
  // contains no props at all.
  const anchors = [];
  for (const region of spec.regions) {
    for (const zone of region.zones ?? []) {
      anchors.push({
        id: zone.id, kind: zone.kind, x: zone.x, z: zone.z,
        radius: zone.radius ?? 8, regionId: region.id,
        // Mission and boss anchors force full residency: an objective that is
        // only "reduced" cannot be interacted with.
        forcesFull: zone.kind === "bossArena" || zone.kind === "objectivePlacement" || zone.kind === "missionSafe",
      });
    }
  }

  return {
    cellSize,
    cells: [...cells.values()].map((cell) => ({
      ...cell,
      regionIds: [...cell.regionIds],
      distinctAssets: [...cell.distinctAssets],
    })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    chunks: [...chunks.values()].map((chunk) => ({
      ...chunk, cellKeys: [...chunk.cellKeys], assets: [...chunk.assets],
    })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    anchors,
    totalEntities: allPlacements(spec).length,
  };
}

/**
 * Residency plan for a viewer position.
 *
 * `previous` is the last plan; passing it enables hysteresis and lets the
 * result report what actually CHANGED, which is what a scene manager needs —
 * re-applying an unchanged plan every frame would be the very cost streaming
 * exists to avoid.
 */
export function plan(partitioned, viewer, {
  tier = "balanced",
  previous = null,
  budgets = PERFORMANCE_BUDGETS,
} = {}) {
  const profile = degradeFor(tier);
  const loadRadius = profile.viewDistance;
  // 1.35x is the smallest gap that survives a player walking a boundary at
  // sprint speed without re-triggering; below that, cells thrash.
  const unloadRadius = loadRadius * 1.35;
  const reducedRadius = loadRadius * 2.1;

  const previousState = new Map((previous?.cells ?? []).map((cell) => [cell.key, cell.residency]));
  const assignments = [];
  let fullBodies = 0, fullShadowCasters = 0, fullEntities = 0;

  // Nearest first, so when a budget runs out it is the FAR cells that are
  // demoted — never the ground the player is standing on.
  const ranked = partitioned.cells
    .map((cell) => ({ cell, distance: Math.hypot(cell.center.x - viewer.x, cell.center.z - viewer.z) }))
    .sort((a, b) => a.distance - b.distance);

  for (const { cell, distance } of ranked) {
    const wasResident = previousState.get(cell.key) === RESIDENCY.FULL;
    // An anchor inside the cell that forces full residency overrides distance,
    // but not the budget: a distant boss arena is loaded, a hundred are not.
    const anchored = partitioned.anchors.some((anchor) =>
      anchor.forcesFull
      && Math.hypot(anchor.x - viewer.x, anchor.z - viewer.z) < loadRadius
      && Math.hypot(anchor.x - cell.center.x, anchor.z - cell.center.z) < anchor.radius + partitioned.cellSize);

    let residency;
    if (distance <= loadRadius || anchored) residency = RESIDENCY.FULL;
    else if (wasResident && distance <= unloadRadius) residency = RESIDENCY.FULL; // hysteresis
    else if (distance <= reducedRadius) residency = RESIDENCY.REDUCED;
    else residency = RESIDENCY.UNLOADED;

    if (residency === RESIDENCY.FULL) {
      const bodiesAfter = fullBodies + cell.physicsBodies;
      const castersAfter = fullShadowCasters + cell.shadowCasters;
      /* Budget demotion. A cell that would breach the physics-body or
         shadow-caster ceiling is demoted to REDUCED rather than dropped: the
         player still sees it, it just stops simulating. Dropping it would make
         geometry pop out of existence in view, which is worse than a static
         version of it. */
      if (bodiesAfter > budgets.physicsBodiesPerWorld.max || castersAfter > profile.shadowCasters * 3) {
        residency = RESIDENCY.REDUCED;
      } else {
        fullBodies = bodiesAfter;
        fullShadowCasters = castersAfter;
        fullEntities += cell.entities.length;
      }
    }

    assignments.push({
      key: cell.key,
      chunkKey: cell.chunkKey,
      residency,
      distance: Number(distance.toFixed(2)),
      entities: cell.entities.length,
      physicsBodies: cell.physicsBodies,
      changed: previousState.has(cell.key) ? previousState.get(cell.key) !== residency : residency !== RESIDENCY.UNLOADED,
    });
  }

  const byResidency = { full: 0, reduced: 0, dormant: 0, unloaded: 0 };
  for (const assignment of assignments) byResidency[assignment.residency] += 1;

  return Object.freeze({
    viewer: { x: viewer.x, z: viewer.z },
    tier: profile.tier,
    loadRadius,
    unloadRadius,
    cells: Object.freeze(assignments),
    changed: Object.freeze(assignments.filter((assignment) => assignment.changed)),
    counts: Object.freeze({ ...byResidency, fullEntities, fullPhysicsBodies: fullBodies, fullShadowCasters }),
    /* Chunks whose assets should be prefetched: anything REDUCED but not yet
       FULL is where the player is heading, and loading a GLB at the moment it
       becomes visible is what produces a hitch. */
    prefetchChunks: Object.freeze([...new Set(assignments
      .filter((assignment) => assignment.residency === RESIDENCY.REDUCED)
      .map((assignment) => assignment.chunkKey))]),
    withinBudget: fullBodies <= budgets.physicsBodiesPerWorld.warn,
  });
}

/**
 * Estimated cost of applying a plan delta, in milliseconds.
 *
 * A crude but honest model: entity instantiation dominates, and asset decode
 * dominates that when a chunk is new. It exists so the caller can SPLIT a large
 * delta across frames rather than discovering mid-frame that it cannot afford
 * it — which is the "do not stall gameplay while generating distant terrain"
 * requirement, expressed as a number something can act on.
 */
export function estimateApplyCost(planResult, { loadedChunks = new Set() } = {}) {
  let entities = 0, newChunks = 0;
  for (const cell of planResult.changed) {
    if (cell.residency === RESIDENCY.FULL || cell.residency === RESIDENCY.REDUCED) {
      entities += cell.entities;
      if (!loadedChunks.has(cell.chunkKey)) newChunks += 1;
    }
  }
  // 0.045 ms per entity instantiation and 6 ms per cold chunk are calibrated to
  // sit under the 33 ms hard chunk-load ceiling for a typical delta.
  const ms = entities * 0.045 + newChunks * 6;
  return Object.freeze({
    entities, newChunks,
    estimatedMs: Number(ms.toFixed(2)),
    withinBudget: ms <= PERFORMANCE_BUDGETS.chunkLoadMs.max,
    /* How many frames the caller should spread this over to stay inside the
       advisory budget. 1 means it is safe to apply in one go. */
    suggestedFrames: Math.max(1, Math.ceil(ms / PERFORMANCE_BUDGETS.chunkLoadMs.warn)),
  });
}

/**
 * Split a plan's changes into batches sized to a per-frame budget.
 * Nearest-first, so the player never waits on the ground under their feet.
 */
export function batchChanges(planResult, {
  msPerFrame = PERFORMANCE_BUDGETS.chunkLoadMs.warn,
  loadedChunks = new Set(),
} = {}) {
  const batches = [];
  const seenChunks = new Set(loadedChunks);
  let current = [], currentMs = 0;
  for (const cell of [...planResult.changed].sort((a, b) => a.distance - b.distance)) {
    /* Cold-chunk decode is the dominant cost and must be counted here, not only
       in the estimate. Batching on entity cost alone put a 77 ms delta into a
       single 12 ms frame — the estimator said "spread over 7 frames" and the
       batcher handed back one. */
    const coldChunk = !seenChunks.has(cell.chunkKey);
    const cost = cell.entities * 0.045 + (coldChunk ? 6 : 0);
    if (currentMs + cost > msPerFrame && current.length) {
      batches.push(current);
      current = []; currentMs = 0;
    }
    current.push(cell);
    currentMs += cost;
    seenChunks.add(cell.chunkKey);
  }
  if (current.length) batches.push(current);
  return batches;
}
