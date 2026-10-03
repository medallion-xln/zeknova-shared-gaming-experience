/**
 * ZekNova — WorldClaw performance budgets
 * Location: /src/worldclaw/PerformanceBudget.js
 *
 * Explicit ceilings, and what happens when a world approaches them.
 *
 * ── WHY BUDGETS ARE PART OF GENERATION, NOT PROFILING ────────────────────
 * A generator will happily produce a beautiful region that runs at 14 fps,
 * because nothing in "place a settlement here" knows what a draw call costs.
 * By the time a profiler notices, the world is already built and the only
 * remedy is to delete work someone approved.
 *
 * Budgeting at spec time makes cost a *generation constraint*: the director
 * asks how expensive a region will be before it commits, and the critic scores
 * a world down for exceeding a ceiling in exactly the same way it scores it
 * down for a floating rock.
 *
 * ── WHERE THESE NUMBERS COME FROM ────────────────────────────────────────
 * They are anchored to what ZekNova already ships and already survives:
 *  - `DESERT_GROUND_POOL_CAPACITY = 256` instanced ground tiles
 *  - a 129² height grid (16,641 vertices, ~33k triangles) for the terrain mesh
 *  - `maxPixelRatio: 1.75` and a shadow-caster budget in RenderPerformanceDirector
 *  - four LOD tiers on the heaviest meshes (`assets/model-lod-manifest.js`)
 * The ceilings are set at roughly 1.6x the shipped world so a generated region
 * can be richer than the handcrafted one without leaving the envelope the
 * renderer is already tuned for.
 *
 * ── GRACEFUL DEGRADATION ─────────────────────────────────────────────────
 * `degradeFor()` returns generation parameters scaled to a hardware tier. It
 * reduces *density and distance*, never structure: a low-tier machine sees the
 * same settlement with fewer shrubs and a nearer horizon, not a different town.
 * Losing detail is acceptable; losing the world's identity is not.
 */

/** Ceilings. `warn` starts costing score; `max` is a hard breach. */
export const PERFORMANCE_BUDGETS = Object.freeze({
  structuresPerRegion: Object.freeze({ warn: 48, max: 72 }),
  objectsPerRegion: Object.freeze({ warn: 320, max: 520 }),
  objectsPerWorld: Object.freeze({ warn: 1400, max: 2200 }),
  /* Physics bodies are the sharpest cliff in the live engine: the spatial hash
     is rebuilt on change and the narrowphase is O(pairs in cell). */
  physicsBodiesPerRegion: Object.freeze({ warn: 140, max: 220 }),
  physicsBodiesPerWorld: Object.freeze({ warn: 600, max: 900 }),
  /* Shadow casters dominate the shipped frame budget; RenderPerformanceDirector
     already culls them by distance, so this is the count before culling. */
  shadowCastersPerRegion: Object.freeze({ warn: 24, max: 40 }),
  /* Distinct meshes ≈ distinct draw calls for everything not instanced. */
  distinctAssetsPerRegion: Object.freeze({ warn: 34, max: 48 }),
  /* Draw calls, counting instanced assets as one call however many copies
     stand in the region — which is how the shipped renderer actually draws
     them. Without this, a region of 260 instanced ferns looked as expensive as
     260 unique buildings. */
  drawCallsPerRegion: Object.freeze({ warn: 90, max: 150 }),
  estimatedTrianglesPerRegion: Object.freeze({ warn: 900000, max: 1500000 }),
  estimatedTrianglesPerWorld: Object.freeze({ warn: 3800000, max: 6000000 }),
  aiAgentsPerRegion: Object.freeze({ warn: 18, max: 30 }),
  generationMsPerRegion: Object.freeze({ warn: 400, max: 1200 }),
  chunkLoadMs: Object.freeze({ warn: 12, max: 33 }),
});

/**
 * Rough triangle cost per asset, by generation cost tier. Deliberately an
 * estimate: the exact count needs the GLB parsed, which is a runtime concern.
 * The estimate is what generation can act on, and it is calibrated so the
 * heaviest shipped meshes (giant canopy tree, coral ground) land near their
 * real weight.
 */
const TRIANGLES_BY_COST = Object.freeze({ 1: 900, 2: 3200, 3: 9000, 4: 26000, 5: 62000 });

/** Hardware tiers, and what each one is allowed to spend. */
export const HARDWARE_TIERS = Object.freeze({
  high: Object.freeze({ densityScale: 1, viewDistance: 78, shadowCasters: 40, lodBias: 0, instanceCap: 320 }),
  balanced: Object.freeze({ densityScale: 0.72, viewDistance: 62, shadowCasters: 24, lodBias: 1, instanceCap: 256 }),
  low: Object.freeze({ densityScale: 0.42, viewDistance: 44, shadowCasters: 10, lodBias: 2, instanceCap: 144 }),
});

/**
 * Generation parameters for a hardware tier.
 *
 * Structure counts pass through UNSCALED. That is the deliberate part: a low
 * tier gets the same 40-structure settlement with sparser vegetation and a
 * nearer draw distance, so two players on different machines are looking at the
 * same place.
 */
export function degradeFor(tier = "balanced") {
  const profile = HARDWARE_TIERS[tier] ?? HARDWARE_TIERS.balanced;
  return Object.freeze({
    tier: HARDWARE_TIERS[tier] ? tier : "balanced",
    ...profile,
    scaleVegetation: (count) => Math.max(1, Math.round(count * profile.densityScale)),
    scaleProps: (count) => Math.max(0, Math.round(count * profile.densityScale)),
    scaleStructures: (count) => count,
  });
}

/**
 * Measure a spec against the budgets.
 *
 * Returns per-metric numbers, breaches, and a 0-100 score. The score loses 4
 * points per warning breach and 18 per hard breach — a hard breach alone should
 * be enough to drop the performance axis below the pass mark.
 */
export function measureSpec(spec, budgets = PERFORMANCE_BUDGETS) {
  const breaches = [];
  const perRegion = [];

  let worldObjects = 0, worldBodies = 0, worldTriangles = 0;

  for (const region of spec.regions ?? []) {
    const structures = (region.settlements ?? []).flatMap((settlement) => settlement.structures ?? []);
    const props = [...(region.vegetation ?? []), ...(region.landmarks ?? []), ...(region.resources ?? [])];
    const objects = [...structures, ...props];

    const bodies = objects.filter((item) => (item.radius ?? 0) > 0).length;
    const shadowCasters = structures.filter((item) => (item.height ?? 0) >= 4).length;
    const distinctAssets = new Set(objects.map((item) => item.assetId)).size;
    const instancedAssets = new Set(objects.filter((item) => item.instanced).map((item) => item.assetId));
    const drawCalls = objects.filter((item) => !item.instanced).length + instancedAssets.size;
    const triangles = objects.reduce((sum, item) => {
      const cost = TRIANGLES_BY_COST[costOf(item)] ?? TRIANGLES_BY_COST[2];
      // Assets with real LOD chains render their medium tier most of the time.
      return sum + (item.lodLevels > 1 ? cost * 0.55 : cost);
    }, 0);
    const agents = (region.enemies ?? []).reduce((sum, patrol) => sum + Number(patrol.strength ?? 1), 0)
      + (region.creatures ?? []).length;

    const measurement = {
      regionId: region.id,
      structures: structures.length,
      objects: objects.length,
      physicsBodies: bodies,
      shadowCasters,
      distinctAssets,
      estimatedTriangles: Math.round(triangles),
      drawCalls,
      aiAgents: agents,
    };
    perRegion.push(measurement);

    check(breaches, budgets.structuresPerRegion, measurement.structures, "structuresPerRegion", `Region "${region.id}" holds ${measurement.structures} structures`);
    check(breaches, budgets.objectsPerRegion, measurement.objects, "objectsPerRegion", `Region "${region.id}" holds ${measurement.objects} objects`);
    check(breaches, budgets.physicsBodiesPerRegion, measurement.physicsBodies, "physicsBodiesPerRegion", `Region "${region.id}" needs ${measurement.physicsBodies} physics bodies`);
    check(breaches, budgets.shadowCastersPerRegion, measurement.shadowCasters, "shadowCastersPerRegion", `Region "${region.id}" has ${measurement.shadowCasters} shadow casters`);
    check(breaches, budgets.distinctAssetsPerRegion, measurement.distinctAssets, "distinctAssetsPerRegion", `Region "${region.id}" uses ${measurement.distinctAssets} distinct meshes`);
    check(breaches, budgets.estimatedTrianglesPerRegion, measurement.estimatedTriangles, "estimatedTrianglesPerRegion", `Region "${region.id}" is ~${(measurement.estimatedTriangles / 1000).toFixed(0)}k triangles`);
    check(breaches, budgets.drawCallsPerRegion, measurement.drawCalls, "drawCallsPerRegion", `Region "${region.id}" needs ${measurement.drawCalls} draw calls`);
    check(breaches, budgets.aiAgentsPerRegion, measurement.aiAgents, "aiAgentsPerRegion", `Region "${region.id}" fields ${measurement.aiAgents} AI agents`);

    worldObjects += measurement.objects;
    worldBodies += measurement.physicsBodies;
    worldTriangles += measurement.estimatedTriangles;
  }

  check(breaches, budgets.objectsPerWorld, worldObjects, "objectsPerWorld", `The world holds ${worldObjects} objects`);
  check(breaches, budgets.physicsBodiesPerWorld, worldBodies, "physicsBodiesPerWorld", `The world needs ${worldBodies} physics bodies`);
  check(breaches, budgets.estimatedTrianglesPerWorld, worldTriangles, "estimatedTrianglesPerWorld", `The world is ~${(worldTriangles / 1e6).toFixed(2)}M triangles`);

  const hard = breaches.filter((breach) => breach.severity === "error").length;
  const soft = breaches.filter((breach) => breach.severity === "warning").length;

  return {
    perRegion,
    world: { objects: worldObjects, physicsBodies: worldBodies, estimatedTriangles: worldTriangles },
    breaches,
    score: Math.max(0, 100 - hard * 18 - soft * 4),
    withinBudget: hard === 0,
  };
}

function costOf(item) {
  if (Number.isFinite(item.generationCost)) return item.generationCost;
  // Fall back on physical size: bigger authored meshes are denser.
  const height = Number(item.height ?? 2);
  return height > 10 ? 5 : height > 7 ? 4 : height > 4 ? 3 : height > 2 ? 2 : 1;
}

function check(breaches, budget, value, metric, subject) {
  if (!budget) return;
  if (value > budget.max) {
    breaches.push({ severity: "error", metric, value, limit: budget.max, message: `${subject}, over the hard ceiling of ${budget.max}.` });
  } else if (value > budget.warn) {
    breaches.push({ severity: "warning", metric, value, limit: budget.warn, message: `${subject}, over the ${budget.warn} advisory budget.` });
  }
}

/**
 * Target object counts for a region of a given area and hardware tier.
 * The planner calls this BEFORE placing anything, so a region is sized to its
 * budget rather than trimmed back after the fact.
 */
export function suggestCounts({ areaHectares, tier = "balanced", vegetationDensity = 0.5 }) {
  const profile = degradeFor(tier);
  const vegetation = Math.round(areaHectares * VEGETATION_PER_HECTARE * vegetationDensity * profile.densityScale);
  const props = Math.round(areaHectares * PROPS_PER_HECTARE * profile.densityScale);
  return Object.freeze({
    vegetation: Math.min(vegetation, PERFORMANCE_BUDGETS.objectsPerRegion.warn - 60),
    props: Math.min(props, 60),
    tier: profile.tier,
  });
}

/**
 * Density rates, calibrated against the SHIPPED world rather than guessed.
 *
 * The live runtime plants 672 harvestable trees and 48 rock formations across a
 * 180x180 world (`addHarvestableTrees`, `addMineableStones` in the bundle), and
 * distributes them by `BIOME_TREE_DENSITY` — forest 1.0 down to desert 0.12,
 * averaging 0.516. That works out at roughly 620 objects per hectare per unit
 * of biome density at full fidelity.
 *
 * ZekNova is a COMPACT world: 2.8 playable hectares total. An open-world rate
 * of a few objects per hectare — which is what these constants were before they
 * were checked against the game — produced a desert region containing zero
 * plants. Generated regions must match the density the authored world already
 * ships at, or they read as bare ground beside it.
 */
const VEGETATION_PER_HECTARE = 620;
const PROPS_PER_HECTARE = 40;
