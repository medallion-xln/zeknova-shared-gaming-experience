import assert from "node:assert/strict";
import { MISSION_OBJECTIVES, ZEKNOVAN_AID_TYPES, objectiveComplete } from "../src/game/Missions.js";

const VALID_BIOMES = new Set(["forest", "desert", "highlands", "arctic", "wetlands"]);
const isHabitatAid = (objective) => objective?.kind === "biomeEither"
  && objective.biome === "forest"
  && Array.isArray(objective.keys)
  && objective.keys.includes("zek_grove")
  && objective.keys.every((key) => ZEKNOVAN_AID_TYPES.includes(key))
  && objective.target === 1;

const habitat = MISSION_OBJECTIVES.habitat;
assert.ok(Array.isArray(habitat), "Habitat mission must exist");
assert.equal(habitat.at(-1)?.kind, "boss", "Habitat must retain its terminal boss objective");
const aid = habitat.find(isHabitatAid);
assert.ok(aid, "generated/exported Habitat must preserve its Forest ZekNovan-aid objective");
assert.ok(VALID_BIOMES.has(aid.biome));
assert.ok(ZEKNOVAN_AID_TYPES.includes("zek_grove"), "zek_grove must be a canonical ZekNovan aid building type");
assert.equal(objectiveComplete(aid, { biomes: { forest: { buildings: { zek_grove: 1 } } } }), true);

assert.equal(isHabitatAid(undefined), false, "missing objective must fail");
assert.equal(isHabitatAid({ ...aid, biome: "wetlands" }), false, "wrong biome must fail");
assert.equal(isHabitatAid({ ...aid, kind: "biomeBuilding" }), false, "wrong objective type must fail");
assert.equal(isHabitatAid({ ...aid, keys: aid.keys.filter((key) => key !== "zek_grove") }), false, "wrong target set must fail");
assert.equal(isHabitatAid({ ...aid, keys: [...aid.keys, "zek_unknown"] }), false, "unknown ZekNovan ID must fail");
assert.equal(isHabitatAid({ kind: "biomeEither", biome: "forest", target: 1 }), false, "malformed biomeEither must fail");
assert.equal(habitat.filter(isHabitatAid).length, 1, "Habitat must not duplicate its required aid objective");
assert.equal(habitat.filter((objective) => objective !== aid).some(isHabitatAid), false, "removing the generated objective must invalidate the contract");

console.log("Habitat Forest ZekNovan-aid objective tests passed.");
