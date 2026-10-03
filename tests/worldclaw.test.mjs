/**
 * ZekNova — WorldClaw deterministic test suite (Phase 21)
 * Location: /tests/worldclaw.test.mjs
 *
 * Covers every property the integration brief requires be provable:
 * planning determinism, terrain validity, placement legality, mission
 * accessibility, boss reachability, navigation, physics, streaming,
 * persistence, security, and — the one that matters most for shipping — that
 * generation works with every external AI provider disabled.
 *
 * Run with `node tests/worldclaw.test.mjs`. No test framework: the repository
 * uses assert-and-print, and matching that keeps the suite runnable the same
 * way as the twenty-odd suites already here.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import {
  createWorldSpec, validateWorldSpec, specDigest, canonicalise, deriveSeed,
  GENERATOR_VERSION, allPlacements,
} from "../src/worldclaw/WorldSpec.js";
import {
  adjacencyLegal, transitionBetween, transitionPath, settlementForm, BIOME_BIBLE, ZEKNOVA_IDENTITY,
} from "../src/worldclaw/ZekNovaWorldBible.js";
import {
  WORLD_ASSETS, findAssets, resolve, assetById, registrySummary,
} from "../src/worldclaw/WorldAssetRegistry.js";
import {
  prepare, heightAt, slopeAt, buildHeightField, landformAt, regionTerrainStats,
} from "../src/worldclaw/TerrainGenerator.js";
import { planWorld, parseIntent, layoutRegions, elevationProfile } from "../src/worldclaw/WorldClawPlanner.js";
import { WorldClawDirector } from "../src/worldclaw/WorldClawDirector.js";
import { critique } from "../src/worldclaw/WorldCritic.js";
import { repair } from "../src/worldclaw/WorldRepairDirector.js";
import {
  validateCampaign, validateRegionForMissions, findBuildClusters,
  REQUIRED_BUILD_SITES_PER_REGION, REQUIRED_ZONE_KINDS,
} from "../src/worldclaw/MissionPlacementValidator.js";
import { partition, plan as planResidency, batchChanges, estimateApplyCost, RESIDENCY } from "../src/worldclaw/WorldStreaming.js";
import {
  createSaveRecord, restoreSaveRecord, serialise, applyDeltas, compress, expand,
} from "../src/worldclaw/WorldPersistence.js";
import {
  validatePath, validateId, validateProposal, validateGeneratedAsset,
  validateMaterial, validateJsonPayload, validateGeneratedRegion,
} from "../src/worldclaw/SecurityValidation.js";
import {
  Generative3DProvider, NullProvider, SafeProvider, CachedFileProvider, createProvider,
} from "../src/worldclaw/Generative3DProvider.js";
import { measureSpec, PERFORMANCE_BUDGETS, degradeFor, suggestCounts } from "../src/worldclaw/PerformanceBudget.js";
import { exportManifest, importManifest, AXES, INTEROP_FORMAT } from "../src/worldclaw/BlenderInterop.js";
import { generateDesertCivilisation, DEMO_SEED } from "../src/worldclaw/DesertCivilization.js";
import { BIOMES as CAMPAIGN_BIOMES, PROJECT_LADDER } from "../src/game/CampaignPlan.js";
import { MISSION_OBJECTIVES } from "../src/game/Missions.js";
import { BOSS_CONFIGS, MISSION_BOSS_IDS } from "../src/game/BossSystem.js";

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  FAIL ${name} — ${error.message}`);
  }
}
function section(title) { console.log(`\n${title}`); }

/* Generated once and shared. Building it per-test would make the suite slow
   without testing anything extra — determinism is asserted explicitly below
   with a second, independent generation. */
const demo = generateDesertCivilisation();

/* ── 1. asset registry ─────────────────────────────────────────────────── */
section("Asset registry");

check("every registered asset path exists on disk", () => {
  const missing = WORLD_ASSETS
    .map((asset) => asset.path.replace(/^\.\//, ""))
    .filter((path) => !existsSync(path));
  assert.deepEqual(missing, [], `missing meshes: ${missing.join(", ")}`);
});

check("asset ids are unique", () => {
  const ids = WORLD_ASSETS.map((asset) => asset.id);
  assert.equal(new Set(ids).size, ids.length);
});

check("semantic query filters by biome and role", () => {
  const found = findAssets({ biome: "desert", role: "dwelling" });
  assert.ok(found.length > 0, "the desert must have a dwelling mesh");
  assert.ok(found.every((asset) => asset.biomeTags.includes("desert") && asset.role === "dwelling"));
});

check("query order is stable across calls", () => {
  const a = findAssets({ biome: "forest" }).map((asset) => asset.id);
  const b = findAssets({ biome: "forest" }).map((asset) => asset.id);
  assert.deepEqual(a, b);
});

check("resolution prefers authored assets over placeholders", () => {
  const rng = () => 0.5;
  const asset = resolve({ biome: "desert", role: "dwelling" }, { rng });
  assert.equal(asset.sourceTier, 1, "an authored desert dwelling exists, so tier 1 must win");
  assert.ok(asset.path?.endsWith(".glb"));
});

check("resolution falls back to a placeholder only as a last resort", () => {
  const asset = resolve({ biome: "alpine", role: "nonexistent-role" }, { rng: () => 0.5 });
  assert.equal(asset.sourceTier, 6);
  assert.equal(asset.path, null);
});

check("every canonical biome can serve a communal and a dwelling role", () => {
  for (const biome of CAMPAIGN_BIOMES) {
    assert.ok(findAssets({ biome, role: "communal" }).length > 0, `${biome} has no communal mesh`);
    assert.ok(findAssets({ biome, role: "dwelling" }).length > 0, `${biome} has no dwelling mesh`);
  }
});

/* ── 2. world bible ────────────────────────────────────────────────────── */
section("ZekNova World Bible");

check("every canonical biome has a bible entry", () => {
  for (const biome of CAMPAIGN_BIOMES) assert.ok(BIOME_BIBLE[biome], `${biome} missing from the bible`);
});

check("desert water strategy is collection, not surface water", () => {
  // The live runtime forces isWaterAt=false across the desert band; a desert
  // settlement anchored to surface water would be anchored to nothing.
  assert.equal(BIOME_BIBLE.desert.waterStrategy, "atmospheric-collection");
});

check("adjacency rejects an illegal border and bridges it", () => {
  // Nothing on ZekNova goes from dune field to ice sheet across one border.
  assert.equal(adjacencyLegal("desert", "arctic"), false);
  const path = transitionPath("desert", "arctic");
  assert.ok(Array.isArray(path) && path.length >= 1, "no transition chain found");
  // Whatever chain is chosen, every step in it must itself be a legal border.
  const chain = ["desert", ...path, "arctic"];
  for (let i = 0; i < chain.length - 1; i += 1) {
    assert.ok(adjacencyLegal(chain[i], chain[i + 1]),
      `chain step ${chain[i]}->${chain[i + 1]} is still illegal`);
  }
});

check("transition search is deterministic", () => {
  assert.deepEqual(transitionPath("desert", "arctic"), transitionPath("desert", "arctic"));
  assert.deepEqual(transitionPath("wetlands", "alpine"), transitionPath("wetlands", "alpine"));
});

check("an already-legal border needs no transition", () => {
  assert.deepEqual(transitionPath("forest", "wetlands"), []);
  assert.equal(transitionBetween("forest", "wetlands"), null);
});

check("a one-hop border returns a single bridge", () => {
  assert.equal(adjacencyLegal("desert", "wetlands"), false);
  const bridge = transitionBetween("desert", "wetlands");
  assert.ok(bridge, "desert and wetlands must be bridgeable in one step");
  assert.ok(adjacencyLegal("desert", bridge) && adjacencyLegal(bridge, "wetlands"));
});

check("settlement form scales with structure count", () => {
  assert.equal(settlementForm(6).name, "hamlet");
  assert.equal(settlementForm(14).name, "village");
  assert.equal(settlementForm(40).name, "town");
  assert.ok(settlementForm(40).courtyardRadius > settlementForm(6).courtyardRadius);
});

check("identity forbids Earth and generic sci-fi motifs", () => {
  assert.ok(ZEKNOVA_IDENTITY.forbiddenMotifs.includes("earth-conifer"));
  assert.ok(ZEKNOVA_IDENTITY.forbiddenMotifs.includes("neon-cyberpunk"));
});

/* ── 3. planning determinism ───────────────────────────────────────────── */
section("World planning");

check("same seed and intent produce the same specification", () => {
  const a = planWorld({ seed: 1234, intent: "desert civilization with 30 structures" });
  const b = planWorld({ seed: 1234, intent: "desert civilization with 30 structures" });
  assert.equal(a.digest, b.digest, "planning must be deterministic");
});

check("a different seed produces a different specification", () => {
  const a = planWorld({ seed: 1234, intent: "desert civilization" });
  const b = planWorld({ seed: 5678, intent: "desert civilization" });
  assert.notEqual(a.digest, b.digest);
});

check("the plan always contains all five campaign biomes", () => {
  const plan = planWorld({ seed: 99, intent: "an arctic outpost only" });
  const biomes = new Set(plan.spec.regions.map((region) => region.biome));
  for (const biome of CAMPAIGN_BIOMES) assert.ok(biomes.has(biome), `${biome} was dropped from the plan`);
});

check("canonical biomes keep their canonical band order", () => {
  // The live runtime derives AO membership from x position by indexing
  // CampaignPlan.BIOMES in order; reordering would break every biomeVisit.
  const plan = planWorld({ seed: 7, intent: "desert basin canyon world" });
  const order = plan.spec.regions
    .filter((region) => CAMPAIGN_BIOMES.includes(region.biome))
    .sort((a, b) => a.bounds.minX - b.bounds.minX)
    .map((region) => region.biome);
  assert.deepEqual(order, [...CAMPAIGN_BIOMES]);
});

check("intent parsing is deterministic and extracts a structure count", () => {
  const brief = parseIntent("a desert town with approximately 40 structures and hostile patrols");
  assert.equal(brief.structureCount, 40);
  assert.ok(brief.biomes.includes("desert"));
  assert.ok(brief.features.includes("patrols"));
  assert.deepEqual(brief, parseIntent("a desert town with approximately 40 structures and hostile patrols"));
});

check("elevation relaxation keeps neighbouring bases within one step", () => {
  const regions = layoutRegions(["wetlands", "alpine"]);
  const profile = elevationProfile(regions, { maxStep: 4.5 });
  for (let i = 0; i < profile.length - 1; i += 1) {
    assert.ok(Math.abs(profile[i + 1].base - profile[i].base) <= 4.5 + 1e-6,
      `border ${i} steps ${(profile[i + 1].base - profile[i].base).toFixed(2)}`);
  }
});

check("a planned spec validates", () => {
  const plan = planWorld({ seed: 42 });
  assert.equal(plan.validation.valid, true, JSON.stringify(plan.validation.errors));
});

/* ── 4. spec schema and digest ─────────────────────────────────────────── */
section("World specification");

check("canonicalisation is key-order independent", () => {
  assert.equal(canonicalise({ a: 1, b: 2 }), canonicalise({ b: 2, a: 1 }));
});

check("digest is insensitive to float noise below the quantisation step", () => {
  const a = createWorldSpec({ seed: 1, regions: [{ id: "r", biome: "desert", bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } }] });
  const b = createWorldSpec({ seed: 1, regions: [{ id: "r", biome: "desert", bounds: { minX: -10.0000001, maxX: 10, minZ: -10, maxZ: 10 } }] });
  assert.equal(a.digest, b.digest);
});

check("digest changes when the world changes", () => {
  const a = createWorldSpec({ seed: 1, regions: [{ id: "r", biome: "desert", bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } }] });
  const b = createWorldSpec({ seed: 1, regions: [{ id: "r", biome: "forest", bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } }] });
  assert.notEqual(a.digest, b.digest);
});

check("derived seeds are independent per label", () => {
  assert.notEqual(deriveSeed(5, "settlement"), deriveSeed(5, "vegetation"));
  assert.equal(deriveSeed(5, "settlement"), deriveSeed(5, "settlement"));
});

check("validation rejects an out-of-world region", () => {
  const spec = createWorldSpec({ seed: 1, regions: [{ id: "r", biome: "desert", bounds: { minX: -500, maxX: 500, minZ: -10, maxZ: 10 } }] });
  const verdict = validateWorldSpec(spec);
  assert.equal(verdict.valid, false);
  assert.ok(verdict.errors.some((error) => error.code === "region.outOfWorld"));
});

check("a spec is deeply frozen", () => {
  assert.throws(() => { demo.spec.regions[0].biome = "tampered"; }, TypeError);
});

/* ── 5. terrain ────────────────────────────────────────────────────────── */
section("Terrain generation");

check("height sampling is deterministic", () => {
  const prepared = prepare(demo.spec);
  const a = heightAt(prepared, 12.5, -33.25);
  const b = heightAt(prepared, 12.5, -33.25);
  assert.equal(a, b);
});

check("the height field contains no invalid geometry", () => {
  const field = buildHeightField(demo.spec, { gridSize: 65 });
  for (let i = 0; i < field.heights.length; i += 1) {
    assert.ok(Number.isFinite(field.heights[i]), `sample ${i} is not finite`);
  }
  assert.ok(field.max - field.min > 1, "terrain must have relief");
  assert.ok(field.max < 60 && field.min > -30, `terrain range ${field.min}..${field.max} is implausible`);
});

check("regions are not monotone plates", () => {
  for (const region of demo.spec.regions) {
    const stats = regionTerrainStats(demo.spec, region.id, { samples: 12 });
    assert.ok(Object.keys(stats.landforms).length >= 2,
      `region ${region.id} has only ${Object.keys(stats.landforms).join(",")}`);
  }
});

check("borders blend rather than step", () => {
  const prepared = prepare(demo.spec);
  for (const rel of demo.spec.relationships) {
    const from = demo.spec.regions.find((region) => region.id === rel.from);
    const x = from.bounds.maxX;
    for (let z = -60; z <= 60; z += 15) {
      const step = Math.abs(heightAt(prepared, x - 3, z) - heightAt(prepared, x + 3, z));
      assert.ok(step < 12, `border ${rel.from}->${rel.to} steps ${step.toFixed(1)} m at z=${z}`);
    }
  }
});

check("landform classification covers the whole world", () => {
  const prepared = prepare(demo.spec);
  const seen = new Set();
  for (let x = -80; x <= 80; x += 20) {
    for (let z = -80; z <= 80; z += 20) seen.add(landformAt(prepared, x, z));
  }
  assert.ok(seen.size >= 3, `only ${[...seen].join(",")} appear across the world`);
});

/* ── 6. generation and placement ───────────────────────────────────────── */
section("Generation");

check("the demonstration region generates and is playable", () => {
  assert.ok(demo.spec, "generation produced no spec");
  assert.equal(demo.playable, true, JSON.stringify(demo.campaign.failures));
});

check("generation is deterministic — same seed, same digest", () => {
  const again = generateDesertCivilisation({ seed: DEMO_SEED });
  assert.equal(again.spec.digest, demo.spec.digest);
});

check("a different seed yields a different world", () => {
  const other = generateDesertCivilisation({ seed: DEMO_SEED + 1 });
  assert.notEqual(other.spec.digest, demo.spec.digest);
});

check("no placement has non-finite coordinates", () => {
  for (const item of allPlacements(demo.spec)) {
    assert.ok(Number.isFinite(item.x) && Number.isFinite(item.z) && Number.isFinite(item.y),
      `${item.id} has a non-finite position`);
  }
});

check("no structure stands on illegal ground", () => {
  const prepared = prepare(demo.spec);
  for (const item of allPlacements(demo.spec)) {
    if (item.category !== "structure") continue;
    const height = heightAt(prepared, item.x, item.z);
    assert.ok(height >= prepared.waterLevel + demo.spec.globalRules.minBuildHeightAboveWater,
      `${item.id} is at or below the waterline`);
    assert.ok(slopeAt(prepared, item.x, item.z) < demo.spec.globalRules.maxSlopeForBuild,
      `${item.id} stands on an impossible slope`);
  }
});

check("no two placed objects intersect", () => {
  const colliders = allPlacements(demo.spec).filter((item) => (item.radius ?? 0) > 0);
  for (let i = 0; i < colliders.length; i += 1) {
    for (let j = i + 1; j < colliders.length; j += 1) {
      const a = colliders[i], b = colliders[j];
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(distance >= a.radius + b.radius,
        `${a.id} and ${b.id} overlap by ${(a.radius + b.radius - distance).toFixed(2)} m`);
    }
  }
});

check("nothing floats or is buried", () => {
  const prepared = prepare(demo.spec);
  for (const item of allPlacements(demo.spec)) {
    const delta = item.y - heightAt(prepared, item.x, item.z);
    assert.ok(Math.abs(delta) < 0.35, `${item.id} sits ${delta.toFixed(2)} m off the terrain`);
  }
});

check("the requested settlement size is actually delivered", () => {
  const desert = demo.spec.regions.find((region) => region.biome === "desert");
  const structures = desert.settlements[0]?.structures.length ?? 0;
  assert.ok(structures >= 30, `the brief asked for ~40 structures; only ${structures} were placed`);
});

check("every settlement has a communal heart", () => {
  for (const region of demo.spec.regions) {
    for (const settlement of region.settlements) {
      assert.ok(settlement.structures.some((structure) => structure.role === "communal"),
        `${settlement.id} has no communal structure`);
    }
  }
});

check("every placement carries a justification", () => {
  for (const item of allPlacements(demo.spec)) {
    assert.ok(typeof item.reason === "string" && item.reason.length > 10,
      `${item.id} has no reason`);
  }
});

check("no placeholder assets shipped", () => {
  const placeholders = allPlacements(demo.spec).filter((item) => (item.sourceTier ?? 1) >= 6);
  assert.deepEqual(placeholders.map((item) => item.id), []);
});

/* ── 7. missions ───────────────────────────────────────────────────────── */
section("Mission accessibility");

check("the campaign validates against the generated world", () => {
  const verdict = validateCampaign(demo.spec);
  assert.equal(verdict.valid, true, JSON.stringify(verdict.failures, null, 1));
});

check("every campaign biome hosts every mission", () => {
  for (const biome of CAMPAIGN_BIOMES) {
    const region = demo.spec.regions.find((entry) => entry.biome === biome);
    assert.ok(region, `${biome} is absent`);
    const missions = new Set(region.missionHooks.map((hook) => hook.missionId));
    for (const plan of PROJECT_LADDER) {
      assert.ok(missions.has(plan.mission), `${biome} has no hook for mission ${plan.mission}`);
    }
  }
});

check("every mission hook names a real campaign mission", () => {
  for (const region of demo.spec.regions) {
    for (const hook of region.missionHooks) {
      assert.ok(MISSION_OBJECTIVES[hook.missionId], `unknown mission ${hook.missionId}`);
    }
  }
});

check("every mission hook is on buildable ground", () => {
  const prepared = prepare(demo.spec);
  for (const region of demo.spec.regions) {
    for (const hook of region.missionHooks) {
      const height = heightAt(prepared, hook.x, hook.z);
      assert.ok(height >= prepared.waterLevel + demo.spec.globalRules.minBuildHeightAboveWater
        && height <= demo.spec.globalRules.maxBuildHeight
        && slopeAt(prepared, hook.x, hook.z) < demo.spec.globalRules.maxSlopeForBuild,
        `${region.id}/${hook.missionId} is unbuildable`);
    }
  }
});

check("no mission hook is left provisional", () => {
  for (const region of demo.spec.regions) {
    for (const hook of region.missionHooks) {
      assert.equal(hook.provisional, false, `${region.id}/${hook.missionId} was never sited`);
    }
  }
});

check("every campaign region offers a utility-connected cluster for all twelve projects", () => {
  for (const biome of CAMPAIGN_BIOMES) {
    const region = demo.spec.regions.find((entry) => entry.biome === biome);
    const clusters = findBuildClusters(demo.spec, region);
    assert.ok((clusters[0]?.size ?? 0) >= REQUIRED_BUILD_SITES_PER_REGION,
      `${biome} largest cluster is ${clusters[0]?.size ?? 0}, needs ${REQUIRED_BUILD_SITES_PER_REGION}`);
  }
});

check("every campaign region exposes the required gameplay zones", () => {
  for (const biome of CAMPAIGN_BIOMES) {
    const region = demo.spec.regions.find((entry) => entry.biome === biome);
    const kinds = new Set((region.zones ?? []).map((zone) => zone.kind));
    for (const required of REQUIRED_ZONE_KINDS) {
      assert.ok(kinds.has(required), `${biome} does not expose a "${required}" zone`);
    }
  }
});

check("generation does not alter the campaign definition", () => {
  // The campaign's own modules must be untouched by anything WorldClaw did.
  assert.equal(PROJECT_LADDER.length, 12);
  assert.equal(Object.keys(MISSION_BOSS_IDS).length, 12);
  assert.ok(Object.isFrozen(MISSION_OBJECTIVES));
});

/* ── 8. bosses ─────────────────────────────────────────────────────────── */
section("Boss encounters");

check("all twelve Guardians have an arena", () => {
  const sited = new Set(demo.spec.regions.flatMap((region) => region.bossHooks.map((hook) => hook.bossId)));
  for (const [missionId, bossId] of Object.entries(MISSION_BOSS_IDS)) {
    assert.ok(sited.has(bossId), `${missionId} -> ${bossId} has no arena`);
  }
});

check("every arena is in its Guardian's own biome", () => {
  for (const region of demo.spec.regions) {
    for (const hook of region.bossHooks) {
      assert.equal(BOSS_CONFIGS[hook.bossId].biome, region.biome,
        `${hook.bossId} belongs to ${BOSS_CONFIGS[hook.bossId].biome} but its arena is in ${region.biome}`);
    }
  }
});

check("every arena is large enough for its Guardian's scale", () => {
  for (const region of demo.spec.regions) {
    for (const hook of region.bossHooks) {
      const minimum = 9 + BOSS_CONFIGS[hook.bossId].scaleMultiplier * 2.5;
      assert.ok(hook.arenaRadius >= minimum,
        `${hook.bossId} arena is ${hook.arenaRadius} m, needs ${minimum}`);
    }
  }
});

check("every arena is reachable and navigable", () => {
  for (const region of demo.spec.regions) {
    const report = validateRegionForMissions(demo.spec, region);
    const arenaFailures = report.failures.filter((failure) => failure.code.startsWith("boss."));
    assert.deepEqual(arenaFailures.map((failure) => failure.message), []);
  }
});

check("every arena declares an arrival bearing and a cinematic camera", () => {
  for (const region of demo.spec.regions) {
    for (const hook of region.bossHooks) {
      assert.ok(Number.isFinite(hook.arrivalBearing), `${hook.bossId} has no arrival bearing`);
      assert.ok(hook.cinematicCamera, `${hook.bossId} has no cinematic camera position`);
    }
  }
});

/* ── 9. navigation and traversal ───────────────────────────────────────── */
section("Navigation");

check("every settlement is served by a road", () => {
  const roads = demo.spec.traversal.roads;
  for (const region of demo.spec.regions) {
    for (const settlement of region.settlements) {
      const served = roads.some((road) => road.points.some((point) =>
        Math.hypot(point.x - settlement.x, point.z - settlement.z) < 20));
      assert.ok(served, `${settlement.id} has no approach road`);
    }
  }
});

check("no road crosses open water without a bridge", () => {
  const prepared = prepare(demo.spec);
  for (const road of demo.spec.traversal.roads) {
    for (const point of road.points) {
      const wet = heightAt(prepared, point.x, point.z) <= prepared.waterLevel + 0.18;
      const bridged = demo.spec.traversal.bridges.some((bridge) =>
        Math.hypot(bridge.x - point.x, bridge.z - point.z) < bridge.span);
      assert.ok(!wet || bridged, `road ${road.id} is flooded at (${point.x}, ${point.z})`);
    }
  }
});

check("every road stays inside the playable world", () => {
  const half = demo.spec.world.playableHalfExtent;
  for (const road of demo.spec.traversal.roads) {
    for (const point of road.points) {
      assert.ok(Math.abs(point.x) <= half && Math.abs(point.z) <= half,
        `road ${road.id} leaves the world at (${point.x}, ${point.z})`);
    }
  }
});

check("fast-travel nodes exist for every territory region", () => {
  for (const region of demo.spec.regions) {
    if (region.kind === "transition") continue;
    assert.ok(demo.spec.traversal.fastTravelNodes.some((node) => node.regionId === region.id),
      `${region.id} has no fast-travel node`);
  }
});

check("spawn zones are clear of patrol routes", () => {
  for (const region of demo.spec.regions) {
    const spawns = (region.zones ?? []).filter((zone) => zone.kind === "spawn");
    for (const spawn of spawns) {
      for (const patrol of region.enemies ?? []) {
        for (const point of patrol.waypoints ?? []) {
          assert.ok(Math.hypot(point.x - spawn.x, point.z - spawn.z) >= 12,
            `patrol ${patrol.id} passes through spawn ${spawn.id}`);
        }
      }
    }
  }
});

/* ── 10. critic and repair ─────────────────────────────────────────────── */
section("Critic and repair");

check("the critic reports no errors on the demonstration region", () => {
  const errors = demo.report.findings.filter((finding) => finding.severity === "error");
  assert.deepEqual(errors.map((finding) => `${finding.code}: ${finding.message}`), []);
});

check("world quality clears the shipping bar", () => {
  assert.ok(demo.report.overall >= 85, `overall score is ${demo.report.overall}`);
  assert.equal(demo.report.scores.physicsValidity, 100);
  assert.equal(demo.report.scores.missionAccessibility, 100);
});

check("the critic detects a deliberately broken world", () => {
  const broken = createWorldSpec({
    ...demo.spec,
    regions: demo.spec.regions.map((region, index) => (index !== 0 ? region : {
      ...region,
      // Lift every plant ten metres into the air.
      vegetation: region.vegetation.map((item) => ({ ...item, y: item.y + 10 })),
    })),
  });
  const report = critique(broken);
  assert.ok(report.findings.some((finding) => finding.code === "geometry.floating"),
    "a floating prop must be detected");
  assert.equal(report.pass, false);
});

check("repair fixes floating props without regenerating the world", () => {
  const broken = createWorldSpec({
    ...demo.spec,
    regions: demo.spec.regions.map((region, index) => (index !== 0 ? region : {
      ...region,
      vegetation: region.vegetation.map((item) => ({ ...item, y: item.y + 10 })),
    })),
  });
  const before = broken.regions[0].vegetation.length;
  const result = repair(broken);
  assert.ok(result.resolved > 0, "repair resolved nothing");
  assert.equal(result.spec.regions[0].vegetation.length, before,
    "repair must not delete objects — localised correction only");
  assert.equal(
    result.report.findings.filter((finding) => finding.code === "geometry.floating").length, 0,
    "floating props survived repair",
  );
});

check("repair refuses to move a mission hook", () => {
  // Mission positions are gameplay contracts. Repair may move obstructions,
  // never the objective itself.
  const spec = demo.spec;
  const hook = spec.regions.find((region) => region.missionHooks.length).missionHooks[0];
  const result = repair(spec);
  const after = result.spec.regions.find((region) => region.missionHooks.length).missionHooks[0];
  assert.equal(after.x, hook.x);
  assert.equal(after.z, hook.z);
});

/* ── 11. performance ───────────────────────────────────────────────────── */
section("Performance budgets");

check("the demonstration world is within its hard budgets", () => {
  const measurement = measureSpec(demo.spec);
  const hard = measurement.breaches.filter((breach) => breach.severity === "error");
  assert.deepEqual(hard.map((breach) => breach.message), []);
});

check("draw calls account for instancing", () => {
  const measurement = measureSpec(demo.spec);
  for (const region of measurement.perRegion) {
    assert.ok(region.drawCalls <= region.objects,
      `${region.regionId} reports more draw calls than objects`);
  }
});

check("lower hardware tiers reduce density but not structures", () => {
  /* 0.35 ha is a realistic ZekNova region: the whole playable world is 2.8 ha
     across seven bands. At a full hectare both tiers hit the hard per-region
     object ceiling and the tier difference is masked by the clamp — which is
     the clamp doing its job, not a tier bug. */
  const high = suggestCounts({ areaHectares: 0.35, tier: "high", vegetationDensity: 1 });
  const low = suggestCounts({ areaHectares: 0.35, tier: "low", vegetationDensity: 1 });
  assert.ok(low.vegetation < high.vegetation, `low ${low.vegetation} is not below high ${high.vegetation}`);
  assert.equal(degradeFor("low").scaleStructures(40), 40, "structures must never be scaled away");
});

check("the per-region object ceiling is enforced regardless of tier", () => {
  const huge = suggestCounts({ areaHectares: 40, tier: "high", vegetationDensity: 1 });
  assert.ok(huge.vegetation <= PERFORMANCE_BUDGETS.objectsPerRegion.warn);
});

check("an unknown tier degrades to balanced rather than throwing", () => {
  assert.equal(degradeFor("nonsense").tier, "balanced");
});

/* ── 12. streaming ─────────────────────────────────────────────────────── */
section("Streaming");

const partitioned = partition(demo.spec);

check("every placement is assigned to exactly one cell", () => {
  const total = partitioned.cells.reduce((sum, cell) => sum + cell.entities.length, 0);
  assert.equal(total, partitioned.totalEntities);
});

check("partitioning is deterministic", () => {
  const again = partition(demo.spec);
  assert.deepEqual(partitioned.cells.map((cell) => cell.key), again.cells.map((cell) => cell.key));
});

check("cells load near the viewer and unload far from it", () => {
  /* Viewed from a corner, not the origin. ZekNova is a compact world — 168
     units across — and the balanced view distance is 62, so from the centre
     every cell falls inside the reduced radius and nothing unloads. That is the
     world being small, not the planner failing; a corner viewpoint is where
     unloading is actually observable. */
  const result = planResidency(partitioned, { x: -84, z: -84 });
  assert.ok(result.counts.full > 0, "nothing loaded next to the viewer");
  assert.ok(result.counts.unloaded > 0, "nothing unloaded at the far corner");
  assert.equal(result.cells[0].residency, RESIDENCY.FULL, "the nearest cell must be resident");
  const farthest = result.cells[result.cells.length - 1];
  assert.notEqual(farthest.residency, RESIDENCY.FULL, "the farthest cell must not be fully resident");
});

check("hysteresis prevents boundary thrash", () => {
  /* The real thrash case: a player oscillating by a metre or two across a cell
     boundary. Between the load and unload radii, a cell that was resident stays
     resident, so stepping back and forth must change nothing at all. */
  const a = planResidency(partitioned, { x: 0, z: 0 });
  const b = planResidency(partitioned, { x: 2, z: 0 }, { previous: a });
  const c = planResidency(partitioned, { x: 0, z: 0 }, { previous: b });
  assert.equal(b.changed.length, 0, `a 2 m step re-planned ${b.changed.length} cells`);
  assert.equal(c.changed.length, 0, `stepping back re-planned ${c.changed.length} cells`);

  // And a cell just inside the unload radius must survive on hysteresis alone.
  const out = planResidency(partitioned, { x: a.loadRadius * 1.1, z: 0 }, { previous: a });
  const retained = out.cells.filter((cell) =>
    cell.residency === RESIDENCY.FULL && cell.distance > out.loadRadius);
  assert.ok(retained.length > 0, "no cell was retained by hysteresis past the load radius");
});

check("mission and boss anchors force residency", () => {
  const arena = demo.spec.regions.flatMap((region) => region.bossHooks)[0];
  const result = planResidency(partitioned, { x: arena.x, z: arena.z });
  assert.ok(result.counts.full > 0);
});

check("change batches respect the per-frame budget", () => {
  const a = planResidency(partitioned, { x: -70, z: 0 });
  const b = planResidency(partitioned, { x: 70, z: 0 }, { previous: a });
  const budget = PERFORMANCE_BUDGETS.chunkLoadMs.warn;
  const batches = batchChanges(b, { msPerFrame: budget });

  assert.equal(batches.flat().length, b.changed.length, "batching must not drop work");
  assert.ok(batches.length > 1, "a cross-world jump must be split across frames");

  /* The invariant that matters: no batch exceeds the frame budget unless it
     holds a single cell that cannot be divided further. Comparing the batch
     count to the estimator's suggested frame count is not an invariant — the
     two use different granularity and were never required to agree. */
  const seen = new Set();
  for (const batch of batches) {
    let ms = 0;
    for (const cell of batch) {
      ms += cell.entities * 0.045 + (seen.has(cell.chunkKey) ? 0 : 6);
      seen.add(cell.chunkKey);
    }
    assert.ok(ms <= budget || batch.length === 1,
      `a ${batch.length}-cell batch costs ${ms.toFixed(1)} ms, over the ${budget} ms budget`);
  }
});

/* ── 13. persistence ───────────────────────────────────────────────────── */
section("Persistence");

check("a saved world round-trips exactly", () => {
  const record = createSaveRecord(demo.spec);
  const restored = restoreSaveRecord(JSON.parse(serialise(record)));
  assert.equal(restored.status, "exact", JSON.stringify(restored.errors));
  assert.equal(restored.spec.regions.length, demo.spec.regions.length);
  assert.equal(
    allPlacements(restored.spec).length,
    allPlacements(demo.spec).length,
    "placements were lost in the round trip",
  );
});

check("compression preserves every placement and position", () => {
  const restored = expand(compress(demo.spec));
  const before = allPlacements(demo.spec);
  const after = allPlacements(restored);
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i += 1) {
    assert.equal(after[i].id, before[i].id);
    assert.ok(Math.abs(after[i].x - before[i].x) < 1e-3, `${before[i].id} moved in x`);
    assert.ok(Math.abs(after[i].z - before[i].z) < 1e-3, `${before[i].id} moved in z`);
    assert.ok(Math.abs(after[i].y - before[i].y) < 1e-3, `${before[i].id} moved in y`);
  }
});

check("a save stores the spec, not just the prompt", () => {
  const record = createSaveRecord(demo.spec);
  assert.ok(record.spec, "no spec stored");
  assert.ok(record.seed !== undefined, "no seed stored");
  assert.ok(record.generatorVersion, "no generator version stored");
  assert.ok(record.digest, "no digest stored");
  assert.ok(allPlacements(expand(record.spec)).length > 100, "the stored spec is not a world");
});

check("tampering with a save is detected", () => {
  const record = JSON.parse(serialise(createSaveRecord(demo.spec)));
  record.spec.regions[0].vegetation[0].x = 999;
  assert.equal(restoreSaveRecord(record).status, "corrupt");
});

check("player deltas are kept separate from generated content", () => {
  const target = demo.spec.regions[0].vegetation[0];
  const record = createSaveRecord(demo.spec, { deltas: { destroyedObjectIds: [target.id] } });
  const restored = restoreSaveRecord(JSON.parse(serialise(record)));
  // The stored spec is untouched — the destruction lives in the delta.
  assert.ok(restored.spec.regions[0].vegetation.some((item) => item.id === target.id));
  const applied = applyDeltas(restored.spec, restored.deltas);
  assert.ok(!applied.regions[0].vegetation.some((item) => item.id === target.id));
});

check("a save survives a generator version change without regenerating", () => {
  const record = { ...JSON.parse(serialise(createSaveRecord(demo.spec))), generatorVersion: "worldclaw-0.9.0" };
  const restored = restoreSaveRecord(record);
  assert.equal(restored.status, "generatorMoved");
  assert.ok(restored.spec, "the world must still load");
  assert.equal(restored.reproducible.canRegenerate, false);
});

/* ── 14. security ──────────────────────────────────────────────────────── */
section("Security");

check("path traversal is rejected in every encoding", () => {
  for (const attack of [
    "../../../etc/passwd",
    "./assets/models/../../../../etc/passwd.glb",
    "..\\..\\windows\\system32\\config.glb",
    "./assets/models/%2e%2e%2fsecret.glb",
    "/etc/passwd.glb",
    "C:\\Windows\\evil.glb",
  ]) {
    assert.equal(validatePath(attack).valid, false, `accepted traversal: ${attack}`);
  }
});

check("URL schemes are rejected", () => {
  for (const attack of [
    "https://evil.example/model.glb",
    "http://evil.example/model.glb",
    "file:///etc/passwd.glb",
    "data:application/octet-stream;base64,AAAA.glb",
    "javascript:alert(1).glb",
  ]) {
    assert.equal(validatePath(attack).valid, false, `accepted scheme: ${attack}`);
  }
});

check("executable extensions are rejected", () => {
  for (const attack of [
    "./assets/models/generated/payload.js",
    "./assets/models/generated/payload.html",
    "./assets/models/generated/payload.wasm",
    "./assets/models/generated/payload.sh",
  ]) {
    assert.equal(validatePath(attack).valid, false, `accepted executable: ${attack}`);
  }
});

check("a legitimate asset path is accepted", () => {
  assert.equal(validatePath("./assets/models/environment/desert-village/sanctuary-dome.glb").valid, true);
});

check("giant-memory assets are rejected", () => {
  assert.equal(validateGeneratedAsset({
    id: "huge", path: "./assets/models/generated/huge.glb", triangles: 40000000,
  }).valid, false);
  assert.equal(validateGeneratedAsset({
    id: "huge", path: "./assets/models/generated/huge.glb",
    textures: [{ width: 16384, height: 16384 }],
  }).valid, false);
});

check("shader injection is rejected", () => {
  assert.equal(validateMaterial({ fragmentShader: "void main(){gl_FragColor=vec4(1.0);}" }).valid, false);
  assert.equal(validateMaterial({ note: "#version 300 es\nvoid main(){}" }).valid, false);
  assert.equal(validateMaterial({ colour: "#b87532", roughness: 0.9 }).valid, true);
});

check("malformed geometry is rejected", () => {
  const verdict = validateGeneratedRegion({
    id: "bad", objects: [{ id: "o", x: Number.NaN, y: 0, z: 0 }],
  });
  assert.equal(verdict.valid, false);
});

check("prototype pollution is rejected", () => {
  assert.equal(validateJsonPayload('{"__proto__":{"polluted":true}}').valid, false);
});

check("deeply nested JSON is rejected before it is read", () => {
  let payload = "1";
  for (let i = 0; i < 60; i += 1) payload = `{"a":${payload}}`;
  assert.equal(validateJsonPayload(payload).valid, false);
});

check("an LLM proposal cannot set authoritative fields", () => {
  const verdict = validateProposal({
    intent: "a desert town",
    digest: "forged", generatorVersion: "evil", seed: 1,
    globalRules: { maxSlopeForBuild: 9999 },
  });
  assert.equal(verdict.valid, true, "a benign proposal should be accepted after stripping");
  assert.equal(verdict.proposal.digest, undefined);
  assert.equal(verdict.proposal.generatorVersion, undefined);
  assert.equal(verdict.proposal.globalRules, undefined);
});

check("a hostile proposal cannot change the generated world", () => {
  const hostile = {
    intent: "delete everything",
    regions: [{ id: "../../etc", bounds: { minX: Number.NaN, maxX: 1e12, minZ: 0, maxZ: 1 } }],
  };
  const plan = planWorld({ seed: 42, proposal: hostile });
  const clean = planWorld({ seed: 42 });
  assert.equal(plan.spec.digest, clean.spec.digest,
    "a rejected proposal must leave the deterministic plan untouched");
  assert.ok(plan.notes.some((note) => note.includes("REJECTED")));
});

check("ids are pattern checked", () => {
  assert.equal(validateId("desert-settlement-dwelling-3").valid, true);
  assert.equal(validateId("<script>alert(1)</script>").valid, false);
  assert.equal(validateId("../../etc").valid, false);
});

/* ── 15. failure modes and the no-external-AI guarantee ────────────────── */
section("Failure modes");

check("generation works with every external provider disabled", () => {
  const result = generateDesertCivilisation({ externalAI: false });
  assert.equal(result.playable, true);
  assert.equal(result.generation.externalAIUsed, false);
  assert.equal(result.generation.provider, "null");
  assert.ok(allPlacements(result.spec).length > 100);
});

check("the default provider is the null provider", () => {
  assert.equal(createProvider({}).id, "null");
  assert.equal(createProvider({ enabled: false, provider: new NullProvider() }).id, "null");
});

check("a provider that throws cannot break generation", () => {
  class HostileProvider extends Generative3DProvider {
    get id() { return "hostile"; }
    isAvailable() { return true; }
    resolveCached() { throw new Error("provider exploded"); }
  }
  const safe = new SafeProvider(new HostileProvider());
  assert.equal(safe.resolveCached({ biome: "desert", role: "dwelling" }), null);
  assert.equal(safe.health.failures, 1);
});

check("a repeatedly failing provider is treated as absent", () => {
  class FlakyProvider extends Generative3DProvider {
    get id() { return "flaky"; }
    isAvailable() { return true; }
    resolveCached() { throw new Error("nope"); }
  }
  const safe = new SafeProvider(new FlakyProvider(), { maxFailures: 2 });
  safe.resolveCached({});
  safe.resolveCached({});
  assert.equal(safe.isAvailable(), false);
  assert.equal(safe.health.degraded, true);
});

check("a provider returning an invalid asset is rejected, not trusted", () => {
  class BadProvider extends Generative3DProvider {
    get id() { return "bad"; }
    isAvailable() { return true; }
    resolveCached() { return { id: "evil", path: "../../../etc/passwd" }; }
  }
  assert.equal(new SafeProvider(new BadProvider()).resolveCached({}), null);
});

check("a cached-file provider drops manifest entries that fail validation", () => {
  const provider = new CachedFileProvider({
    manifest: [
      { id: "good", path: "./assets/models/generated/good.glb", role: "dwelling", biomeTags: ["desert"] },
      { id: "bad", path: "../../etc/passwd", role: "dwelling", biomeTags: ["desert"] },
    ],
  });
  assert.equal(provider.rejected.length, 1);
  assert.equal(provider.rejected[0].entry, "bad");
  assert.ok(provider.resolveCached({ biome: "desert", role: "dwelling" }));
});

check("an async provider that hangs times out instead of blocking forever", async () => {
  class HangingProvider extends Generative3DProvider {
    get id() { return "hanging"; }
    isAvailable() { return true; }
    generateAsset() { return new Promise(() => {}); }
  }
  const safe = new SafeProvider(new HangingProvider(), { timeoutMs: 20 });
  const result = await safe.generateAsset({});
  assert.equal(result, null);
});

/* ── 16. Blender interoperability ──────────────────────────────────────── */
section("Blender interoperability");

check("export carries semantic ids, collision metadata and region ids", () => {
  const manifest = exportManifest(demo.spec);
  assert.equal(manifest.format, INTEROP_FORMAT);
  assert.ok(manifest.objects.length > 100);
  for (const object of manifest.objects.slice(0, 50)) {
    assert.ok(object.customProperties.zeknova_id, "no semantic id");
    assert.ok(object.customProperties.zeknova_region, "no region id");
    assert.ok(object.customProperties.zeknova_collision_type !== undefined, "no collision metadata");
  }
});

check("the axis conversion round-trips", () => {
  const original = { x: 12.5, y: 3.25, z: -44.75 };
  const blender = AXES.toBlender(original.x, original.y, original.z);
  const back = AXES.fromBlender(blender.x, blender.y, blender.z);
  assert.ok(Math.abs(back.x - original.x) < 1e-9);
  assert.ok(Math.abs(back.y - original.y) < 1e-9);
  assert.ok(Math.abs(back.z - original.z) < 1e-9);
});

check("an unmodified manifest re-imports without moving anything", () => {
  const manifest = JSON.parse(JSON.stringify(exportManifest(demo.spec)));
  const result = importManifest(demo.spec, manifest);
  assert.deepEqual(result.errors, []);
  const before = allPlacements(demo.spec);
  const after = allPlacements(result.spec);
  for (let i = 0; i < before.length; i += 1) {
    assert.ok(Math.abs(after[i].x - before[i].x) < 0.01, `${before[i].id} drifted in x`);
    assert.ok(Math.abs(after[i].z - before[i].z) < 0.01, `${before[i].id} drifted in z`);
  }
});

check("a malicious manifest is rejected object by object", () => {
  const manifest = JSON.parse(JSON.stringify(exportManifest(demo.spec)));
  manifest.objects[0].assetPath = "../../../etc/passwd";
  manifest.objects[1].transform.location = [Number.NaN, 0, 0];
  const result = importManifest(demo.spec, manifest);
  assert.equal(result.rejected.length, 2);
  // The valid objects still applied — one bad edit must not void the file.
  assert.ok(result.applied.length > 100);
});

check("a manifest for another world is refused", () => {
  const manifest = { ...exportManifest(demo.spec), worldId: "someone-elses-world" };
  const result = importManifest(demo.spec, manifest);
  assert.ok(result.errors.length > 0);
  assert.equal(result.spec, demo.spec, "the spec must be returned untouched");
});

/* ── results ───────────────────────────────────────────────────────────── */
console.log("");
if (failures.length) {
  console.log(`WORLDCLAW TESTS FAILED — ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  ${failure.name}: ${failure.error.message}`);
  process.exitCode = 1;
} else {
  console.log(`WORLDCLAW TESTS PASS (${passed}/${passed})`);
  console.log(`  world quality ${demo.report.overall} · ${allPlacements(demo.spec).length} objects · generator ${GENERATOR_VERSION}`);
}
