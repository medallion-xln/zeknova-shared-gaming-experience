import assert from "node:assert/strict";
import { GOBAN_POINT_COUNT, createGobanStrategy, gobanPoint, verifyGobanIntelligence, worldToGoban } from "../src/world/SentinelGobanIntelligence.js";

assert.equal(GOBAN_POINT_COUNT, 361);
assert.equal(gobanPoint(18, 18).index, 360);
assert.throws(() => gobanPoint(19, 0), /outside/);
assert.equal(worldToGoban({ x: 0, z: 0 }).id, "g09-09");

const state = { quantum: 12, tension: 82, actors: [
  { id: "civilian-1", role: "civilian", faction: "zeknovan", position: { x: 0, z: 0 } },
  { id: "saboteur-1", role: "saboteur", faction: "zeknovan", position: { x: 20, z: 5 } },
  { id: "boss-1", role: "boss", faction: "zeknovan", position: { x: 40, z: 30 } },
], infrastructure: [
  { id: "shelter-1", type: "shelter", position: { x: -10, z: -10 } },
  { id: "grid-1", type: "power", status: "damaged", position: { x: 25, z: 10 } },
], threats: [{ id: "human-1", type: "unit", position: { x: 2, z: 1 } }] };

const plan = createGobanStrategy(state);
assert.equal(plan.actorPlans.find((x) => x.role === "civilian").intent, "evacuate_to_shelter");
assert.equal(plan.actorPlans.find((x) => x.role === "civilian").lethal, false);
assert.equal(plan.actorPlans.find((x) => x.role === "boss").intent, "phase_strategy_with_telegraphs");
assert.notEqual(plan.actorPlans.find((x) => x.role === "boss").intent, plan.actorPlans.find((x) => x.role === "saboteur").intent);
const report = verifyGobanIntelligence(state, { baselineScore: .4, candidateScore: .7 });
assert.equal(report.intelligenceVerified, true);
assert.equal(report.promotionEligible, true);
assert.equal(report.liveAuthorityApproved, false);
assert.equal(report.plan.authority.canDispatch, false);
assert.equal(verifyGobanIntelligence(state).promotionEligible, false, "no unmeasured policy may self-promote");
console.log("Sentinel 19x19 goban intelligence verification tests passed.");
