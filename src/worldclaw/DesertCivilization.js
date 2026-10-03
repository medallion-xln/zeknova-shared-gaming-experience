/**
 * ZekNova — WorldClaw demonstration region
 * Location: /src/worldclaw/DesertCivilization.js
 *
 * The Phase 22 vertical slice: ONE high-quality ZekNovan desert civilisation,
 * stated as intent rather than as coordinates.
 *
 * ── WHY THIS FILE IS SO SHORT ────────────────────────────────────────────
 * That is the whole point of the integration. The equivalent today is
 * `assets/environment-runtime.js:178-188` — eleven structures at hand-typed
 * offsets, `{ x: -12, z: -8 }`, `{ x: 11, z: -7 }`, with nothing anywhere
 * stating why. Replacing that with forty hand-typed offsets would have been
 * more content and the same architecture.
 *
 * What is written here instead is the DESIGN: what the region contains and why.
 * The planner turns that into a specification, the director places it against
 * real terrain, the critic grades it and the repair pass fixes what it can.
 * Changing "40 structures" to "60" here produces a coherent town of sixty, with
 * roads that still avoid buildings and objectives that are still reachable —
 * which is not true of any amount of editing done to the array of literals.
 *
 * ── EVERY REQUESTED FEATURE, AND WHERE IT COMES FROM ─────────────────────
 *   continuous desert terrain      region elevation profile + shared domain warp
 *   dunes, mesas                   `dunes`/`mesa` archetypes in the World Bible
 *   ancient riverbed               `dryRiver` feature -> a dry channel in
 *                                  `traversal.rivers`, carved but not flooded
 *   30-40 ZekNovan structures      `structureCount`, filled from the authored
 *                                  desert-village kit by Bible role priority
 *   water-processing infrastructure the `water` role, anchored by the desert's
 *                                  `atmospheric-collection` water strategy
 *   roads and trails               approach roads through perimeter gaps
 *   native alien vegetation        desert vegetation list, density 0.12
 *   resource sites                 crystal seams on eroded ground
 *   ruins                          `ruins` feature
 *   wildlife zones                 `wildlife` feature -> EcologyDirector ranges
 *   enemy patrol routes            patrols on the settlement approaches
 *   one major landmark             highest stable ground in the region
 *   hidden discovery               `hidden` feature -> the mine entrance
 *   vehicle traversal corridors    `vehicleCombat` feature -> low-slope lanes
 *   mission-compatible zones       twelve utility-connected campaign sites
 *   fast-travel node               region fast-travel anchor
 *   distant biome transition       the `basin` archetype inserted at the border
 */

import { WorldClawDirector } from "./WorldClawDirector.js";

/**
 * The demonstration seed.
 *
 * Pinned rather than derived, because this region is a reference artefact: the
 * tests assert its score and its digest, and a seed that moved would make those
 * assertions meaningless.
 */
export const DEMO_SEED = 847212;

export const DEMO_WORLD_ID = "zeknova-desert-civilisation";

/**
 * The design brief, as prose the planner parses.
 *
 * Written as a sentence rather than a config object on purpose: it is the
 * artefact a designer would actually write, and it exercises the intent parser
 * the way a real request would.
 */
export const DEMO_INTENT = [
  "Generate an unexplored ZekNovan desert civilization surrounding an ancient dry river basin.",
  "The settlement should have approximately 40 structures, a central water-processing facility,",
  "two trade routes, scattered ruins, indigenous vegetation, wildlife, hostile patrol zones,",
  "a major landmark, a hidden underground discovery,",
  "and enough open traversal space for vehicle combat.",
].join(" ");

/**
 * Build the demonstration region.
 *
 * Returns the director's full result — spec, critique, campaign verdict and
 * trace — so a caller can inspect the reasoning, not just the output.
 */
export function generateDesertCivilisation({
  seed = DEMO_SEED,
  tier = "balanced",
  externalAI = false,
} = {}) {
  const director = new WorldClawDirector({
    seed,
    worldId: DEMO_WORLD_ID,
    tier,
    // Off. The demonstration region is built entirely from authored ZekNova
    // assets and deterministic placement, which is the claim it exists to
    // support: the vertical slice must be reproducible with no network.
    externalAI,
  });
  return director.generate({ intent: DEMO_INTENT, focusRegion: "desert" });
}

/**
 * Human-readable report on the demonstration region.
 * Used by the test suite and by the editor's console entry point.
 */
export function describeDesertCivilisation(result) {
  if (!result?.spec) return "Demonstration region failed to generate.";
  const desert = result.spec.regions.find((region) => region.biome === "desert");
  const settlement = desert?.settlements?.[0];
  const roads = result.spec.traversal.roads.filter((road) => road.regionId === desert?.id);

  const lines = [
    "ZEK-NOVA DESERT CIVILISATION — WorldClaw demonstration region",
    "",
    `Seed                 ${result.generation.seed}`,
    `Digest               ${result.spec.digest}`,
    `Generation           ${result.generation.elapsedMs} ms, external AI ${result.generation.externalAIUsed ? "USED" : "not used"}`,
    "",
    `Region               ${desert?.id} (${desert?.biome}, ${desert?.climate}, danger ${desert?.dangerLevel})`,
    `Bounds               x ${desert?.bounds.minX.toFixed(1)} .. ${desert?.bounds.maxX.toFixed(1)}`,
    `Settlement           ${settlement?.form} — ${settlement?.structures.length} structures`,
    `Anchor strategy      ${settlement?.anchorStrategy}`,
    `Roads                ${roads.length}`,
    `Vegetation           ${desert?.vegetation.length}`,
    `Resource sites       ${desert?.resources.length}`,
    `Landmarks            ${desert?.landmarks.length}`,
    `Patrol routes        ${desert?.enemies.length}`,
    `Wildlife ranges      ${desert?.creatures.length}`,
    `Mission hooks        ${desert?.missionHooks.length}`,
    `Boss arenas          ${desert?.bossHooks.length}`,
    `Gameplay zones       ${[...new Set((desert?.zones ?? []).map((zone) => zone.kind))].join(", ")}`,
    `Vehicle corridors    ${result.spec.traversal.corridors.filter((corridor) => corridor.regionId === desert?.id).length}`,
    "",
    result.scoreCard,
    "",
    `Campaign             ${result.campaign.failures.length === 0 ? "INTACT" : `${result.campaign.failures.length} FAILURE(S)`}`,
    `Playable             ${result.playable ? "YES" : "NO"}`,
  ];

  if (settlement) {
    lines.push("", "Structure roles:");
    for (const [role, count] of Object.entries(settlement.roleCounts).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${role.padEnd(12)} ${count}`);
    }
  }
  return lines.join("\n");
}
