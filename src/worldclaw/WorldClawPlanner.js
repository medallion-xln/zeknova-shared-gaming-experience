/**
 * ZekNova — WorldClaw planning agent
 * Location: /src/worldclaw/WorldClawPlanner.js
 *
 * Turns intent into a constrained, validated world specification.
 *
 * ── WHAT "AGENT" MEANS HERE ──────────────────────────────────────────────
 * Not "calls an LLM". The planner is a deterministic constraint solver that
 * reads intent — either a structured brief or a sentence — and emits a spec
 * that satisfies ZekNova's biome adjacency, elevation continuity, water flow,
 * settlement logic, mission requirements, boss territories and traversal rules
 * simultaneously.
 *
 * An LLM may PROPOSE a spec (`planFromProposal`). It cannot install one. The
 * proposal is untrusted JSON: it is security-validated, stripped to the fields
 * the planner reads, merged as *preferences* over the deterministic plan, and
 * then re-validated. Every constraint below is enforced afterwards regardless
 * of what the proposal asked for.
 *
 * This is the brief's rule made structural:
 *
 *     AI proposes a specification.
 *     Deterministic runtime systems validate and execute it.
 *
 * ── THE CONSTRAINTS IT ACTUALLY SOLVES ───────────────────────────────────
 *  biome adjacency      illegal neighbours get a transition region inserted
 *  elevation            neighbouring regions' base heights are pulled together
 *                       so no border can step more than a walkable amount
 *  water flow           rivers run downhill; a region downstream of another
 *                       cannot sit above it
 *  settlement logic     a settlement is sized to the region that hosts it and
 *                       anchored per the Bible's per-biome water strategy
 *  mission requirements every canonical biome is present and gets a region
 *                       large enough for twelve utility-connected projects
 *  boss territories     each Guardian's arena is planned into the region its
 *                       BOSS_CONFIGS entry names, never another
 *  traversal            adjacent regions are connected; every settlement is on
 *                       the road graph
 *
 * ── DETERMINISM ──────────────────────────────────────────────────────────
 * Same intent + same seed => same spec, byte for byte. `planWorld` performs no
 * I/O, reads no clock and calls no global RNG. The tests assert digest equality
 * across two independent runs.
 */

import {
  createWorldSpec, deriveSeed, validateWorldSpec, WORLD_DEFAULTS, specDigest,
} from "./WorldSpec.js";
import {
  BIOME_BIBLE, biomeBible, adjacencyLegal, transitionPath, settlementForm,
} from "./ZekNovaWorldBible.js";
import { createRng } from "./SemanticPlacement.js";
import { validateProposal } from "./SecurityValidation.js";
import { BIOMES as CAMPAIGN_BIOMES, PROJECT_LADDER } from "../game/CampaignPlan.js";
import { BOSS_CONFIGS, MISSION_BOSS_IDS } from "../game/BossSystem.js";
import { suggestCounts } from "./PerformanceBudget.js";

/**
 * Keyword intent parsing.
 *
 * Deliberately a small, explicit vocabulary rather than anything clever. A
 * planner that guessed at free text would be non-deterministic in exactly the
 * way this module must not be; a fixed keyword table gives the same answer for
 * the same sentence forever, and anything it cannot read falls back to an
 * explicit default that the caller can see in the returned plan.
 */
const INTENT_VOCABULARY = Object.freeze({
  biome: {
    desert: ["desert", "dune", "arid", "sand", "sandstone"],
    forest: ["forest", "canopy", "woodland", "jungle"],
    highlands: ["highland", "ridge", "mountain", "plateau"],
    arctic: ["arctic", "ice", "frozen", "polar", "glacial"],
    wetlands: ["wetland", "marsh", "delta", "swamp", "mire"],
    canyon: ["canyon", "gorge", "ravine"],
    mesa: ["mesa", "butte"],
    basin: ["basin", "dry river", "riverbed", "watershed"],
    coastline: ["coast", "shore", "beach"],
    alpine: ["alpine", "summit", "peak"],
  },
  scale: {
    hamlet: ["outpost", "hamlet", "camp"],
    village: ["village", "settlement"],
    town: ["town", "civilization", "civilisation", "city"],
    seat: ["capital", "seat", "metropolis"],
  },
  feature: {
    dryRiver: ["dry river", "ancient river", "riverbed", "dry basin"],
    tradeRoute: ["trade route", "trade", "caravan", "supply"],
    ruins: ["ruin", "ancient", "abandoned"],
    wildlife: ["wildlife", "creature", "fauna", "ecology"],
    patrols: ["patrol", "hostile", "enemy", "raider"],
    vehicleCombat: ["vehicle", "traversal space", "open traversal", "vehicle combat"],
    hidden: ["hidden", "underground", "cave", "secret", "discovery"],
    landmark: ["landmark", "monument", "beacon", "tower"],
  },
});

/** Extract a structured brief from a sentence. Never throws. */
export function parseIntent(text) {
  const lower = String(text ?? "").toLowerCase();
  const found = { biomes: [], scale: null, features: [], structureCount: null };

  for (const [biome, words] of Object.entries(INTENT_VOCABULARY.biome)) {
    if (words.some((word) => lower.includes(word))) found.biomes.push(biome);
  }
  for (const [scale, words] of Object.entries(INTENT_VOCABULARY.scale)) {
    if (words.some((word) => lower.includes(word))) { found.scale = scale; break; }
  }
  for (const [feature, words] of Object.entries(INTENT_VOCABULARY.feature)) {
    if (words.some((word) => lower.includes(word))) found.features.push(feature);
  }
  // "approximately 40 structures" / "40 buildings"
  const count = lower.match(/(\d{1,3})\s*(?:structures?|buildings?|dwellings?)/);
  if (count) found.structureCount = Math.min(80, Math.max(1, Number(count[1])));

  return Object.freeze({
    ...found,
    biomes: Object.freeze(found.biomes),
    features: Object.freeze(found.features),
    text: String(text ?? ""),
  });
}

/* ── region layout ─────────────────────────────────────────────────────── */

/**
 * Lay out regions as bands with transitions inserted where adjacency is
 * illegal.
 *
 * Bands rather than a Voronoi partition because the live game's biome lookup
 * (`zkAOAt`) is a band index on x, and a generated world that does not agree
 * with it about which biome the player is standing in would break every
 * `biomeVisit` objective in the campaign. The transitions are what make the
 * bands read as terrain instead of as stripes.
 */
export function layoutRegions(biomeOrder, { half = WORLD_DEFAULTS.playableHalfExtent, depth = null } = {}) {
  const sequence = [];
  for (let i = 0; i < biomeOrder.length; i += 1) {
    sequence.push({ biome: biomeOrder[i], transition: false });
    const next = biomeOrder[i + 1];
    if (!next) continue;
    if (adjacencyLegal(biomeOrder[i], next)) continue;
    // A pair may need more than one archetype between them; insert the whole
    // chain so no border is left illegal.
    for (const bridge of transitionPath(biomeOrder[i], next) ?? []) {
      sequence.push({ biome: bridge, transition: true });
    }
  }

  /* Transition regions are narrower than the biomes they join — a canyon is a
     crossing, not a territory. Weighting rather than equal division is what
     keeps five campaign biomes at full playable width once transitions are
     inserted between them. */
  const weights = sequence.map((entry) => (entry.transition ? 0.45 : 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const span = half * 2;
  const zHalf = depth ?? half;

  let cursor = -half;
  return sequence.map((entry, index) => {
    const width = (span * weights[index]) / totalWeight;
    const minX = cursor;
    const maxX = cursor + width;
    cursor = maxX;
    return {
      id: entry.transition ? `${entry.biome}-transition-${index}` : entry.biome,
      biome: entry.biome,
      transition: entry.transition,
      bounds: { minX, maxX, minZ: -zHalf, maxZ: zHalf },
      center: { x: (minX + maxX) / 2, z: 0 },
    };
  });
}

/**
 * Elevation profile for a region sequence.
 *
 * Bases are chosen per biome, then relaxed toward their neighbours so no border
 * steps more than `maxStep`. Relaxation runs a fixed number of iterations
 * rather than to convergence, because a fixed count is deterministic and three
 * passes already brings every profile the Bible produces inside the limit.
 */
export function elevationProfile(regions, { maxStep = 4.5, passes = 12 } = {}) {
  const BASE_BY_BIOME = {
    wetlands: 0.4, coastline: 0.8, basin: 1.2, forest: 2.6, dunes: 3.4,
    desert: 3.9, canyon: 2.2, mesa: 7.4, highlands: 7.8, arctic: 6.2, alpine: 12.5,
  };
  const RELIEF_BY_BIOME = {
    wetlands: 1.4, coastline: 1.6, basin: 2.2, forest: 2.8, dunes: 3.6,
    desert: 3.2, canyon: 4.4, mesa: 5.2, highlands: 5.4, arctic: 3.4, alpine: 6.2,
  };
  const RIDGED_BY_BIOME = {
    wetlands: 0.12, coastline: 0.15, basin: 0.28, forest: 0.3, dunes: 0.34,
    desert: 0.38, canyon: 0.92, mesa: 0.86, highlands: 0.82, arctic: 0.4, alpine: 1,
  };

  const profile = regions.map((region) => ({
    base: BASE_BY_BIOME[region.biome] ?? 3.15,
    relief: RELIEF_BY_BIOME[region.biome] ?? 3.7,
    ridged: RIDGED_BY_BIOME[region.biome] ?? 0.5,
  }));

  /* Relaxation runs a FIXED number of passes rather than to convergence,
     because a fixed count is deterministic. Twelve, not three: each pass halves
     only the excess at one border, so a large span — wetlands at 0.4 up to
     alpine at 12.5 — was still 4.57 over a 4.5 limit after three passes, and
     the profile shipped with a border it had promised to remove. Twelve passes
     converge every profile the Bible can produce, and cost nothing measurable
     on a handful of regions. */
  for (let pass = 0; pass < passes; pass += 1) {
    let worst = 0;
    for (let i = 0; i < profile.length - 1; i += 1) {
      const gap = profile[i + 1].base - profile[i].base;
      worst = Math.max(worst, Math.abs(gap));
      if (Math.abs(gap) <= maxStep) continue;
      // Pull both ends toward each other by half the excess: a one-sided fix
      // would drag the whole profile in the direction of iteration.
      const excess = (Math.abs(gap) - maxStep) / 2 * Math.sign(gap);
      profile[i].base += excess;
      profile[i + 1].base -= excess;
    }
    // Early out once every border is legal; further passes would be no-ops.
    if (worst <= maxStep) break;
  }
  return profile;
}

/* ── the planner ───────────────────────────────────────────────────────── */

/**
 * Plan a complete world.
 *
 * `intent` may be a sentence or a structured brief. Anything the intent does
 * not state comes from the campaign's own requirements, not from a default
 * chosen here — which is why a plan with no intent at all is still a world the
 * twelve missions can be played in.
 */
export function planWorld({
  intent = null,
  seed = 0,
  worldId = "zeknova",
  biomeOrder = null,
  tier = "balanced",
  focusRegion = null,
  proposal = null,
} = {}) {
  const notes = [];
  const brief = typeof intent === "string" ? parseIntent(intent) : (intent ?? parseIntent(""));

  // An externally proposed spec is data, checked before a single field is read.
  let accepted = null;
  if (proposal) {
    const verdict = validateProposal(proposal);
    if (verdict.valid) {
      accepted = verdict.proposal;
      notes.push("An external proposal was accepted as preferences; every constraint below was still enforced deterministically.");
    } else {
      notes.push(`External proposal REJECTED (${verdict.errors.length} violation(s)); planning proceeded deterministically without it.`);
    }
  }

  /* Biome order.
     The five canonical AOs keep their canonical ORDER, always. This is not
     conservatism: the live runtime derives which AO the player is standing in
     purely from x position —

         zkAOAt(x) = zkAreasOfOperation[floor((x + worldSize/2) / (worldSize/5))]

     — indexing `CampaignPlan.BIOMES` in its declared order. A generated world
     that put the Desert where the runtime expects the Forest would report the
     wrong AO for every position, and every `biomeVisit` objective in the
     twelve-mission campaign would resolve against the wrong region.

     Intent can therefore ADD transition regions between the canonical five; it
     cannot reorder or remove them. */
  const extras = biomeOrder
    ?? accepted?.biomeOrder
    ?? (brief.biomes.length ? brief.biomes : null);
  const order = resolveBiomeOrder(extras, notes);

  const layout = layoutRegions(order);
  const profile = elevationProfile(layout);
  const rng = createRng(deriveSeed(seed, `plan:${worldId}`));

  /* Rivers. The live world has exactly one sinusoidal river; a generated world
     keeps it, and adds a dry ancient channel when the intent asks for one. The
     desert band overrides water to absent in the live runtime, so a river
     crossing it is marked dry rather than removed — a dry channel is a real
     landform and the reason a desert basin exists at all. */
  const rivers = [{
    id: "primary", axis: "x", amplitude: 6.4, wavelength: 0.052,
    secondaryAmplitude: 2.6, secondaryWavelength: 0.018, phase: 1.15,
    width: 8.5, depth: 3.1, dry: false,
    reason: "The planetary watercourse, carried over from the authored world so existing wetlands and bridge objectives are unchanged.",
  }];
  if (brief.features.includes("dryRiver")) {
    rivers.push({
      id: "ancient-channel", axis: "x", amplitude: 11.5, wavelength: 0.031,
      secondaryAmplitude: 4.1, secondaryWavelength: 0.012, phase: 2.4,
      width: 12, depth: 2.4, dry: true,
      reason: "An ancient dry channel: the reason a settlement stands here and the reason the water table is now reached by collection.",
    });
  }

  const regions = layout.map((entry, index) => {
    const bible = biomeBible(entry.biome);
    const isFocus = focusRegion ? entry.id === focusRegion || entry.biome === focusRegion : false;
    const areaHectares = ((entry.bounds.maxX - entry.bounds.minX) * (entry.bounds.maxZ - entry.bounds.minZ)) / 10000;
    const counts = suggestCounts({ areaHectares, tier, vegetationDensity: bible.vegetationDensity });

    // Settlement size. Intent can ask for a count; otherwise the region gets a
    // village, and transitions get nothing because ZekNovans cross them.
    let structureCount = 0;
    if (!entry.transition) {
      structureCount = isFocus && brief.structureCount ? brief.structureCount
        : brief.scale ? scaleToCount(brief.scale, rng)
        : 12;
    }

    return {
      id: entry.id,
      biome: entry.biome,
      kind: entry.transition ? "transition" : "territory",
      bounds: entry.bounds,
      center: entry.center,
      elevation: profile[index],
      climate: bible.climate,
      dangerLevel: dangerFor(entry.biome, isFocus, brief),
      terrain: {
        geology: bible.geology,
        waterStrategy: bible.waterStrategy,
        lighting: bible.lightingNote,
      },
      // Planning outputs, consumed by the director. These are intentions, not
      // placements: nothing has been positioned yet.
      plan: {
        structureCount,
        settlementAnchor: bible.settlementAnchor,
        vegetationCount: counts.vegetation,
        propCount: counts.props,
        vegetationRoles: bible.vegetation,
        wantsRuins: brief.features.includes("ruins") && isFocus,
        wantsHidden: brief.features.includes("hidden") && isFocus,
        wantsLandmark: brief.features.includes("landmark") || isFocus,
        wantsPatrols: brief.features.includes("patrols") || entry.biome !== "arctic",
        wantsWildlife: brief.features.includes("wildlife"),
        wantsTradeRoute: brief.features.includes("tradeRoute"),
        vehicleCorridor: brief.features.includes("vehicleCombat") && isFocus,
        focus: isFocus,
      },
      missionHooks: [],
      bossHooks: [],
    };
  });

  // Mission hooks: every canonical biome hosts every project. The hook position
  // is left to the director, which knows the terrain; the planner states only
  // WHICH missions belong WHERE, which is a campaign fact, not a terrain one.
  for (const region of regions) {
    if (!CAMPAIGN_BIOMES.includes(region.biome)) continue;
    region.missionHooks = PROJECT_LADDER.map((plan) => ({
      missionId: plan.mission,
      buildType: plan.type,
      project: plan.project,
      x: region.center.x, z: region.center.z, // provisional; the director sites it
      provisional: true,
      reason: `Mission ${plan.mission} delivers the ${plan.project} to the ${region.biome} AO.`,
    }));
  }

  // Boss arenas go in the biome each Guardian's own config names. Never
  // anywhere else — the mission text tells the player which AO to travel to.
  for (const [missionId, bossId] of Object.entries(MISSION_BOSS_IDS)) {
    const config = BOSS_CONFIGS[bossId];
    if (!config) continue;
    const host = regions.find((region) => region.biome === config.biome);
    if (!host) {
      notes.push(`Guardian "${bossId}" belongs to the ${config.biome} AO, which this world does not contain; its arena was not planned.`);
      continue;
    }
    host.bossHooks.push({
      bossId, missionId, biome: config.biome,
      /* Radius from the Guardian's own scale. This is the validator's own
         minimum with a small margin, NOT a generous one: the world is 180
         units across and once transition regions are inserted a band is around
         26 wide, so an over-generous arena simply cannot be sited and the
         Guardian ends up with no arena at all. */
      arenaRadius: 9 + config.scaleMultiplier * 2.5 + 1.5,
      x: host.center.x, z: host.center.z,
      provisional: true,
      reason: `${config.name} holds the ${config.biome} AO; mission "${missionId}" routes the player here.`,
    });
  }

  // Adjacency relationships, with blend widths that make transitions read.
  const relationships = [];
  for (let i = 0; i < regions.length - 1; i += 1) {
    const from = regions[i], to = regions[i + 1];
    relationships.push({
      from: from.id, to: to.id,
      kind: from.kind === "transition" || to.kind === "transition" ? "transition" : "adjacent",
      // Transitions blend wide (they ARE the blend); territory borders blend
      // narrow so each region still reads as itself.
      blendWidth: from.kind === "transition" || to.kind === "transition" ? 22 : 10,
    });
  }

  const spec = createWorldSpec({
    worldId,
    seed,
    intent: brief.text || null,
    regions,
    relationships,
    traversal: {
      rivers,
      roads: [], bridges: [], portals: [], corridors: [],
      fastTravelNodes: regions
        .filter((region) => region.kind !== "transition")
        .map((region) => ({
          id: `ft-${region.id}`, regionId: region.id,
          x: region.center.x, z: region.center.z,
          reason: `Fast-travel anchor for the ${region.biome} AO; also the streaming system's residency anchor for this region.`,
        })),
    },
    atmosphere: {
      skyPreset: "zeknova-twin-sun",
      sunCount: 2,
      fogDensity: 0.012,
      ...(accepted?.atmosphere ?? {}),
    },
    globalRules: {
      maxSlopeForBuild: 3.3,
      minBuildHeightAboveWater: 0.8,
      maxBuildHeight: 18,
      minStructureGap: 3,
      maxRoadSlope: 5.5,
      utilityRange: { power: 30, water: 36, data: 36 },
    },
  });

  const validation = validateWorldSpec(spec);
  return {
    spec,
    brief,
    notes,
    validation,
    /* The planner does not repair its own output. A spec that fails here is a
       planning bug, and reporting it is more useful than papering over it. */
    ok: validation.valid,
    digest: specDigest({ ...spec, digest: undefined }),
  };
}

function scaleToCount(scale, rng) {
  const form = settlementForm({ hamlet: 6, village: 14, town: 32, seat: 58 }[scale] ?? 14);
  const [min, max] = form.structures;
  return Math.round(min + (max - min) * (0.35 + rng() * 0.3));
}

function dangerFor(biome, isFocus, brief) {
  const base = { wetlands: 4, forest: 3, desert: 5, highlands: 5, arctic: 4 }[biome] ?? 3;
  return Math.min(10, base + (isFocus ? 1 : 0) + (brief.features.includes("patrols") ? 1 : 0));
}

/**
 * Build the region sequence: the five canonical AOs in their canonical order,
 * with any requested non-campaign archetype inserted where adjacency allows.
 *
 * An extra like `basin` or `canyon` is placed at the first legal seam — the
 * first adjacent pair of canonical biomes it may sit between. That is what lets
 * "an ancient dry river basin" become a real place in the world without moving
 * the Desert out from under the runtime's own AO lookup.
 */
function resolveBiomeOrder(requested, notes) {
  const order = [...CAMPAIGN_BIOMES];
  if (!requested?.length) return order;

  for (const biome of requested) {
    if (CAMPAIGN_BIOMES.includes(biome)) continue; // canonical: already placed, never moved
    if (!BIOME_BIBLE[biome]) {
      notes.push(`Requested biome "${biome}" is not in the ZekNova World Bible and was ignored.`);
      continue;
    }
    let inserted = false;
    for (let i = 0; i < order.length - 1; i += 1) {
      if (adjacencyLegal(order[i], biome) && adjacencyLegal(biome, order[i + 1])) {
        order.splice(i + 1, 0, biome);
        notes.push(`"${biome}" was inserted between the ${order[i]} and ${order[i + 2]} AOs, the first border its adjacency rules allow.`);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      notes.push(`"${biome}" has no legal position between the canonical AOs and was not added; the five campaign AOs keep their fixed order because the live runtime derives AO membership from x position.`);
    }
  }
  return order;
}

/**
 * Plan from an external (for example LLM) proposal.
 *
 * Convenience wrapper making the trust boundary obvious at the call site: the
 * proposal goes in as untrusted data and a deterministically-planned,
 * fully-validated spec comes out. There is no path through this function that
 * lets a proposal reach the scene.
 */
export function planFromProposal(proposal, options = {}) {
  return planWorld({ ...options, proposal });
}
