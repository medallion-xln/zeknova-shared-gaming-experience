/**
 * ZekNova — WorldClaw semantic asset registry
 * Location: /src/worldclaw/WorldAssetRegistry.js
 *
 * Every authored ZekNova environment mesh, described in terms a generator can
 * reason about rather than a filename it has to already know.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Before this file, "which model is a desert dwelling" was answerable only by
 * reading five hardcoded arrays in `assets/environment-runtime.js` and
 * recognising `sandstone-dome-dwelling.glb` by eye. A placement system cannot
 * do that. It needs to ask
 *
 *     findAssets({ biome: "desert", role: "dwelling", footprint: "small" })
 *
 * and get an answer, which is the whole of Phase 6.
 *
 * ── THE RESOLUTION LADDER ────────────────────────────────────────────────
 * `resolve()` walks the hierarchy the integration brief specifies, in order:
 *
 *   1. an existing authored ZekNova asset            <- almost always wins
 *   2. an existing procedural asset
 *   3. a parametric variation of an authored asset   <- rotation/scale/tint
 *   4. an asset assembled from existing components
 *   5. an external generative provider               <- optional, may be absent
 *   6. a placeholder                                 <- only when 1-5 all fail
 *
 * Tier 1 winning "almost always" is the point. ZekNova ships 211 authored GLBs
 * including complete village kits; a generator that reaches past them for an
 * inference endpoint would be replacing art someone made with art nobody
 * approved, and would make the world depend on a network.
 *
 * ── EVERY PATH HERE IS REAL ──────────────────────────────────────────────
 * Each `path` below corresponds to a file checked into `assets/models/`.
 * `verifyRegistry()` in the test suite re-checks that on disk, so a renamed or
 * deleted mesh fails a test instead of failing silently at runtime as a
 * missing model.
 */

import { ROLE_BY_NAME } from "./ZekNovaWorldBible.js";

const BASE = "./assets/models/environment";

/**
 * Footprint buckets, by the mesh's authored world height. Height is the honest
 * proxy here because the shipped runtime already normalises every environment
 * model by height (`prepareModel(scene, targetHeight)`), so it is the one
 * dimension the art is actually authored against.
 */
export function footprintClass(height) {
  if (height <= 1.6) return "tiny";
  if (height <= 3.2) return "small";
  if (height <= 5.6) return "medium";
  if (height <= 8.0) return "large";
  return "huge";
}

/* Columns: id, path, role, biomes, height, radius, gameplayRole, traversalRole,
   rarity (0-1, lower is rarer), cost (relative generation/render cost 1-5). */
const rows = [
  // ── Desert civilisation ────────────────────────────────────────────────
  ["elderCommunalDome", "desert-village/elder-communal-dome.glb", "communal", ["desert", "basin"], 6.5, 2.6, "settlement", "blocking", 0.15, 3],
  ["sanctuaryDome", "desert-village/sanctuary-dome.glb", "sacred", ["desert", "basin"], 5.5, 2.3, "settlement", "blocking", 0.2, 3],
  ["sandstoneDomeDwelling", "desert-village/sandstone-dome-dwelling.glb", "dwelling", ["desert", "basin", "mesa"], 4.6, 2.1, "settlement", "blocking", 1, 2],
  ["desertMarketPavilion", "desert-village/desert-market-pavilion.glb", "market", ["desert", "basin"], 5.2, 2.5, "settlement", "blocking", 0.3, 3],
  ["communalOven", "desert-village/communal-oven.glb", "craft", ["desert", "basin"], 3.0, 1.5, "settlement", "blocking", 0.5, 2],
  ["beaconWatchtower", "desert-village/beacon-watchtower.glb", "watch", ["desert", "mesa", "canyon", "basin"], 8.5, 1.6, "navigation", "landmark", 0.4, 3],
  ["windCatcherSail", "desert-village/wind-catcher-sail.glb", "craft", ["desert", "dunes", "basin"], 6.5, 1.4, "ambience", "blocking", 0.6, 2],
  ["waterCollectorTower", "desert-village/water-collector-tower.glb", "water", ["desert", "basin", "mesa"], 7.0, 1.6, "infrastructure", "blocking", 0.25, 3],
  ["crystalEnergyArray", "desert-village/crystal-energy-array.glb", "energy", ["desert", "basin", "mesa", "highlands"], 4.5, 1.9, "infrastructure", "blocking", 0.3, 3],
  ["crystalHarvestingRig", "desert-village/crystal-harvesting-rig.glb", "extraction", ["desert", "mesa", "canyon"], 5.0, 2.0, "resource", "blocking", 0.35, 3],
  ["mineEntrance", "desert-village/mine-entrance.glb", "extraction", ["desert", "canyon", "mesa", "highlands"], 4.0, 2.2, "discovery", "blocking", 0.2, 3],

  // ── Forest civilisation ────────────────────────────────────────────────
  ["forestElderTreeHouse", "forest-village/elder-tree-house.glb", "communal", ["forest"], 8.4, 3.0, "settlement", "blocking", 0.15, 4],
  ["forestDwelling", "forest-village/forest-dwelling.glb", "dwelling", ["forest"], 5.4, 2.2, "settlement", "blocking", 1, 2],
  ["forestMarketPavilion", "forest-village/village-market-pavilion.glb", "market", ["forest"], 5.8, 2.4, "settlement", "blocking", 0.3, 3],
  ["forestArtisanWorkshop", "forest-village/artisan-workshop.glb", "craft", ["forest"], 5.2, 2.1, "settlement", "blocking", 0.5, 2],
  ["forestHerbalistHut", "forest-village/herbalist-hut.glb", "craft", ["forest"], 5.0, 2.0, "settlement", "blocking", 0.5, 2],
  ["forestBakeryOven", "forest-village/village-bakery-oven.glb", "craft", ["forest"], 3.4, 1.5, "settlement", "blocking", 0.6, 2],
  ["forestCraftingStation", "forest-village/outdoor-crafting-station.glb", "craft", ["forest"], 2.8, 1.3, "settlement", "blocking", 0.7, 1],
  ["forestCommunityWell", "forest-village/community-well.glb", "water", ["forest", "highlands"], 2.6, 1.2, "infrastructure", "blocking", 0.4, 1],
  ["forestGardenBridge", "forest-village/stone-garden-bridge.glb", "marker", ["forest", "wetlands"], 2.2, 1.6, "navigation", "walkable", 0.5, 2],
  ["forestBanner", "forest-village/decorative-banner.glb", "marker", ["forest"], 4.2, 0, "ambience", "decorative", 0.8, 1],

  // ── Wetlands civilisation ──────────────────────────────────────────────
  ["stiltDwelling", "wetlands-village/stilt-dwelling.glb", "dwelling", ["wetlands", "coastline"], 5.2, 2.1, "settlement", "blocking", 1, 2],
  ["fishingHutPier", "wetlands-village/fishing-hut-pier.glb", "craft", ["wetlands", "coastline"], 4.2, 2.4, "settlement", "walkable", 0.5, 2],
  ["boatDock", "wetlands-village/boat-dock.glb", "marker", ["wetlands", "coastline"], 2.0, 2.6, "navigation", "walkable", 0.4, 2],
  ["waterWheelMill", "wetlands-village/water-wheel-mill.glb", "craft", ["wetlands"], 5.6, 2.3, "infrastructure", "blocking", 0.3, 3],
  ["canalLockSluice", "wetlands-village/canal-lock-sluice.glb", "water", ["wetlands", "coastline"], 3.2, 2.2, "infrastructure", "blocking", 0.3, 3],
  ["smallDam", "wetlands-village/small-dam.glb", "water", ["wetlands"], 3.6, 3.2, "infrastructure", "blocking", 0.2, 3],
  ["reedLilyPadGarden", "wetlands-village/reed-lily-pad-garden.glb", "marker", ["wetlands", "coastline"], 0.9, 0, "ambience", "decorative", 0.7, 1],
  ["wetlandLanternPost", "wetlands-village/wetland-lantern-post.glb", "marker", ["wetlands", "coastline"], 3.0, 0.4, "navigation", "decorative", 0.8, 1],

  // ── Arctic civilisation ────────────────────────────────────────────────
  ["arcticVillageCouncil", "zeknovan-village-council-arctic.glb", "communal", ["arctic", "alpine"], 5.8, 2.5, "settlement", "blocking", 0.15, 3],
  ["arcticVillageShrine", "zeknovan-village-shrine-arctic.glb", "sacred", ["arctic", "alpine"], 5.2, 2.2, "settlement", "blocking", 0.2, 3],
  ["arcticVillageHabitat", "zeknovan-village-habitat-arctic.glb", "dwelling", ["arctic", "alpine"], 4.9, 2.1, "settlement", "blocking", 1, 2],

  // ── Shared 24-piece village kit ────────────────────────────────────────
  // Cross-biome, which is what makes a generated settlement in ANY region able
  // to reach a plausible structure count without repeating three meshes.
  ["canopyTreehouse", "village-kit/canopy-treehouse.glb", "communal", ["forest", "wetlands"], 7.4, 3.0, "settlement", "blocking", 0.15, 4],
  ["mossCottage", "village-kit/moss-cottage.glb", "dwelling", ["forest", "wetlands", "highlands"], 4.6, 2.15, "settlement", "blocking", 0.9, 2],
  ["seedPodHut", "village-kit/seed-pod-hut.glb", "dwelling", ["forest", "desert", "wetlands", "basin"], 3.6, 1.7, "settlement", "blocking", 0.9, 2],
  ["leafShelter", "village-kit/leaf-shelter.glb", "dwelling", ["forest", "wetlands"], 3.0, 1.6, "settlement", "blocking", 0.8, 1],
  ["roundMarketHut", "village-kit/round-market-hut.glb", "market", ["forest", "desert", "highlands", "wetlands", "basin"], 3.8, 1.8, "settlement", "blocking", 0.6, 2],
  ["tradePavilion", "village-kit/trade-pavilion.glb", "market", ["desert", "forest", "highlands", "basin"], 4.4, 2.3, "settlement", "blocking", 0.4, 2],
  ["shadeCanopy", "village-kit/shade-canopy.glb", "market", ["desert", "dunes", "basin", "mesa"], 3.2, 1.9, "ambience", "blocking", 0.7, 1],
  ["ovalAwning", "village-kit/oval-awning.glb", "market", ["desert", "basin"], 2.9, 1.7, "ambience", "blocking", 0.7, 1],
  ["villageHearth", "village-kit/village-hearth.glb", "communal", ["forest", "desert", "highlands", "arctic", "wetlands", "basin"], 1.9, 1.2, "settlement", "blocking", 0.5, 1],
  ["potteryTable", "village-kit/pottery-table.glb", "craft", ["forest", "desert", "highlands", "basin"], 1.3, 0.8, "ambience", "blocking", 0.8, 1],
  ["supplyTable", "village-kit/supply-table.glb", "storage", ["forest", "desert", "highlands", "wetlands", "basin"], 1.2, 0.8, "ambience", "blocking", 0.8, 1],
  ["provisionSacks", "village-kit/provision-sacks.glb", "storage", ["forest", "desert", "highlands", "basin"], 1.0, 0.7, "ambience", "blocking", 0.9, 1],
  ["tradeSupplies", "village-kit/trade-supplies.glb", "storage", ["desert", "forest", "basin"], 1.1, 0.7, "ambience", "blocking", 0.9, 1],
  ["gardenStand", "village-kit/garden-stand.glb", "storage", ["forest", "wetlands", "basin"], 2.0, 1.35, "ambience", "blocking", 0.8, 1],
  ["waterStation", "village-kit/water-station.glb", "water", ["forest", "desert", "highlands", "wetlands", "basin"], 2.4, 1.2, "infrastructure", "blocking", 0.4, 2],
  ["sacredGarden", "village-kit/sacred-garden.glb", "sacred", ["forest", "wetlands", "basin"], 1.0, 0, "ambience", "decorative", 0.5, 1],
  ["sacredShrub", "village-kit/sacred-shrub.glb", "sacred", ["forest", "wetlands", "desert", "basin"], 1.35, 0, "ambience", "decorative", 0.7, 1],
  ["villageBanner", "village-kit/village-banner.glb", "marker", ["forest", "desert", "highlands", "arctic", "wetlands", "basin", "canyon"], 4.0, 0, "ambience", "decorative", 0.8, 1],
  ["boundaryPole", "village-kit/boundary-pole.glb", "marker", ["forest", "desert", "highlands", "arctic", "wetlands", "basin", "canyon", "mesa", "dunes"], 2.6, 0.3, "navigation", "decorative", 1, 1],
  ["hangingWaypost", "village-kit/hanging-waypost.glb", "marker", ["forest", "desert", "highlands", "canyon", "mesa", "basin"], 3.1, 0.35, "navigation", "decorative", 0.9, 1],
  ["boneRailing", "village-kit/bone-railing.glb", "marker", ["forest", "wetlands", "highlands", "canyon"], 1.1, 0, "navigation", "decorative", 0.9, 1],
  ["archedBridge", "village-kit/arched-bridge.glb", "marker", ["forest", "wetlands", "canyon", "highlands"], 3.4, 2.8, "navigation", "walkable", 0.3, 2],
  ["timberWalkwayA", "village-kit/timber-walkway-a.glb", "marker", ["forest", "wetlands", "coastline"], 0.6, 0, "navigation", "walkable", 0.8, 1],
  ["timberWalkwayB", "village-kit/timber-walkway-b.glb", "marker", ["forest", "wetlands", "coastline"], 0.6, 0, "navigation", "walkable", 0.8, 1],

  // ── Vegetation and terrain features ────────────────────────────────────
  ["giantCanopyTree", "giant-canopy-tree.glb", "vegetation", ["forest"], 12.5, 1.8, "ambience", "blocking", 0.5, 5],
  ["alienPalmTree", "alien-palm-tree.glb", "vegetation", ["desert", "wetlands", "coastline", "basin"], 8.5, 0.7, "ambience", "blocking", 0.8, 2],
  ["alienSpikyPlant", "alien-spiky-plant.glb", "vegetation", ["desert", "highlands", "arctic", "dunes", "mesa", "canyon", "basin", "alpine"], 3.2, 0.5, "ambience", "decorative", 1, 1],
  ["alienCoralGround", "alien-coral-ground.glb", "vegetation", ["wetlands", "coastline"], 4.2, 1.4, "ambience", "blocking", 0.6, 4],
  ["redTrumpetFlower", "red-trumpet-flower.glb", "vegetation", ["forest", "wetlands"], 1.45, 0, "ambience", "decorative", 0.9, 1],
  ["spiralFernCluster", "spiral-fern-cluster.glb", "vegetation", ["forest", "wetlands"], 1.8, 0, "ambience", "decorative", 0.9, 1],
  ["pitcherPlantCluster", "pitcher-plant-cluster.glb", "vegetation", ["forest", "wetlands"], 2.8, 0.4, "ambience", "decorative", 0.8, 2],
  ["purplePodPlant", "purple-pod-plant.glb", "vegetation", ["forest", "wetlands", "desert", "basin"], 3.4, 0.4, "ambience", "decorative", 0.8, 2],
  ["tieredStonePillar", "tiered-stone-pillar.glb", "landmark", ["highlands", "canyon", "mesa", "alpine"], 7.5, 1.5, "navigation", "landmark", 0.35, 4],

  // ── Ground surfacing ───────────────────────────────────────────────────
  ["sunCrackedSandstone", "desert-ground/sun-cracked-sandstone.glb", "ground", ["desert", "dunes", "mesa", "basin"], 0.1, 0, "ambience", "walkable", 1, 1],
  ["rootBoundPath", "desert-ground/root-bound-path.glb", "ground", ["desert", "basin", "canyon"], 0.1, 0, "navigation", "walkable", 0.8, 1],
  ["dryVineGround", "desert-ground/dry-vine-ground.glb", "ground", ["desert", "basin"], 0.1, 0, "ambience", "walkable", 0.8, 1],
  ["wovenMosaic", "desert-ground/woven-mosaic.glb", "ground", ["desert", "basin"], 0.1, 0, "settlement", "walkable", 0.4, 1],
];

/**
 * Assets the shipped runtime renders through a single InstancedMesh
 * (`INSTANCE_ASSET_KEYS` in `assets/environment-runtime.js`). Many instances of
 * one of these cost one draw call, not one per object — which is the difference
 * between a dense region and an unshippable one.
 */
const INSTANCED = new Set([
  "tieredStonePillar", "alienCoralGround", "redTrumpetFlower",
  "spiralFernCluster", "pitcherPlantCluster", "purplePodPlant",
  "alienSpikyPlant", "sunCrackedSandstone", "rootBoundPath",
  "dryVineGround", "wovenMosaic",
]);

/** Models with pre-built `.high/.medium/.low` LODs (`assets/model-lod-manifest.js`). */
const LOD_READY = new Set([
  "alien-coral-ground.glb", "alien-palm-tree.glb", "alien-spiky-plant.glb",
  "giant-canopy-tree.glb", "tiered-stone-pillar.glb",
  "zeknovan-village-council-arctic.glb", "zeknovan-village-shrine-arctic.glb",
  "zeknovan-village-habitat-arctic.glb",
]);

export const WORLD_ASSETS = Object.freeze(rows.map(([
  id, file, role, biomeTags, height, radius, gameplayRole, traversalRole, rarity, generationCost,
]) => Object.freeze({
  id,
  path: `${BASE}/${file}`,
  file,
  type: role === "vegetation" ? "vegetation" : role === "ground" ? "ground" : role === "landmark" ? "landmark" : "structure",
  role,
  biomeTags: Object.freeze([...biomeTags]),
  civilizationTags: Object.freeze(role === "vegetation" || role === "ground" || role === "landmark" ? ["natural"] : ["zeknovan"]),
  dimensions: Object.freeze({ height, radius, footprint: footprintClass(height) }),
  collisionType: radius > 0 ? "cylinder" : "none",
  collisionRadius: radius,
  lodLevels: LOD_READY.has(file) ? 4 : 1,
  instanced: INSTANCED.has(id),
  traversalRole,
  gameplayRole,
  rarity,
  generationCost,
  /* Where this asset came from in the resolution ladder. Authored meshes are
     tier 1; anything the resolver synthesises records a higher tier so the
     critic can report how much of a region is real art. */
  sourceTier: 1,
})));

const BY_ID = new Map(WORLD_ASSETS.map((asset) => [asset.id, asset]));

export function assetById(id) {
  return BY_ID.get(id) ?? null;
}

/**
 * Semantic query over the registry.
 *
 * Every filter is optional; results are returned in a stable order (rarity
 * descending, then id) so two runs with the same query see the same list. That
 * stability is load-bearing — the placement solver picks by seeded index into
 * this array, so an unstable sort would silently break determinism.
 */
export function findAssets({
  biome, role, roles, type, footprint, civilization, gameplayRole,
  traversalRole, maxCost, minRadius, maxRadius,
} = {}) {
  const wanted = roles ? new Set(roles) : role ? new Set([role]) : null;
  return WORLD_ASSETS.filter((asset) => {
    if (biome && !asset.biomeTags.includes(biome)) return false;
    if (wanted && !wanted.has(asset.role)) return false;
    if (type && asset.type !== type) return false;
    if (footprint && asset.dimensions.footprint !== footprint) return false;
    if (civilization && !asset.civilizationTags.includes(civilization)) return false;
    if (gameplayRole && asset.gameplayRole !== gameplayRole) return false;
    if (traversalRole && asset.traversalRole !== traversalRole) return false;
    if (maxCost !== undefined && asset.generationCost > maxCost) return false;
    if (minRadius !== undefined && asset.collisionRadius < minRadius) return false;
    if (maxRadius !== undefined && asset.collisionRadius > maxRadius) return false;
    return true;
  }).sort((a, b) => (b.rarity - a.rarity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/* ── the resolution ladder ─────────────────────────────────────────────── */

/**
 * Resolve one placement request to a concrete asset.
 *
 * `provider` is an optional `Generative3DProvider`. It is consulted ONLY at
 * tier 5, after every authored and parametric option has been exhausted, and
 * a provider that throws or returns nothing simply drops through to tier 6.
 * Nothing here awaits a network call on the critical path: the provider
 * interface is synchronous-optional by design, and the director calls the
 * async path separately when a provider is explicitly enabled.
 *
 * `rng` must be a function returning [0,1) — the caller passes a seeded one,
 * so resolution is deterministic.
 */
export function resolve(request = {}, { provider = null, rng = () => 0.5 } = {}) {
  const { biome, role, footprint, allowPlaceholder = true } = request;

  // Tier 1 — an authored asset that matches everything asked for.
  const exact = findAssets({ biome, role, footprint });
  if (exact.length) return pick(exact, rng, 1);

  // Tier 2 — an authored asset for the role, relaxing footprint.
  const byRole = findAssets({ biome, role });
  if (byRole.length) return pick(byRole, rng, 2);

  // Tier 3 — parametric variation: the same role from a biome the Bible allows
  // to border this one, re-tinted and re-scaled to fit. Still authored art.
  const neighbours = request.neighbourBiomes ?? [];
  for (const neighbour of neighbours) {
    const borrowed = findAssets({ biome: neighbour, role });
    if (borrowed.length) {
      const base = pick(borrowed, rng, 3);
      return {
        ...base,
        id: `${base.id}@${biome}`,
        sourceTier: 3,
        variation: { tintToBiome: biome, scale: 0.92 + rng() * 0.16 },
      };
    }
  }

  // Tier 4 — assembled from components: the ring role's nearest structural
  // relative in any biome, plus a marker to read as intentional.
  const ringPeers = findAssets({ role, type: "structure" });
  if (ringPeers.length) {
    const base = pick(ringPeers, rng, 4);
    return { ...base, id: `${base.id}#assembled`, sourceTier: 4, assembledFrom: [base.id] };
  }

  // Tier 5 — an external generative provider, when one is installed AND it can
  // answer synchronously from its own cache. Never blocks.
  if (provider && typeof provider.resolveCached === "function") {
    try {
      const generated = provider.resolveCached({ biome, role, footprint });
      if (generated) return { ...generated, sourceTier: 5 };
    } catch {
      // A provider fault is not a world fault. Fall through.
    }
  }

  // Tier 6 — placeholder. Recorded, scored down by the critic, never silent.
  if (!allowPlaceholder) return null;
  return {
    id: `placeholder:${role ?? "object"}`,
    path: null,
    type: "placeholder",
    role: role ?? "object",
    biomeTags: Object.freeze(biome ? [biome] : []),
    civilizationTags: Object.freeze(["zeknovan"]),
    dimensions: Object.freeze({ height: 2.5, radius: 1.2, footprint: "small" }),
    collisionType: "cylinder",
    collisionRadius: 1.2,
    lodLevels: 1,
    traversalRole: "blocking",
    gameplayRole: "ambience",
    rarity: 1,
    generationCost: 1,
    sourceTier: 6,
  };
}

/**
 * Weighted pick.
 *
 * Weight is `rarity / generationCost`, which is what stops a scatter pass from
 * producing a forest of hero meshes. The live game plants 672 trees as five
 * instanced low-poly primitives and places its heavy authored GLBs — the
 * 26k-triangle giant canopy tree, the coral ground — sparsely and under a
 * distance limit. Uniform selection ignored that and generated regions at
 * several million triangles apiece.
 *
 * Selection is a deterministic walk down the weighted list, so the same rng
 * sequence always yields the same asset.
 */
function pick(list, rng, tier) {
  let total = 0;
  for (const asset of list) total += weightOf(asset);
  let ticket = rng() * total;
  let chosen = list[list.length - 1];
  for (const asset of list) {
    ticket -= weightOf(asset);
    if (ticket <= 0) { chosen = asset; break; }
  }
  return tier === 1 ? chosen : { ...chosen, sourceTier: tier };
}

export function weightOf(asset) {
  return Math.max(0.02, (asset.rarity ?? 0.5) / Math.max(1, asset.generationCost ?? 1));
}

/** Roles the registry can actually serve for a biome. Used by the planner. */
export function servableRoles(biome) {
  const roles = new Set();
  for (const asset of WORLD_ASSETS) {
    if (asset.biomeTags.includes(biome) && ROLE_BY_NAME[asset.role]) roles.add(asset.role);
  }
  return [...roles].sort();
}

/** Registry summary for the critic's asset-variety score and the editor. */
export function registrySummary() {
  const byRole = {};
  const byBiome = {};
  for (const asset of WORLD_ASSETS) {
    byRole[asset.role] = (byRole[asset.role] ?? 0) + 1;
    for (const biome of asset.biomeTags) byBiome[biome] = (byBiome[biome] ?? 0) + 1;
  }
  return Object.freeze({ total: WORLD_ASSETS.length, byRole: Object.freeze(byRole), byBiome: Object.freeze(byBiome) });
}
