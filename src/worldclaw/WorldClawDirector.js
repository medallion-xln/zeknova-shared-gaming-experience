/**
 * ZekNova — WorldClaw generation director
 * Location: /src/worldclaw/WorldClawDirector.js
 *
 * The orchestration layer. Runs the pipeline, and is the only thing that
 * decides whether a world is allowed to exist.
 *
 *     intent
 *       -> WorldClawPlanner          structured specification
 *       -> TerrainGenerator          global coherent terrain
 *       -> (biome parameters)        already carried by the region graph
 *       -> WorldAssetRegistry        semantic asset resolution
 *       -> SemanticPlacement         settlements, scatter, roads, patrols
 *       -> MissionPlacementValidator missions and boss arenas sited and checked
 *       -> WorldCritic               scored evaluation
 *       -> WorldRepairDirector       bounded local repair
 *       -> critique again            refinement loop
 *       -> playable WorldSpec
 *
 * ── WHY THERE IS NO SEPARATE BiomeGenerator OR MaterialGenerator CLASS ────
 * The brief sketches those as pipeline stages. In ZekNova they would be empty
 * shells: biome identity is already carried end to end by the region graph plus
 * the World Bible, and materials are already owned by the shipped
 * `VisualThemeManager` / Picasso theme layer, which the integration must not
 * duplicate or fight. Adding classes that only forward calls would be building
 * a parallel replacement for systems that work — which the brief explicitly
 * forbids. The stages exist; they are just not new objects.
 *
 * ── THE REFINEMENT LOOP ──────────────────────────────────────────────────
 * Generate, critique, repair, re-critique — up to `maxRefinements`. It stops
 * early when the critic passes, and it stops entirely rather than looping when
 * a pass fixes nothing, because an unfixable finding will still be unfixable
 * on the next attempt.
 *
 * ── WHAT IT REFUSES TO SHIP ──────────────────────────────────────────────
 * A world with any campaign failure is never returned as playable, no matter
 * how high its other scores. `generate()` returns `{ playable: false }` with
 * the reasons attached. Nothing downstream will materialise a world flagged
 * that way.
 */

import { createWorldSpec, deriveSeed, specDigest, GENERATOR_VERSION } from "./WorldSpec.js";
import { planWorld } from "./WorldClawPlanner.js";
import { prepare, heightAt, slopeAt, isWaterAt, landformAt } from "./TerrainGenerator.js";
import {
  generateSettlement, scatter, generatePatrols, createRng, buildable,
} from "./SemanticPlacement.js";
import { findAssets, resolve } from "./WorldAssetRegistry.js";
import { biomeBible } from "./ZekNovaWorldBible.js";
import {
  findBuildClusters, validateCampaign, validateBossArena,
} from "./MissionPlacementValidator.js";
import { critique, formatScoreCard } from "./WorldCritic.js";
import { repair } from "./WorldRepairDirector.js";
import { createProvider } from "./Generative3DProvider.js";
import { degradeFor } from "./PerformanceBudget.js";

export const WORLDCLAW_AUTHORITY = Object.freeze({
  tier: "DEVELOPER_TOOLING",
  /* WorldClaw emits specifications. It does not touch the live scene, mutate
     mission state, or alter physics. Materialisation into a running game is a
     separate, explicitly-invoked step (`WorldClawRuntime`), and even that is
     additive and gated. */
  canMutateLiveWorld: false,
  canModifyMissionState: false,
  canModifyPhysics: false,
  canModifySaveState: false,
  requiresExternalAI: false,
});

export class WorldClawDirector {
  constructor({
    seed = 0,
    worldId = "zeknova",
    tier = "balanced",
    provider = null,
    externalAI = false,
    maxRefinements = 3,
  } = {}) {
    this.seed = seed >>> 0;
    this.worldId = worldId;
    this.tier = tier;
    this.maxRefinements = maxRefinements;
    // Off unless explicitly enabled. `createProvider` returns a NullProvider
    // for `enabled: false` no matter what else is passed.
    this.provider = createProvider({ enabled: externalAI, provider });
    this.budget = degradeFor(tier);
    this.trace = [];
  }

  #step(stage, detail) {
    this.trace.push({ stage, ...detail });
  }

  /**
   * Run the full pipeline.
   *
   * `intent` may be a sentence, a structured brief, or null. `focusRegion`
   * names the region that gets the intent's full attention — the vertical-slice
   * switch, so one region can be built to demonstration quality without paying
   * for the whole planet.
   */
  generate({ intent = null, focusRegion = null, proposal = null } = {}) {
    this.trace = [];
    const started = nowMs();

    // ── 1. PLAN ─────────────────────────────────────────────────────────
    const planned = planWorld({
      intent, seed: this.seed, worldId: this.worldId,
      tier: this.tier, focusRegion, proposal,
    });
    this.#step("plan", {
      ok: planned.ok,
      regions: planned.spec.regions.length,
      notes: planned.notes,
      errors: planned.validation.errors,
    });
    if (!planned.ok) {
      return this.#fail("planning", planned.validation.errors, { plan: planned });
    }

    // ── 2. TERRAIN ──────────────────────────────────────────────────────
    const prepared = prepare(planned.spec);
    this.#step("terrain", { regions: prepared.regions.length, rivers: prepared.rivers.length });

    // ── 3-7. POPULATE ───────────────────────────────────────────────────
    const draft = JSON.parse(JSON.stringify(planned.spec));
    const roads = [];
    // Everything already standing anywhere in the world, so a region's solver
    // can see across its own border.
    const placedWorldwide = [];

    for (const region of draft.regions) {
      const plan = region.plan ?? {};
      const bible = biomeBible(region.biome);
      const regionSeed = deriveSeed(this.seed, `region:${region.id}`);
      region.neighbourBiomes = neighboursOf(draft, region.id);

      // Resource sites first: extraction structures and mission hooks both
      // want to know where the material actually is.
      region.resources = this.#placeResources({ prepared, region, seed: regionSeed, spec: draft, occupied: placedWorldwide });
      placedWorldwide.push(...region.resources.map((item) => ({ x: item.x, z: item.z, radius: item.radius, height: item.height })));

      // Landmarks before settlements, because a settlement sited under a
      // landmark reads as founded there for a reason.
      region.landmarks = this.#placeLandmarks({ prepared, region, plan, seed: regionSeed, spec: draft, occupied: placedWorldwide });
      placedWorldwide.push(...region.landmarks.map((item) => ({ x: item.x, z: item.z, radius: item.radius, height: item.height })));

      // Settlement. Structures already standing in earlier regions are passed
      // in as obstacles too: two settlements either side of a band boundary
      // were solved independently and collided across it.
      if (plan.structureCount > 0) {
        const waterSources = this.#waterSourcesFor(prepared, region, bible);
        const built = generateSettlement({
          prepared, region, rules: draft.globalRules,
          seed: deriveSeed(regionSeed, "settlement"),
          structureCount: plan.structureCount,
          waterSources,
          resourceSites: region.resources,
          // Seams and landmarks are already standing; the settlement is built
          // around them, not through them.
          obstacles: [
            ...region.resources, ...region.landmarks,
            ...placedWorldwide.filter((item) =>
              item.x >= region.bounds.minX - 12 && item.x <= region.bounds.maxX + 12),
          ],
          provider: this.provider,
          name: `${region.id}-settlement`,
        });
        if (built) {
          region.settlements = [built.settlement];
          placedWorldwide.push(...built.settlement.structures.map((structure) => ({
            x: structure.x, z: structure.z, radius: structure.radius, height: structure.height,
          })));
          for (const road of built.roads) {
            road.id = `${region.id}-${road.id}`;
            road.regionId = region.id;
            roads.push(road);
          }
          region.enemies = plan.wantsPatrols
            ? generatePatrols({
                prepared, settlement: built.settlement, roads: built.roads,
                rules: draft.globalRules, seed: deriveSeed(regionSeed, "patrol"),
                count: 2, dangerLevel: region.dangerLevel,
              })
            : [];
          this.#step("settlement", {
            regionId: region.id, structures: built.settlement.structures.length,
            requested: plan.structureCount, form: built.settlement.form,
            skipped: built.settlement.skippedRoles,
          });
        } else {
          region.settlements = [];
          this.#step("settlement", { regionId: region.id, structures: 0, refused: "no viable anchor site in this region" });
        }
      } else {
        region.settlements = [];
      }

      // Vegetation, excluding settlement courtyards and roads.
      const exclusions = [
        ...region.settlements.flatMap((settlement) => [
          { x: settlement.x, z: settlement.z, radius: settlement.courtyardRadius + 1.5 },
          ...settlement.structures.map((structure) => ({ x: structure.x, z: structure.z, radius: (structure.radius ?? 1.5) + 1.2 })),
        ]),
        ...roads.filter((road) => road.regionId === region.id)
          .flatMap((road) => road.points.map((point) => ({ x: point.x, z: point.z, radius: road.width * 0.7 }))),
        ...region.bossHooks.map((hook) => ({ x: hook.x, z: hook.z, radius: hook.arenaRadius + 3 })),
        // Seams and landmarks are already standing here.
        ...region.resources.map((item) => ({ x: item.x, z: item.z, radius: (item.radius ?? 1.2) + 1.5 })),
        ...region.landmarks.map((item) => ({ x: item.x, z: item.z, radius: (item.radius ?? 1.5) + 1.5 })),
      ];
      /* Scatter draws from `vegetation` AND `landmark`. Highlands ships exactly
         one vegetation mesh (the spiky plant) but also a tiered stone pillar
         classified as a landmark; asking only for `vegetation` made 59% of that
         region one repeated shrub. Natural ground cover is plants *and* rock. */
      region.vegetation = scatter({
        prepared, region, rules: draft.globalRules,
        seed: deriveSeed(regionSeed, "vegetation"),
        count: this.budget.scaleVegetation(plan.vegetationCount ?? 0),
        roles: ["vegetation", "landmark"],
        exclusions, minSpacing: 3.4,
        provider: this.provider, category: "vegetation",
      });

      region.creatures = plan.wantsWildlife
        ? this.#placeWildlife({ prepared, region, seed: deriveSeed(regionSeed, "wildlife") })
        : [];

      this.#step("populate", {
        regionId: region.id,
        vegetation: region.vegetation.length,
        resources: region.resources.length,
        landmarks: region.landmarks.length,
      });
    }

    // ── 8. SITE THE MISSION HOOKS AND BOSS ARENAS ───────────────────────
    // These come AFTER placement, deliberately: the hook must land on ground
    // that is still free once the settlement and its props are standing.
    this.#siteMissionHooks(draft, prepared);
    this.#siteBossArenas(draft, prepared);

    // ── 9. ARENA COVER AND ZONES ────────────────────────────────────────
    // Cover is placed AFTER the arena is sited, because it has to be placed
    // relative to the arena's centre and its arrival bearing.
    this.#dressArenas(draft, prepared);
    this.#declareZones(draft, prepared);

    // ── 10. TRAVERSAL ───────────────────────────────────────────────────
    draft.traversal.roads = roads;
    draft.traversal.bridges = this.#planBridges(prepared, roads);
    draft.traversal.corridors = this.#planCorridors(draft, prepared);

    let spec = createWorldSpec(draft);
    this.#step("assemble", { digest: spec.digest, objects: countObjects(spec) });

    // ── 10-11. CRITIQUE AND REFINE ──────────────────────────────────────
    let report = critique(spec);
    this.#step("critique", { pass: report.pass, overall: report.overall, scores: report.scores });

    const refinements = [];
    for (let round = 0; round < this.maxRefinements && !report.pass; round += 1) {
      const before = report.findings.filter((finding) => finding.severity === "error").length;
      const repaired = repair(spec, { seed: this.seed + round });
      const after = repaired.report.findings.filter((finding) => finding.severity === "error").length;
      refinements.push({
        round: round + 1, errorsBefore: before, errorsAfter: after,
        resolved: repaired.resolved, unresolved: repaired.unresolved,
        overall: repaired.report.overall,
      });
      this.#step("repair", { round: round + 1, resolved: repaired.resolved, unresolved: repaired.unresolved, overall: repaired.report.overall });
      // No progress means the remaining findings are not repairable; another
      // round would burn time to reach the same place.
      if (after >= before) { spec = repaired.spec; report = repaired.report; break; }
      spec = repaired.spec;
      report = repaired.report;
    }

    // ── 12. GATE ────────────────────────────────────────────────────────
    const campaign = validateCampaign(spec);
    const playable = campaign.failures.length === 0;
    const elapsed = nowMs() - started;

    this.#step("gate", { playable, campaignFailures: campaign.failures.length, elapsedMs: Math.round(elapsed) });

    return Object.freeze({
      spec,
      playable,
      report,
      campaign,
      plan: planned,
      refinements,
      trace: Object.freeze([...this.trace]),
      scoreCard: formatScoreCard(report),
      generation: Object.freeze({
        generatorVersion: GENERATOR_VERSION,
        seed: this.seed,
        tier: this.tier,
        elapsedMs: Math.round(elapsed),
        provider: this.provider.id,
        externalAIUsed: this.provider.id !== "null",
        digest: spec.digest,
      }),
      authority: WORLDCLAW_AUTHORITY,
    });
  }

  #fail(stage, errors, extra = {}) {
    return Object.freeze({
      spec: null, playable: false, stage, errors,
      trace: Object.freeze([...this.trace]),
      authority: WORLDCLAW_AUTHORITY,
      ...extra,
    });
  }

  /**
   * Water sources a settlement can anchor to.
   *
   * For biomes with surface water this is the river. For the desert — which
   * the live runtime explicitly gives no surface water at all — it is the
   * flattest low ground, which is where atmospheric collection actually works
   * and where the authored desert village's water-collector tower stands.
   */
  #waterSourcesFor(prepared, region, bible) {
    const sources = [];
    const { minX, maxX, minZ, maxZ } = region.bounds;
    if (bible.waterStrategy === "surface-stream" || bible.waterStrategy === "channel-control") {
      for (let i = 0; i <= 12; i += 1) {
        const z = minZ + ((maxZ - minZ) * i) / 12;
        for (let j = 0; j <= 12; j += 1) {
          const x = minX + ((maxX - minX) * j) / 12;
          if (isWaterAt(prepared, x, z)) { sources.push({ x, z, kind: "surface" }); break; }
        }
      }
    }
    if (!sources.length) {
      // Collection: the lowest buildable ground in the region, which is where
      // the ancient water table is nearest the surface.
      let best = null, bestHeight = Infinity;
      for (let i = 0; i <= 16; i += 1) {
        for (let j = 0; j <= 16; j += 1) {
          const x = minX + ((maxX - minX) * j) / 16;
          const z = minZ + ((maxZ - minZ) * i) / 16;
          const height = heightAt(prepared, x, z);
          if (height < bestHeight && buildable(prepared, x, z, { maxSlopeForBuild: 3.3, minBuildHeightAboveWater: 0.8, maxBuildHeight: 18 })) {
            bestHeight = height; best = { x, z, kind: bible.waterStrategy };
          }
        }
      }
      if (best) sources.push(best);
    }
    return sources;
  }

  /** Resource sites — ore, crystal seams and harvestable material. */
  #placeResources({ prepared, region, seed, spec, occupied = [] }) {
    const rng = createRng(deriveSeed(seed, "resources"));
    const bible = biomeBible(region.biome);
    const out = [];
    const target = Math.max(2, Math.round(region.dangerLevel * 1.2));
    const { minX, maxX, minZ, maxZ } = region.bounds;

    for (let i = 0; i < 40 && out.length < target; i += 1) {
      const x = minX + rng() * (maxX - minX);
      const z = minZ + rng() * (maxZ - minZ);
      const form = landformAt(prepared, x, z);
      /* Resources surface where erosion exposes them: slopes, highlands and
         riverbanks. A flat region (the Wetlands has almost no slope at all)
         has none of those, so after two-thirds of the attempts the filter
         relaxes to any dry ground — a delta with no resource sites at all
         would expose no `resource` zone and strand its harvest objectives. */
      const relaxed = i > 26;
      if (!relaxed && form !== "slope" && form !== "highland" && form !== "riverbank") continue;
      if (relaxed && (form === "water" || form === "cliff")) continue;
      if (out.some((entry) => Math.hypot(entry.x - x, entry.z - z) < 9)) continue;
      /* Seams must clear everything already standing ANYWHERE, not just in this
         region. Checking only `out` let a seam in one band land on top of a seam
         in the next one across the shared border. */
      if (occupied.some((item) => Math.hypot(item.x - x, item.z - z) < (item.radius ?? 1.5) + 3)) continue;
      /* Draw across the whole seam vocabulary rather than one role. A biome
         like Highlands has exactly one authored `extraction` mesh, so asking
         only for that role produced a region where 88% of everything was the
         same mine entrance — the single loudest "this was generated" tell. */
      const asset = resolve({
        biome: region.biome,
        role: ["extraction", "landmark", "energy", "vegetation"][Math.floor(rng() * 4)],
        neighbourBiomes: region.neighbourBiomes ?? [],
        allowPlaceholder: false,
      }, { provider: this.provider, rng })
        ?? resolve({ biome: region.biome, role: "extraction", allowPlaceholder: false }, { provider: this.provider, rng })
        ?? resolve({ biome: region.biome, role: "landmark", allowPlaceholder: false }, { provider: this.provider, rng });
      out.push({
        id: `${region.id}-resource-${out.length}`,
        kind: bible.geology.includes("crystal") ? "crystal" : "ore",
        assetId: asset?.id ?? null,
        assetPath: asset?.path ?? null,
        sourceTier: asset?.sourceTier ?? 1,
        x: Number(x.toFixed(4)), z: Number(z.toFixed(4)),
        y: Number(heightAt(prepared, x, z).toFixed(4)),
        rotation: Number((rng() * Math.PI * 2).toFixed(4)),
        radius: asset?.collisionRadius ?? 1.2,
        height: asset?.dimensions?.height ?? 2.5,
        lodLevels: asset?.lodLevels ?? 1,
        generationCost: asset?.generationCost ?? 2,
        instanced: Boolean(asset?.instanced),
        reason: `Resource seam exposed by ${form} erosion; ${bible.geology}`,
      });
    }
    return out;
  }

  /** Landmarks — the things visible from far enough away to navigate by. */
  #placeLandmarks({ prepared, region, plan, seed, spec, occupied = [] }) {
    if (!plan.wantsLandmark) return [];
    const rng = createRng(deriveSeed(seed, "landmarks"));
    const candidates = findAssets({ biome: region.biome, traversalRole: "landmark" });
    if (!candidates.length) return [];

    // A landmark belongs on the highest ground in the region: that is what
    // makes it readable from the approach and useful as a bearing.
    const { minX, maxX, minZ, maxZ } = region.bounds;
    let best = null, bestHeight = -Infinity;
    for (let i = 0; i <= 20; i += 1) {
      for (let j = 0; j <= 20; j += 1) {
        const x = minX + ((maxX - minX) * j) / 20;
        const z = minZ + ((maxZ - minZ) * i) / 20;
        const height = heightAt(prepared, x, z);
        if (height <= bestHeight) continue;
        if (slopeAt(prepared, x, z) >= 4.5 || isWaterAt(prepared, x, z)) continue;
        if (occupied.some((item) => Math.hypot(item.x - x, item.z - z) < (item.radius ?? 1.5) + 4)) continue;
        bestHeight = height; best = { x, z };
      }
    }
    if (!best) return [];
    const asset = candidates[Math.floor(rng() * candidates.length)];
    return [{
      id: `${region.id}-landmark`,
      assetId: asset.id, assetPath: asset.path, sourceTier: asset.sourceTier,
      x: Number(best.x.toFixed(4)), z: Number(best.z.toFixed(4)),
      y: Number(bestHeight.toFixed(4)),
      rotation: Number((rng() * Math.PI * 2).toFixed(4)),
      scale: 1.35,
      radius: asset.collisionRadius, height: asset.dimensions.height,
      lodLevels: asset.lodLevels,
      generationCost: asset.generationCost, instanced: Boolean(asset.instanced),
      reason: `Regional landmark on the highest stable ground in ${region.id}; visible from the approach and usable as a bearing.`,
    }];
  }

  /** Wildlife zones — ecology, not spawners. */
  #placeWildlife({ prepared, region, seed }) {
    const rng = createRng(seed);
    const out = [];
    const { minX, maxX, minZ, maxZ } = region.bounds;
    for (let i = 0; i < 3; i += 1) {
      const x = minX + (0.2 + rng() * 0.6) * (maxX - minX);
      const z = minZ + (0.2 + rng() * 0.6) * (maxZ - minZ);
      if (isWaterAt(prepared, x, z)) continue;
      out.push({
        id: `${region.id}-fauna-${i}`,
        x: Number(x.toFixed(3)), z: Number(z.toFixed(3)),
        radius: 14 + rng() * 8,
        density: Number((0.3 + rng() * 0.5).toFixed(2)),
        reason: `Native fauna range following the ${landformAt(prepared, x, z)} ground and its vegetation.`,
      });
    }
    return out;
  }

  /**
   * Site every provisional mission hook on real, buildable, utility-connected
   * ground, spread far enough apart to read as distinct locations.
   */
  #siteMissionHooks(draft, prepared) {
    for (const region of draft.regions) {
      if (!region.missionHooks?.length) continue;
      /* Largest cluster wins, but ties break toward the region centre. The raw
         `findBuildClusters` order is by size alone, which put an equally-sized
         cluster hard against a band edge and left two biomes' objectives ten
         metres apart across the border. */
      const clusters = findBuildClusters(draft, region);
      const cluster = [...clusters].sort((a, b) =>
        b.size - a.size
        || Math.hypot(a.x - region.center.x, a.z - region.center.z)
         - Math.hypot(b.x - region.center.x, b.z - region.center.z))[0];
      if (!cluster) {
        this.#step("missionHooks", { regionId: region.id, sited: 0, refused: "no utility-connected buildable cluster" });
        continue;
      }
      /* Farthest-point selection, with a relaxing separation floor.
         The cluster lattice is fine-grained (about a metre apart in x), so a
         naive stride walk placed two campaign projects 2 m apart — a pair of
         buildings that cannot both physically stand. Greedy farthest-point
         spreads the twelve projects across the cluster; the floor then relaxes
         from comfortable to merely-legal so a tight cluster still sites every
         hook rather than abandoning the last few. */
      /* Hooks are kept off the region border. Two colonies' objectives landing
         nine metres apart either side of a band boundary is a real "which one
         am I looking at" failure, and the cheapest cure is to not put them
         there. The inset relaxes if it would empty the pool. */
      // Proportional, so a narrow band is not inset into a degenerate strip.
      const inset = Math.min(10, (region.bounds.maxX - region.bounds.minX) * 0.18);
      const inBounds = (site, margin) =>
        site.x - region.bounds.minX >= margin && region.bounds.maxX - site.x >= margin
        && site.z - region.bounds.minZ >= margin && region.bounds.maxZ - site.z >= margin;

      const ordered = [...cluster.sites].sort((a, b) => a.slope - b.slope || a.x - b.x || a.z - b.z);
      const unobstructed = ordered.filter((site) => !blockedByPlacement(region, site.x, site.z, 2.5));
      const base = unobstructed.length >= region.missionHooks.length ? unobstructed : ordered;
      const inner = base.filter((site) => inBounds(site, inset));
      const pool = inner.length >= region.missionHooks.length ? inner : base;

      const used = [];
      let sited = 0;
      for (const hook of region.missionHooks) {
        let chosen = null;
        // 14 m reads as distinct locations; 6 m is the minimum two footprints
        // need. Anything below that would be a build the player cannot make.
        for (const floor of [14, 12, 10, 8, 6.5]) {
          let best = null, bestDistance = -1;
          for (const site of pool) {
            const distance = used.length
              ? Math.min(...used.map((entry) => Math.hypot(entry.x - site.x, entry.z - site.z)))
              : Infinity;
            if (distance < floor) continue;
            if (distance > bestDistance) { bestDistance = distance; best = site; }
          }
          if (best) { chosen = best; break; }
        }
        if (!chosen) {
          /* Never leave a hook provisional. A refused hook keeps the planner's
             placeholder at the region centre, which is unvalidated ground — and
             that turned a spacing preference into a `mission.hookUnbuildable`
             campaign FAILURE. Take the most separated legal site available and
             let the critic report the crowding as the warning it is; a cluster
             that genuinely cannot hold twelve projects is already caught by
             `mission.buildCapacity`. */
          let fallback = pool[0], best = -1;
          for (const site of pool) {
            const distance = used.length
              ? Math.min(...used.map((entry) => Math.hypot(entry.x - site.x, entry.z - site.z)))
              : Infinity;
            if (distance > best) { best = distance; fallback = site; }
          }
          chosen = fallback;
        }
        hook.x = Number(chosen.x.toFixed(4));
        hook.z = Number(chosen.z.toFixed(4));
        hook.y = Number(chosen.y.toFixed(4));
        hook.provisional = false;
        hook.clusterSize = cluster.size;
        used.push(chosen);
        sited += 1;
      }
      this.#step("missionHooks", { regionId: region.id, sited, of: region.missionHooks.length, clusterSize: cluster.size });
    }
  }

  /**
   * Site boss arenas on ground that satisfies every Phase 11 property, then
   * verify with the same validator that will grade them later.
   */
  #siteBossArenas(draft, prepared) {
    for (const region of draft.regions) {
      for (const hook of [...(region.bossHooks ?? [])]) {
        const site = this.#findArenaSite(draft, region, prepared, hook);
        if (!site) {
          /* A refused arena kept the planner's provisional position — the
             region centre, which nothing has checked — and that unvalidated
             point then failed the arena validator as a hard campaign error.
             Refusal has to be reported as refusal, and the hook removed, so the
             live runtime's own encounter placement handles that Guardian
             instead of the world claiming an arena it does not have. */
          hook.unsited = true;
          this.#step("bossArena", { bossId: hook.bossId, sited: false, refused: "no site satisfies arena navigability and arrival" });
          continue;
        }
        hook.x = Number(site.x.toFixed(4));
        hook.z = Number(site.z.toFixed(4));
        hook.y = Number(heightAt(prepared, site.x, site.z).toFixed(4));
        hook.provisional = false;
        hook.arrivalBearing = site.bearing;
        hook.cinematicCamera = {
          // A camera set back along the arrival bearing and raised: the boss is
          // framed against the arena the player is about to enter.
          x: Number((site.x - Math.cos(site.bearing) * (hook.arenaRadius + 8)).toFixed(3)),
          z: Number((site.z - Math.sin(site.bearing) * (hook.arenaRadius + 8)).toFixed(3)),
          height: 6.5,
          reason: "Set back along the arrival bearing so the Guardian is framed against its own arena on approach.",
        };
        const verdict = validateBossArena(draft, region, hook, prepared);
        this.#step("bossArena", {
          bossId: hook.bossId, sited: true,
          failures: verdict.failures.length, warnings: verdict.warnings.length,
        });
      }
      region.bossHooks = (region.bossHooks ?? []).filter((hook) => !hook.unsited);
    }
  }

  /**
   * Give each boss arena its cover topology.
   *
   * The arena siting search deliberately prefers flat, navigable ground — which
   * is correct for a Guardian that has to charge across it, and which leaves a
   * featureless plate a ranged phase cannot be fought on. Terrain alone cannot
   * satisfy both; cover has to be *placed*.
   *
   * Placement follows the encounter, not decoration: a ring of blocking props
   * at 55-80% of the arena radius, off the arrival bearing so the entrance
   * stays open, with a gap left opposite the entrance as the recovery space the
   * player retreats to during a phase transition.
   */
  #dressArenas(draft, prepared) {
    /* Arenas are sited by biome but are free to spill across a band boundary,
       so cover has to be checked against the WHOLE world's placements. Checking
       only the arena's own region let a desert arena drop a boulder on top of a
       highlands ore seam. */
    const worldPlacements = draft.regions.flatMap((region) => [
      ...(region.landmarks ?? []), ...(region.resources ?? []), ...(region.vegetation ?? []),
      ...(region.settlements ?? []).flatMap((settlement) => settlement.structures ?? []),
    ]);
    for (const region of draft.regions) {
      for (const hook of region.bossHooks ?? []) {
        if (hook.provisional) continue;
        const rng = createRng(deriveSeed(this.seed, `cover:${hook.bossId}`));
        /* Cover meshes for this biome, widening to its declared neighbours when
           it has none of its own. The Arctic ships three village structures and
           one 0.5 m shrub — nothing that reads as cover — so an arena there
           would otherwise be a featureless plate that a ranged phase cannot be
           fought on. Borrowing a neighbour's rock is the Bible's own tier-3
           parametric path, not a new rule. */
        const coverRoles = ["vegetation", "extraction", "marker", "landmark"];
        let candidates = coverFor(region.biome, coverRoles);
        if (candidates.length < 2) {
          for (const neighbour of region.neighbourBiomes ?? []) {
            candidates = candidates.concat(coverFor(neighbour, coverRoles));
          }
        }
        if (!candidates.length) {
          this.#step("arenaCover", { bossId: hook.bossId, cover: 0, refused: "no blocking mesh available for this biome or its neighbours" });
          continue;
        }

        const entrance = hook.arrivalBearing ?? 0;
        const placed = [];
        const wanted = Math.max(4, Math.round(hook.arenaRadius / 3.2));

        // More attempts than slots: a dense region (the Forest carries 150+
        // objects) rejects most candidate spots, and too few attempts left the
        // arena there with almost no cover at all.
        for (let i = 0; i < wanted * 12 && placed.length < wanted; i += 1) {
          const angle = (i / wanted) * Math.PI * 2 + rng() * 0.6;
          // Keep the entrance corridor and the recovery pocket opposite it clear.
          const offEntrance = Math.abs(normaliseAngle(angle - entrance));
          const offRecovery = Math.abs(normaliseAngle(angle - entrance - Math.PI));
          if (offEntrance < 0.5 || offRecovery < 0.45) continue;

          const radius = hook.arenaRadius * (0.55 + rng() * 0.25);
          const x = hook.x + Math.cos(angle) * radius;
          const z = hook.z + Math.sin(angle) * radius;
          if (isWaterAt(prepared, x, z) || slopeAt(prepared, x, z) > 4.5) continue;
          if (placed.some((entry) => Math.hypot(entry.x - x, entry.z - z) < 5)) continue;
          const candidate = candidates[Math.floor(rng() * candidates.length)];
          const asset0Radius = candidate.collisionRadius;
          // Cover stands among the scenery, so it needs only enough clearance
          // not to intersect — not the wide berth a building would want.
          if (worldPlacements.some((item) => Math.hypot(item.x - x, item.z - z) < (item.radius ?? 1.5) + (asset0Radius) + 0.4)) continue;

          const asset = candidate;
          placed.push({
            id: `${hook.bossId}-cover-${placed.length}`,
            assetId: asset.id, assetPath: asset.path, sourceTier: asset.sourceTier,
            x: Number(x.toFixed(4)), z: Number(z.toFixed(4)),
            y: Number(heightAt(prepared, x, z).toFixed(4)),
            rotation: Number((rng() * Math.PI * 2).toFixed(4)),
            scale: Number((0.9 + rng() * 0.35).toFixed(3)),
            radius: asset.collisionRadius, height: asset.dimensions.height,
            lodLevels: asset.lodLevels,
            generationCost: asset.generationCost, instanced: Boolean(asset.instanced),
            reason: `Arena cover for ${hook.bossId}: breaks line of sight during ranged phases while leaving the arrival corridor and the recovery pocket clear.`,
          });
        }
        region.landmarks.push(...placed);
        worldPlacements.push(...placed);
        hook.coverCount = placed.length;
        this.#step("arenaCover", { bossId: hook.bossId, cover: placed.length, wanted });
      }
    }
  }

  /**
   * Declare the gameplay zones every generated region must expose.
   *
   * These are the contract surface between WorldClaw and the rest of ZekNova:
   * mission placement, spawn selection, patrol routing and fast travel all read
   * zones rather than re-deriving geometry, so a region that declares them is a
   * region any of those systems can use without knowing how it was built.
   */
  #declareZones(draft, prepared) {
    for (const region of draft.regions) {
      const zones = [];
      const settlement = region.settlements?.[0] ?? null;
      const clusters = findBuildClusters(draft, region);
      const cluster = clusters[0] ?? null;

      if (settlement) {
        zones.push({
          kind: "missionSafe", id: `${region.id}-safe`,
          x: settlement.x, z: settlement.z, radius: settlement.courtyardRadius + 4,
          reason: "The settlement courtyard: no patrol routes through it and no hostile spawns inside it.",
        });
        /* Spawn on the settlement edge, on the bearing that is furthest from
           EVERY patrol waypoint. Using only the first waypoint of the first
           patrol put the spawn inside the second patrol's route — arriving
           straight into contact, which is the spawn-camping failure the critic
           exists to catch. */
        const waypoints = (region.enemies ?? []).flatMap((patrol) => patrol.waypoints ?? []);
        let spawnBearing = 0, spawnClearance = -1;
        for (let s = 0; s < 24; s += 1) {
          const angle = (s / 24) * Math.PI * 2;
          const px = settlement.x + Math.cos(angle) * (settlement.courtyardRadius + 8);
          const pz = settlement.z + Math.sin(angle) * (settlement.courtyardRadius + 8);
          if (isWaterAt(prepared, px, pz) || slopeAt(prepared, px, pz) > 4) continue;
          const clearance = waypoints.length
            ? Math.min(...waypoints.map((point) => Math.hypot(point.x - px, point.z - pz)))
            : Infinity;
          if (clearance > spawnClearance) { spawnClearance = clearance; spawnBearing = angle; }
        }
        const spawnX = settlement.x + Math.cos(spawnBearing) * (settlement.courtyardRadius + 8);
        const spawnZ = settlement.z + Math.sin(spawnBearing) * (settlement.courtyardRadius + 8);
        zones.push({
          kind: "spawn", id: `${region.id}-spawn`,
          x: Number(spawnX.toFixed(3)), z: Number(spawnZ.toFixed(3)), radius: 6,
          patrolClearance: Number.isFinite(spawnClearance) ? Number(spawnClearance.toFixed(2)) : null,
          reason: "Player spawn on the settlement edge, on the bearing furthest from every patrol route so arrival is never into contact.",
        });
      }

      if (cluster) {
        zones.push({
          kind: "objectivePlacement", id: `${region.id}-objectives`,
          x: cluster.x, z: cluster.z, radius: cluster.radius,
          capacity: cluster.size,
          reason: `Utility-connected build cluster holding ${cluster.size} legal sites — every campaign project in this AO stands inside it and can reach power, water and data.`,
        });
        zones.push({
          kind: "buildable", id: `${region.id}-buildable`,
          x: cluster.x, z: cluster.z, radius: cluster.radius, capacity: cluster.size,
          reason: "Player-buildable ground: slope, water clearance and height all inside the live game's own build rules.",
        });
      }

      for (const hook of region.bossHooks ?? []) {
        zones.push({
          kind: "bossArena", id: `${region.id}-arena-${hook.bossId}`,
          x: hook.x, z: hook.z, radius: hook.arenaRadius, bossId: hook.bossId,
          reason: hook.reason,
        });
      }

      for (const patrol of region.enemies ?? []) {
        const first = patrol.waypoints?.[0];
        if (!first) continue;
        zones.push({
          kind: "patrolRoute", id: `${region.id}-patrol-${patrol.id}`,
          x: first.x, z: first.z, radius: 8, patrolId: patrol.id,
          reason: patrol.reason,
        });
      }

      const fastTravel = draft.traversal.fastTravelNodes.find((node) => node.regionId === region.id);
      if (fastTravel) {
        zones.push({
          kind: "fastTravel", id: fastTravel.id,
          x: fastTravel.x, z: fastTravel.z, radius: 4,
          reason: fastTravel.reason,
        });
      }

      for (const resource of region.resources ?? []) {
        zones.push({
          kind: "resource", id: `${region.id}-res-${resource.id}`,
          x: resource.x, z: resource.z, radius: 7, resourceKind: resource.kind,
          reason: resource.reason,
        });
      }

      region.zones = zones;
      this.#step("zones", { regionId: region.id, zones: zones.length, kinds: [...new Set(zones.map((zone) => zone.kind))] });
    }
  }

  /** Ring search for arena ground: open, navigable, and reachable. */
  #findArenaSite(draft, region, prepared, hook) {
    const rng = createRng(deriveSeed(this.seed, `arena:${hook.bossId}`));
    const { minX, maxX, minZ, maxZ } = region.bounds;
    const half = prepared.half;

    /* The floor relaxes from comfortable to the validator's own minimum.
       ZekNova's bands are ~26 units wide once transition regions are inserted,
       and a 4x Guardian's arena is 23 m in RADIUS — wider than the band. A
       single strict pass therefore found nothing in the narrower regions.

       An arena is allowed to spill across a band boundary: `zkAOAt` decides
       which AO the player is in from their own position, so what matters is
       that the arena's CENTRE is in the right biome, which the region loop
       already guarantees. What is not allowed is spilling out of the playable
       world, where the radial rim climbs into unreachable terrain. */
    for (const floor of [0.85, 0.78, 0.73]) {
      let best = null, bestScore = -Infinity;
      for (let i = 0; i <= 16; i += 1) {
        for (let j = 0; j <= 16; j += 1) {
          const x = minX + ((maxX - minX) * j) / 16;
          const z = minZ + ((maxZ - minZ) * i) / 16;
          /* The arena CENTRE must be comfortably inside the playable world.
             Requiring the whole disc to fit was a proxy that ruled out every
             site in an edge band, and an unnecessary one: terrain continues
             past the playable half-extent, and whether the outer rim of the
             arena is actually usable is measured directly by the navigability
             sampling below. */
          if (Math.abs(x) > half - hook.arenaRadius * 0.45) continue;
          if (Math.abs(z) > half - hook.arenaRadius * 0.45) continue;
          /* Never on top of the settlement it is meant to threaten — but an
             arena that merely borders one is exactly the staging the encounter
             wants, so props inside the arena footprint are cover, not a veto. */
          if (blockedByPlacement(region, x, z, hook.arenaRadius * 0.55, 3)) continue;

          let walkable = 0, total = 0, cover = 0;
          for (let r = 1; r <= 5; r += 1) {
            for (let s = 0; s < 12; s += 1) {
              const angle = (s / 12) * Math.PI * 2;
              const radius = (hook.arenaRadius * r) / 5;
              const px = x + Math.cos(angle) * radius;
              const pz = z + Math.sin(angle) * radius;
              total += 1;
              const slope = slopeAt(prepared, px, pz);
              if (!isWaterAt(prepared, px, pz) && slope < 4.2) walkable += 1;
              if (slope >= 2.4 && slope < 5.5) cover += 1;
            }
          }
          const walkableFraction = walkable / total;
          if (walkableFraction < floor) continue;

          const bearing = arrivalBearing(prepared, x, z, hook.arenaRadius);
          if (bearing === null) continue;

          // Prefer a floor that is mostly open with SOME broken ground: enough
          // cover to break line of sight, not enough to lose the player in.
          const coverFraction = cover / total;
          const score = walkableFraction * 100 - Math.abs(coverFraction - 0.2) * 90 + rng() * 0.01;
          if (score > bestScore) { bestScore = score; best = { x, z, bearing }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** A bridge wherever a road stops at water it could plausibly cross. */
  #planBridges(prepared, roads) {
    const bridges = [];
    for (const road of roads) {
      const last = road.points.at(-1);
      if (!last) continue;
      // Probe forward along the road's final heading for a crossable span.
      const previous = road.points.at(-2) ?? last;
      const dx = last.x - previous.x, dz = last.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const ux = dx / length, uz = dz / length;
      let span = 0;
      for (let d = 1; d <= 22; d += 1) {
        if (!isWaterAt(prepared, last.x + ux * d, last.z + uz * d)) { span = d; break; }
      }
      if (span >= 4 && span <= 22 && isWaterAt(prepared, last.x + ux * 2, last.z + uz * 2)) {
        bridges.push({
          id: `${road.id}-bridge`,
          x: Number((last.x + ux * span / 2).toFixed(3)),
          z: Number((last.z + uz * span / 2).toFixed(3)),
          rotation: Number(Math.atan2(uz, ux).toFixed(4)),
          span: Number(span.toFixed(2)),
          reason: `Crossing where road "${road.id}" meets ${span.toFixed(1)} m of water; without it the road ends at a shoreline.`,
        });
      }
    }
    return bridges;
  }

  /**
   * Vehicle traversal corridors: continuous low-slope lanes wide enough to
   * fight in. Found by sweeping the region for bands where the slope stays
   * under the vehicle limit for a sustained run.
   */
  #planCorridors(draft, prepared) {
    const corridors = [];
    for (const region of draft.regions) {
      if (!region.plan?.vehicleCorridor) continue;
      const { minX, maxX, minZ, maxZ } = region.bounds;
      let bestRun = null;
      for (let i = 0; i <= 18; i += 1) {
        const x = minX + ((maxX - minX) * i) / 18;
        let runStart = null, run = null;
        for (let z = minZ; z <= maxZ; z += 4) {
          const passable = slopeAt(prepared, x, z) < 2.6 && !isWaterAt(prepared, x, z);
          if (passable) {
            if (runStart === null) runStart = z;
            run = z;
          } else if (runStart !== null) {
            if (!bestRun || run - runStart > bestRun.length) bestRun = { x, minZ: runStart, maxZ: run, length: run - runStart };
            runStart = null;
          }
        }
        if (runStart !== null && (!bestRun || run - runStart > bestRun.length)) {
          bestRun = { x, minZ: runStart, maxZ: run, length: run - runStart };
        }
      }
      if (bestRun && bestRun.length >= 40) {
        corridors.push({
          id: `${region.id}-corridor`,
          regionId: region.id,
          x: Number(bestRun.x.toFixed(3)),
          minZ: Number(bestRun.minZ.toFixed(3)),
          maxZ: Number(bestRun.maxZ.toFixed(3)),
          width: 22,
          reason: `Continuous low-slope lane ${bestRun.length.toFixed(0)} m long: open enough for vehicle traversal and for a fight the camera can read.`,
        });
      }
    }
    return corridors;
  }
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function neighboursOf(spec, regionId) {
  const out = new Set();
  for (const rel of spec.relationships ?? []) {
    if (rel.from === regionId) out.add(spec.regions.find((region) => region.id === rel.to)?.biome);
    if (rel.to === regionId) out.add(spec.regions.find((region) => region.id === rel.from)?.biome);
  }
  out.delete(undefined);
  return [...out];
}

/**
 * True when anything already placed in the region occupies this spot.
 *
 * `clearance` applies to the settlement CORE — the courtyard nobody may build
 * over. Individual objects use `objectClearance`, which defaults to a small
 * fixed margin.
 *
 * Applying the full clearance to every structure was what starved boss arena
 * siting: once settlements grew to forty structures spread over an elliptical
 * footprint, demanding an 18 m berth from each of forty buildings excluded most
 * of the region and eight of the twelve Guardians lost their arenas. An arena
 * beside a village is good staging; an arena ON a village is the problem, and
 * only the second needs a wide margin.
 */
function blockedByPlacement(region, x, z, clearance, objectClearance = 2.5) {
  const cores = (region.settlements ?? []).map((settlement) => ({
    x: settlement.x, z: settlement.z, radius: settlement.courtyardRadius + 6,
  }));
  if (cores.some((core) => Math.hypot(core.x - x, core.z - z) < core.radius + clearance)) return true;

  const objects = [
    ...(region.settlements ?? []).flatMap((settlement) => settlement.structures ?? []),
    ...(region.landmarks ?? []),
    ...(region.resources ?? []),
  ];
  return objects.some((item) => Math.hypot(item.x - x, item.z - z) < (item.radius ?? 1.5) + objectClearance);
}

/** Blocking meshes from one biome that are big enough to break line of sight. */
function coverFor(biome, roles) {
  return findAssets({ biome, traversalRole: "blocking", roles })
    .filter((asset) => asset.collisionRadius >= 0.8);
}

/** Wrap an angle to (-PI, PI] so bearing differences compare correctly. */
function normaliseAngle(angle) {
  let value = angle % (Math.PI * 2);
  if (value > Math.PI) value -= Math.PI * 2;
  if (value <= -Math.PI) value += Math.PI * 2;
  return value;
}

/** First bearing on which a walker can leave the arena, or null. */
function arrivalBearing(prepared, x, z, arenaRadius) {
  for (let s = 0; s < 16; s += 1) {
    const angle = (s / 16) * Math.PI * 2;
    let clear = true;
    for (let d = arenaRadius; d <= arenaRadius + 30; d += 3) {
      const px = x + Math.cos(angle) * d;
      const pz = z + Math.sin(angle) * d;
      if (isWaterAt(prepared, px, pz) || slopeAt(prepared, px, pz) > 5.5) { clear = false; break; }
    }
    if (clear) return Number(angle.toFixed(4));
  }
  return null;
}

function countObjects(spec) {
  return spec.regions.reduce((sum, region) =>
    sum + region.vegetation.length + region.landmarks.length + region.resources.length
    + region.settlements.reduce((n, settlement) => n + settlement.structures.length, 0), 0);
}

/** Monotonic-ish timer that works in node, the browser, and a worker. */
function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}
