/**
 * ZekNova — World Bible
 * Location: /src/worldclaw/ZekNovaWorldBible.js
 *
 * The authored identity of the planet, stated as data a generator can obey.
 *
 * ── WHY THIS FILE DECIDES ANYTHING ───────────────────────────────────────
 * A generator with no identity constraints converges on Earth. It will place a
 * well in the middle of a village, ring it with pine trees, and call the result
 * a settlement — because that is the shape "village" has in every corpus. That
 * would be a technology demo wearing ZekNova's name.
 *
 * So the rules ZekNova has *already committed to* in its authored art and its
 * mission text are written down here as constraints, and the generators read
 * them instead of inventing their own. Everything below is derived from what
 * the repository already contains, not invented for this file:
 *
 *   - the twin-sun sky and heat-exposure hazard   (Biomes.js, desert AO)
 *   - domes, wind-catchers, sail shades           (models/environment/desert-village)
 *   - canopy dwellings and elder trees            (models/environment/forest-village)
 *   - stilt dwellings over water                  (models/environment/wetlands-village)
 *   - crystal energy arrays and harvesting rigs   (models/environment/desert-village)
 *   - "ZekNovan aid" civic buildings              (Missions.js ZEKNOVAN_AID_TYPES)
 *   - neurospore canopy / cryogenic hazards       (Biomes.js hazards)
 *
 * ── THE ONE RULE THAT MATTERS MOST ───────────────────────────────────────
 * ZekNovans build *around* a shared resource, not along a street. Every
 * settlement in the shipped art has a communal centre — an elder dome, a
 * canopy treehouse, a council hall — with dwellings facing it. `settlementForm`
 * below encodes that as concentric rings with a kept-clear courtyard, which is
 * why generated villages read as authored rather than scattered.
 */

/** Cultural identity constants. Referenced by the planner and the critic. */
export const ZEKNOVA_IDENTITY = Object.freeze({
  planet: "ZekNova",
  civilisation: "zeknovan",
  /* Pre-industrial in form, post-industrial in energy: ZekNovans shape stone,
     bone, reed and grown timber, then power it with crystal arrays. Nothing in
     the authored kit is welded steel or neon, and nothing generated should be. */
  technologyLevel: "crystal-organic",
  forbiddenMotifs: Object.freeze([
    "earth-conifer", "medieval-timber-frame", "neon-cyberpunk",
    "brutalist-concrete", "chrome-scifi-kitbash", "gothic-cathedral",
  ]),
  signatureMotifs: Object.freeze([
    "dome", "wind-catcher", "sail-shade", "crystal-array", "bone-railing",
    "woven-mosaic", "stilt-platform", "canopy-dwelling", "seed-pod",
  ]),
});

/**
 * How a ZekNovan settlement is shaped.
 *
 * `courtyardRadius` is kept clear of everything — it is the communal space the
 * whole form exists to enclose. The shipped Forest village uses 5.5 and the
 * Arctic village 7.5; the values here bracket that range by settlement scale.
 */
export const SETTLEMENT_FORM = Object.freeze({
  hamlet: Object.freeze({ structures: [4, 8], courtyardRadius: 4.5, rings: 2, ringSpacing: 6.5 }),
  village: Object.freeze({ structures: [9, 20], courtyardRadius: 5.5, rings: 3, ringSpacing: 7.5 }),
  town: Object.freeze({ structures: [21, 45], courtyardRadius: 7.5, rings: 4, ringSpacing: 8.5 }),
  seat: Object.freeze({ structures: [46, 80], courtyardRadius: 9.5, rings: 5, ringSpacing: 9.5 }),
});

/**
 * Structure roles in the order a ZekNovan settlement acquires them.
 *
 * This is the "why does this building exist" ladder that Phase 7 requires.
 * Ring 0 is the communal heart, ring 1 the daily-life band, ring 2 production,
 * ring 3 the defensive/observational perimeter. A generator that places by role
 * rather than by index produces a settlement whose silhouette means something.
 */
export const STRUCTURE_ROLES = Object.freeze([
  Object.freeze({ role: "communal", ring: 0, min: 1, max: 2, priority: 100, reason: "The shared hall the settlement is built around." }),
  Object.freeze({ role: "sacred", ring: 0, min: 0, max: 2, priority: 85, reason: "Ancestor and ecology observance, always within sight of the hall." }),
  Object.freeze({ role: "dwelling", ring: 1, min: 3, max: 24, priority: 90, reason: "Households face the communal centre." }),
  Object.freeze({ role: "market", ring: 1, min: 0, max: 3, priority: 70, reason: "Trade sits between the households and the approach road." }),
  Object.freeze({ role: "craft", ring: 2, min: 0, max: 8, priority: 60, reason: "Smoke, heat and noise are kept outside the dwelling ring." }),
  Object.freeze({ role: "water", ring: 2, min: 0, max: 4, priority: 95, reason: "Water infrastructure anchors to the nearest reliable source." }),
  Object.freeze({ role: "energy", ring: 2, min: 0, max: 4, priority: 80, reason: "Crystal arrays need open sky and clearance from structures." }),
  Object.freeze({ role: "storage", ring: 2, min: 0, max: 6, priority: 50, reason: "Provisioning sits on the route between production and the hall." }),
  Object.freeze({ role: "extraction", ring: 3, min: 0, max: 4, priority: 65, reason: "Mines and rigs follow the resource, not the settlement plan." }),
  Object.freeze({ role: "watch", ring: 3, min: 0, max: 6, priority: 75, reason: "Watchtowers hold the high ground on the likely approach." }),
  Object.freeze({ role: "marker", ring: 3, min: 0, max: 10, priority: 30, reason: "Banners and posts mark the settlement's claimed edge." }),
]);

export const ROLE_BY_NAME = Object.freeze(Object.fromEntries(STRUCTURE_ROLES.map((r) => [r.role, r])));

/**
 * Per-biome authored identity. `palette` values are the terrain colours the
 * live game already uses (`src/world/Biomes.js`), so a generated region tints
 * the same as the handcrafted one beside it.
 */
export const BIOME_BIBLE = Object.freeze({
  desert: Object.freeze({
    terrainColor: 0xb87532,
    climate: "arid",
    geology: "Wind-cut sandstone over an ancient seabed; crystal seams surface where the water table dropped.",
    architecture: "Thermal-mass domes, wind-catcher towers and tensioned sail shades. Openings face away from the twin suns.",
    vegetation: ["spikyPlant", "palmTree", "purplePodPlant"],
    vegetationDensity: 0.12,
    hazard: "Twin-sun heat exposure",
    /* Desert has no surface water in the live game — the runtime explicitly
       overrides `isWaterAt` to false and `riverDistanceAt` to 999 for the
       desert band. Settlements therefore anchor to collection, not to a river. */
    waterStrategy: "atmospheric-collection",
    settlementAnchor: "water-collector",
    lightingNote: "Hard double shadows at midday; long amber rake at dusk.",
  }),
  forest: Object.freeze({
    terrainColor: 0x174f32,
    climate: "humid",
    geology: "Deep loam over root-bound bedrock; the canopy is load-bearing.",
    architecture: "Dwellings grown into and suspended from elder trees; bone-railed walkways between them.",
    vegetation: ["giantCanopyTree", "spiralFernCluster", "redTrumpetFlower", "pitcherPlantCluster"],
    vegetationDensity: 1,
    hazard: "Neurospore canopy",
    waterStrategy: "surface-stream",
    settlementAnchor: "elder-tree",
    lightingNote: "Green-filtered shafts; almost no direct sun at ground level.",
  }),
  highlands: Object.freeze({
    terrainColor: 0x566d63,
    climate: "montane",
    geology: "Folded ridge stone with tiered pillar intrusions and frequent rockfall.",
    architecture: "Terraced stone platforms cut into the slope; observation posts on the ridgeline.",
    vegetation: ["tieredStonePillar", "spikyPlant"],
    vegetationDensity: 0.48,
    hazard: "Rockfall and electrical storms",
    waterStrategy: "spring-catchment",
    settlementAnchor: "terrace",
    lightingNote: "High contrast; storm cells cast moving shadow across the ridge.",
  }),
  arctic: Object.freeze({
    terrainColor: 0xa8d5e3,
    climate: "polar",
    geology: "Layered ice over preserved sediment; the climate archive is readable in the strata.",
    architecture: "Half-buried council and shrine domes with insulated habitat shells.",
    vegetation: ["spikyPlant"],
    vegetationDensity: 0.2,
    hazard: "Cryogenic wind chill",
    waterStrategy: "ice-melt",
    settlementAnchor: "council-dome",
    lightingNote: "Low-angle light, heavy sky bounce, minimal shadow contrast.",
  }),
  wetlands: Object.freeze({
    terrainColor: 0x1d6259,
    climate: "humid",
    geology: "Braided silt channels over coral-derived hardpan.",
    architecture: "Stilt dwellings over water, plank piers, lock-and-sluice water control.",
    vegetation: ["coralGround", "pitcherPlantCluster", "purplePodPlant"],
    vegetationDensity: 0.78,
    hazard: "Contaminated mire and movement drag",
    waterStrategy: "channel-control",
    settlementAnchor: "pier",
    lightingNote: "Diffuse and humid; strong water bounce onto undersides.",
  }),
  /* Transition archetypes. These are what stop the five bands reading as five
     abutting rectangles: a canyon between desert and highlands is a place, not
     a fade. They carry no settlement anchor because ZekNovans do not settle
     them — they cross them. */
  canyon: Object.freeze({
    terrainColor: 0x9c6a41, climate: "transitional",
    geology: "A dry watercourse cut through sandstone into the ridge base.",
    architecture: "Route markers and waypost shelters only.",
    vegetation: ["spikyPlant"], vegetationDensity: 0.18,
    hazard: "Flash-channel rockfall", waterStrategy: "none",
    settlementAnchor: null, lightingNote: "Deep shadow at the floor; rim lit for most of the day.",
  }),
  mesa: Object.freeze({
    terrainColor: 0xa9743a, climate: "arid",
    geology: "Erosion-resistant caps standing above the deflated plain.",
    architecture: "Summit watch posts reached by cut stair.",
    vegetation: ["spikyPlant"], vegetationDensity: 0.08,
    hazard: "Exposure and fall", waterStrategy: "none",
    settlementAnchor: null, lightingNote: "Silhouette landmark; reads at long range.",
  }),
  dunes: Object.freeze({
    terrainColor: 0xc98f4d, climate: "arid",
    geology: "Migrating sand sheets; nothing built here stays buried or stays exposed.",
    architecture: "None permanent.",
    vegetation: ["spikyPlant"], vegetationDensity: 0.05,
    hazard: "Shifting ground", waterStrategy: "none",
    settlementAnchor: null, lightingNote: "Smooth gradient shading; strong form reading.",
  }),
  alpine: Object.freeze({
    terrainColor: 0x8fa39b, climate: "montane",
    geology: "Bare ridge stone above the vegetation line.",
    architecture: "Beacon posts.",
    vegetation: [], vegetationDensity: 0.02,
    hazard: "Electrical storms", waterStrategy: "none",
    settlementAnchor: null, lightingNote: "Cold high-key light.",
  }),
  coastline: Object.freeze({
    terrainColor: 0x2f7a6d, climate: "temperate",
    geology: "Coral hardpan shelving into standing water.",
    architecture: "Docks and landing steps.",
    vegetation: ["coralGround"], vegetationDensity: 0.4,
    hazard: "Tidal drag", waterStrategy: "channel-control",
    settlementAnchor: "pier", lightingNote: "Specular water bounce.",
  }),
  basin: Object.freeze({
    terrainColor: 0xa07a4e, climate: "transitional",
    geology: "A closed depression holding the last of the ancient river.",
    architecture: "Collection and storage structures on the rim.",
    vegetation: ["purplePodPlant", "spikyPlant"], vegetationDensity: 0.22,
    hazard: "Sink and subsidence", waterStrategy: "atmospheric-collection",
    settlementAnchor: "water-collector", lightingNote: "Rim-lit bowl; the floor holds shadow longest.",
  }),
});

/**
 * Which biomes may border which. The planner uses this to refuse a spec that
 * puts arctic next to desert with nothing between them — the single most
 * common way procedural worlds announce that no one planned them.
 *
 * Stated as an adjacency map of *legal direct neighbours*; anything else needs
 * a transition region inserted between the two.
 */
export const BIOME_ADJACENCY = Object.freeze({
  forest: ["forest", "wetlands", "highlands", "coastline", "basin"],
  desert: ["desert", "dunes", "mesa", "canyon", "basin", "highlands"],
  highlands: ["highlands", "canyon", "alpine", "mesa", "forest", "desert", "arctic"],
  arctic: ["arctic", "alpine", "highlands", "coastline"],
  wetlands: ["wetlands", "coastline", "forest", "basin"],
  canyon: ["canyon", "desert", "highlands", "mesa", "basin"],
  mesa: ["mesa", "desert", "canyon", "dunes", "highlands"],
  dunes: ["dunes", "desert", "mesa", "basin"],
  alpine: ["alpine", "highlands", "arctic"],
  coastline: ["coastline", "wetlands", "arctic", "forest"],
  basin: ["basin", "desert", "dunes", "canyon", "wetlands", "forest"],
});

/** True when two biomes may share a border with no transition region. */
export function adjacencyLegal(a, b) {
  return Boolean(BIOME_ADJACENCY[a]?.includes(b));
}

/**
 * The single transition archetype that legalises an otherwise illegal border,
 * or null when one step is not enough. Use `transitionPath` for the general
 * case — some pairs are genuinely two archetypes apart (desert and arctic share
 * no legal intermediate, which is correct: nothing on ZekNova goes from dune
 * field to ice sheet across one border).
 */
export function transitionBetween(a, b) {
  const path = transitionPath(a, b);
  return path?.length === 1 ? path[0] : null;
}

/** Transition archetypes, in order, that legalise every border between a and b.
 *
 * Returns `[]` when the border is already legal and `null` when no chain of
 * archetypes can join the two. A breadth-first search over the adjacency map,
 * with candidates walked in a fixed order so the result is deterministic — a
 * planner that picked a different bridge on different runs would break the
 * determinism contract the whole subsystem rests on.
 */
export function transitionPath(a, b, { maxHops = 3 } = {}) {
  if (adjacencyLegal(a, b)) return [];
  /* Transition archetypes are tried FIRST, then territories.
     Ordering matters and pure-archetype searching is not enough: desert and
     arctic have no archetype-only chain between them at all — every route runs
     through the Highlands, which is a territory. Excluding territories made
     that pair unbridgeable, when the honest answer is "they are separated by
     the Highlands", which is exactly how the shipped world is laid out. */
  const bridges = [
    "canyon", "mesa", "basin", "coastline", "alpine", "dunes",
    "highlands", "forest", "wetlands", "desert", "arctic",
  ].filter((candidate) => candidate !== a && candidate !== b);
  const queue = [[a, []]];
  const seen = new Set([a]);
  while (queue.length) {
    const [current, path] = queue.shift();
    if (path.length >= maxHops) continue;
    for (const candidate of bridges) {
      if (seen.has(candidate) || !adjacencyLegal(current, candidate)) continue;
      const next = [...path, candidate];
      if (adjacencyLegal(candidate, b)) return next;
      seen.add(candidate);
      queue.push([candidate, next]);
    }
  }
  return null;
}

/** Settlement form for a structure count, or the largest form when off-scale. */
export function settlementForm(structureCount) {
  const count = Math.max(0, Math.floor(Number(structureCount) || 0));
  for (const [name, form] of Object.entries(SETTLEMENT_FORM)) {
    if (count >= form.structures[0] && count <= form.structures[1]) return { name, ...form };
  }
  return { name: "seat", ...SETTLEMENT_FORM.seat };
}

export function biomeBible(biome) {
  return BIOME_BIBLE[biome] ?? BIOME_BIBLE.highlands;
}
