import assert from "node:assert/strict";
import { MISSION_OBJECTIVES, createCampaignTiers, objectiveComplete } from "../src/game/Missions.js";

/* The supply route is a PLANETARY transit network, not a single Wetland crossing.
 *
 * This file used to assert a bridge-or-skiff biomeEither in the Wetlands, which is
 * what an earlier build bolted onto the mission. CampaignPlan.js assigns
 * supply-route the Planetary Transit Hub, delivered to all five AOs, and the
 * campaign now follows the ladder. The contract being checked is the same one —
 * the route's construction objectives are well-formed, biome-scoped, and
 * completable — applied to the objectives the mission actually has.
 */
const VALID_BIOMES = new Set(["forest", "desert", "highlands", "arctic", "wetlands"]);
const objectives = MISSION_OBJECTIVES["supply-route"];
assert.ok(Array.isArray(objectives), "supply-route must exist");
assert.equal(objectives.at(-1)?.kind, "boss", "supply-route must retain its terminal boss objective");

const crossings = objectives.filter((objective) => objective.kind === "biomeBuilding" && objective.key === "transit");
assert.equal(crossings.length, 5, "supply-route must deliver a Planetary Transit Hub to every biome");
assert.deepEqual([...crossings.map((objective) => objective.biome)].sort(), ["arctic", "desert", "forest", "highlands", "wetlands"]);
for (const crossing of crossings) {
  assert.ok(VALID_BIOMES.has(crossing.biome));
  assert.equal(crossing.target, 1);
  assert.equal(objectiveComplete(crossing, { biomes: { [crossing.biome]: { buildings: { transit: 1 } } } }), true);
  assert.equal(objectiveComplete(crossing, { biomes: { [crossing.biome]: { buildings: {} } } }), false);
}

// Negative controls: the objective must fail when its own terms are broken.
const sample = crossings[0];
assert.equal(objectiveComplete({ ...sample, key: "unknown" }, { biomes: { [sample.biome]: { buildings: { transit: 1 } } } }), false, "an unknown build type must not complete");
assert.equal(objectiveComplete({ ...sample, biome: "unknown" }, { biomes: { [sample.biome]: { buildings: { transit: 1 } } } }), false, "a transit hub in another biome must not complete");
assert.equal(objectiveComplete({ kind: "malformed", target: 1 }, {}), false);

// The route is not satisfied by harvesting; it must be built.
assert.equal(objectives.some((objective) => objective.kind === "biomeStat" && objective.key === "treesChopped"), false);

const structuralKeys = objectives.map((objective) => [objective.kind, objective.biome, objective.key ?? objective.keys?.join("|"), objective.label].join(":"));
assert.equal(new Set(structuralKeys).size, structuralKeys.length, "supply-route objectives must not duplicate structural identities");
const order = createCampaignTiers().flatMap((tier) => tier.missions.map((mission) => mission.id));
assert.equal(order.filter((id) => id === "supply-route").length, 1, "mission sequence must contain supply-route exactly once");

console.log("Supply-route planetary transit objective tests passed.");
