import assert from "node:assert/strict";
import { SentinelPrimeExecutor } from "../src/game/SentinelPrimeExecutor.js";
import { PRIME_R1_ACTION_BINDINGS, PRIME_R1_BASELINE, PRIME_R1_MANIFEST_SHA256 } from "../src/world/PrimeR1Authority.js";

const candidateTargets = [{ targetId: "zkft:v1:target", subjectId: "zke:v1:subject" }];
const entries = Array.from({ length: 13 }, (_, actionIndex) => ({ actionIndex, legal: true, requiresTarget: ![0, 11, 12].includes(actionIndex), targets: candidateTargets }));
let issued = 0;
const runtime = {
  currentQuantum: 40,
  controller: { issue(options) { issued += 1; return { command: { commandId: `cmd:${issued}`, ...options } }; } },
  captureCommandContext(factionId, { quantum }) { return { observation: { worldId: "zkw:v1:world", factionId }, state: { stateId: "zkfs:v1:state" }, candidateSet: { candidateSetId: "zkfc:v1:set", entries }, quantum }; },
  captureRuntimeSnapshot() { return { issued }; },
};
function result(index = 0, overrides = {}) {
  const binding = PRIME_R1_ACTION_BINDINGS[index];
  const mask = [1, 1, 1, 1, 1, 1];
  return { recommendation: { worldId: "zkw:v1:world", factionId: "zkf:v1:faction", quantum: 40, observationId: "zkob:v1:obs", finalMaskHash: "mask", selectedActionIndex: index, selectedActionKey: binding.primeKey, selectedSubjectId: index ? "zke:v1:subject" : null, recommendationId: `zkpr:v1:${String(index).padStart(16, "0")}`, rankedActions: mask.map((legal, actionIndex) => ({ actionIndex, legal: !!legal })) }, legality: { worldId: "zkw:v1:world", factionId: "zkf:v1:faction", quantum: 40, finalMaskHash: "mask", finalMask: mask }, comparison: null, ...overrides };
}

const executor = new SentinelPrimeExecutor({ commandIntegration: runtime, quantumProvider: () => 40 });
assert.deepEqual(executor.status().authority, { tier: "R0", canDispatch: false, canMutateLiveWorld: false });
for (let i = 0; i < 6; i++) assert.equal(executor.dryRun(result(i)).action.commandIndex, PRIME_R1_ACTION_BINDINGS[i].commandIndex);
const illegal = result(1); illegal.legality.finalMask[1] = 0; illegal.recommendation.rankedActions[1].legal = false;
assert.throws(() => executor.dryRun(illegal), /illegal recommendation/);
assert.throws(() => executor.dryRun(result(0), { quantum: 42 }), /stale/);
assert.throws(() => executor.dryRun(result(0), { provenance: { ...PRIME_R1_BASELINE, gitHead: "drift" } }), /provenance mismatch/);
assert.throws(() => executor.execute(result(0)), /authority token/);
assert.throws(() => executor.authorize({ manifestHash: "a", authorizationId: "human", sessionId: "local" }), /mismatched/);
const token = executor.authorize({ manifestHash: PRIME_R1_MANIFEST_SHA256, authorizationId: "human-test", sessionId: "local-test" });
assert.equal(executor.status().authority.tier, "R1_LIMITED");
assert.equal(executor.execute(result(0), { authorityToken: token }).executedCommand.actionIndex, 0);
assert.equal(issued, 1);
assert.throws(() => executor.execute(result(0), { authorityToken: token }), /repeated-command loop/);
assert.equal(executor.status().authority.tier, "R0");
assert.equal(executor.status().killed, true);
console.log("Sentinel Prime R1 authority tests passed.");
