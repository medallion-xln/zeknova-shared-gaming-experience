import assert from "node:assert/strict";
import { buildingRecognitionSummary, classifyObjective, projectWorldPoint, rankAllowsBuilding } from "../src/ui/MissionClarityDirector.js";
import { HUMAN_BUILDINGS } from "../src/game/Buildings.js";
import { restartGame } from "../src/ui/PauseMenuDirector.js";

assert.equal(classifyObjective("Survey solar exposure · Forest AO"), "Exploration");
assert.equal(classifyObjective("Recover 2 Desert grid cores"), "Resources");
assert.equal(classifyObjective("Install a Solar Grid in the Forest AO"), "Construction");
assert.equal(classifyObjective("Open a shared ZekNovan trade project"), "Diplomacy");
assert.equal(classifyObjective("Intercept 3 attackers during commissioning"), "Commissioning");
assert.equal(classifyObjective("Break the Sunscar Colossus power siphon — Travel to Desert AO to start the boss fight"), "Guardian Encounter");
assert.equal(classifyObjective("Commission the Desert Regional Capitol"), "Construction");

assert.deepEqual(projectWorldPoint(-90, -90), { x: 0, y: 0 });
assert.deepEqual(projectWorldPoint(0, 0), { x: 50, y: 50 });
assert.deepEqual(projectWorldPoint(90, 90), { x: 100, y: 100 });
assert.deepEqual(projectWorldPoint(999, -999), { x: 100, y: 0 });

assert.equal(rankAllowsBuilding("ensign", HUMAN_BUILDINGS.capitol), false);
assert.equal(rankAllowsBuilding("lieutenant", HUMAN_BUILDINGS.capitol), true);
assert.equal(rankAllowsBuilding("lieutenant", HUMAN_BUILDINGS.planetary_capitol), true);
assert.equal(rankAllowsBuilding("lieutenant", HUMAN_BUILDINGS.war_economy), false);
assert.equal(rankAllowsBuilding("captain", HUMAN_BUILDINGS.war_economy), true);

assert.deepEqual(buildingRecognitionSummary({ buildings: { records: [
  { type: "capitol", x: 0, health: 1000 },
  { type: "capitol", x: 8, health: 1000 },
] } }, "capitol", "desert"), {
  total: 2,
  valid: 0,
  misplaced: 2,
  misplacedBiomes: ["HIGHLANDS AO"],
});
assert.equal(buildingRecognitionSummary({ buildings: { records: [{ type: "capitol", x: -36 }] } }, "capitol", "desert").valid, 1);

/* restartGame is a FULL reset, not a save-and-reload.
 *
 * This block previously asserted { saved: 1, flushed: 1 } — it encoded the old
 * behaviour, where "Restart Game" persisted the current world and then loaded
 * it straight back, so nothing was ever actually restarted. Saving during a
 * reset is now the defect: it would write the dirty in-memory world over the
 * fresh save. The assertion is inverted deliberately, and the reload (the part
 * that was always right) is unchanged. Full reset coverage lives in
 * tests/game-reset.test.mjs. */
let saved = 0;
let flushed = 0;
let reloaded = 0;
const restartFixture = {
  game: {
    user: { teamCode: "clarity-test" },
    async save() { saved += 1; },
    async flushAdaptiveSave() { flushed += 1; },
  },
  locationRef: { reload() { reloaded += 1; } },
  fetchFn: async () => ({ ok: true, status: 200 }),
  local: null, session: null, doc: null,
};
assert.equal(await restartGame({ ...restartFixture, confirmFn: () => false }), false);
assert.deepEqual({ saved, flushed, reloaded }, { saved: 0, flushed: 0, reloaded: 0 });
assert.equal(await restartGame({ ...restartFixture, confirmFn: () => true }), true);
assert.deepEqual({ saved, flushed, reloaded }, { saved: 0, flushed: 0, reloaded: 1 });

console.log("Mission clarity classification and map projection checks passed.");
