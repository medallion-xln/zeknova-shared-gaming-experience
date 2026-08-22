import assert from "node:assert/strict";
import { GAME_MODES, getModeCapabilities, isBattleMode, isCivilianMode, isScriptedConfrontationActor, markerAllowed, normalizeGameMode, orderObjectivesForMode, simulationTier } from "../src/game/GameMode.js";

assert.equal(normalizeGameMode("civilian"), GAME_MODES.CIVILIAN);
assert.equal(normalizeGameMode("unknown"), GAME_MODES.BATTLE);
assert.equal(isCivilianMode("civilian"), true);
assert.equal(isBattleMode("battle"), true);
assert.equal(getModeCapabilities("civilian").ambientEnemySpawning, false);
assert.equal(getModeCapabilities("battle").ambientEnemySpawning, true);
assert.equal(markerAllowed("civilian", "resource"), true);
assert.equal(markerAllowed("civilian", "patrol"), false);
assert.equal(markerAllowed("battle", "patrol"), true);
assert.equal(markerAllowed("battle", "resource"), false);
assert.equal(markerAllowed("civilian", "boss", { explicitMission: true }), true);
assert.equal(isScriptedConfrontationActor({ userData: { missionId: "governance" } }), true);
assert.equal(isScriptedConfrontationActor({ userData: { commissioningAttacker: true } }), true);
assert.equal(isScriptedConfrontationActor({ userData: { hostile: true } }), false);
assert.deepEqual(orderObjectivesForMode([{ section: "Guardian Encounter" }, { section: "Construction" }, { section: "Exploration" }], "civilian").map((x) => x.section), ["Exploration", "Construction", "Guardian Encounter"]);
assert.deepEqual(orderObjectivesForMode([{ section: "Construction" }, { section: "Guardian Encounter" }], "battle").map((x) => x.section), ["Guardian Encounter", "Construction"]);
assert.equal(simulationTier(12, "civilian"), "near");
assert.equal(simulationTier(40, "civilian"), "mid");
assert.equal(simulationTier(75, "civilian"), "far");
assert.equal(simulationTier(150, "civilian"), "off-biome");

console.log("Civilian/Battle mode policy checks passed.");
