import assert from "node:assert/strict";
import { MISSION_OBJECTIVES, createCampaignTiers, objectiveComplete } from "../src/game/Missions.js";

const VALID_BIOMES = new Set(["forest", "desert", "highlands", "arctic", "wetlands"]);
const objectives = MISSION_OBJECTIVES["supply-route"];
assert.ok(Array.isArray(objectives), "supply-route must exist");
assert.equal(objectives.at(-1)?.kind, "boss", "supply-route must retain its terminal boss objective");

const crossing = objectives.find((objective) => objective.kind === "biomeEither" && objective.keys?.join(",") === "bridge,boat");
assert.ok(crossing, "supply-route must require an existing bridge or boat");
assert.equal(crossing.biome, "wetlands");
assert.ok(VALID_BIOMES.has(crossing.biome));
assert.equal(crossing.target, 1);
assert.equal(objectiveComplete(crossing, { biomes: { wetlands: { buildings: { bridge: 1 } } } }), true);
assert.equal(objectiveComplete(crossing, { biomes: { wetlands: { buildings: { boat: 1 } } } }), true);
assert.equal(objectiveComplete(crossing, { biomes: { wetlands: { buildings: {} } } }), false);
assert.equal(objectiveComplete({ ...crossing, keys: ["unknown"] }, { biomes: { wetlands: { buildings: { bridge: 1 } } } }), false);
assert.equal(objectiveComplete({ ...crossing, biome: "unknown" }, { biomes: { wetlands: { buildings: { bridge: 1 } } } }), false);
assert.equal(objectiveComplete({ kind: "malformed", target: 1 }, {}), false);

const structuralKeys = objectives.map((objective) => [objective.kind, objective.biome, objective.key ?? objective.keys?.join("|"), objective.label].join(":"));
assert.equal(new Set(structuralKeys).size, structuralKeys.length, "supply-route objectives must not duplicate structural identities");
const order = createCampaignTiers().flatMap((tier) => tier.missions.map((mission) => mission.id));
assert.equal(order.filter((id) => id === "supply-route").length, 1, "mission sequence must contain supply-route exactly once");

console.log("Supply-route bridge/boat objective tests passed.");
