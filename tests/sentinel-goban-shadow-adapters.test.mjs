import assert from "node:assert/strict";
import { adaptGobanPlan, compareGobanOutcomes, verifyGobanAdapterCampaign } from "../src/world/SentinelGobanShadowAdapters.js";
import { SentinelGobanShadowIntegration } from "../src/game/SentinelGobanShadowIntegration.js";

const positions = [{ x: 0, z: 0 }, { x: 5, z: 3 }, { x: 10, z: 6 }, { x: 15, z: 9 }, { x: 20, z: 12 }, { x: 25, z: 15 }, { x: 30, z: 18 }, { x: 35, z: 21 }, { x: 40, z: 24 }, { x: 45, z: 27 }];
const roles = ["civilian", "worker", "scout", "stalker", "saboteur", "spitter", "skyray", "burrower", "juggernaut", "boss"];
const state = { quantum: 7, tension: 88, actors: roles.map((role, index) => ({ id: `${role}-1`, role, faction: "zeknovan", position: positions[index] })), infrastructure: [
  { id: "shelter-1", type: "shelter", status: "operational", position: { x: 2, z: 2 } },
  { id: "grid-1", type: "power", status: "damaged", position: { x: 22, z: 13 } },
], buildSites: [{ id: "site-1", type: "defense", position: { x: 28, z: 14 } }], threats: [{ id: "human-1", type: "player", position: { x: 4, z: 2 } }] };

const proposal = adaptGobanPlan(state);
assert.equal(proposal.canDispatch, false);
assert.equal(proposal.canMutateLiveWorld, false);
assert.equal(proposal.commands.length, 14);
for (const command of proposal.commands) {
  assert.ok(command.sourceStateHash && command.planId && command.commandId);
  assert.match(command.gobanCoordinate, /^g\d\d-\d\d$/);
  assert.ok(command.actorId && command.role && command.intent && command.target.entityId);
  assert.ok(command.baselineAction && command.candidateAction && command.predictedOutcome && command.runtimeProvenance);
  assert.ok(command.rollback);
  assert.equal(command.shadowOnly, true);
}
assert.equal(proposal.commands.find((x) => x.role === "civilian").legalActionEvidence.civilianNonlethal, true);
const boss = proposal.commands.find((x) => x.role === "boss");
assert.ok(boss.combatSequence.indexOf("telegraph") < boss.combatSequence.indexOf("engage"));
assert.throws(() => adaptGobanPlan(state, { provenance: { adapterVersion: "drift" } }), /provenance mismatch/);

const metrics = { survival: 1, civilianSafety: 1, infrastructurePreservation: .9, objectiveCompletion: .8, resourceEfficiency: .7, positioningQuality: .8, unnecessaryEscalation: .1, missionOutcome: .8 };
assert.equal(compareGobanOutcomes({ baseline: metrics, candidate: { ...metrics, survival: 1.1 } }).superiorityClaimAllowed, true);
assert.equal(compareGobanOutcomes({ baseline: metrics, candidate: {} }).promotionBlocked, true);
const campaign = verifyGobanAdapterCampaign([{ state }, { state: { ...state, tension: 20 } }], { baseline: metrics, candidate: { ...metrics, civilianSafety: 1.1 } });
assert.equal(campaign.roleAdapterDeterminism, true);
assert.equal(campaign.unsupportedCommandCount, 0);
assert.equal(campaign.illegalActionCount, 0);
assert.equal(campaign.civilianLethalActionCount, 0);
assert.equal(campaign.bossUntelegraphedEngagementCount, 0);
assert.equal(campaign.unauthorizedMutationCount, 0);
assert.equal(campaign.rollbackPathsVerified, true);
assert.equal(campaign.liveAuthorityAuthorized, false);

const game = { perceptionQuantum: 9, diplomacyTension: 80, enemies: [{ uuid: "enemy-live", userData: { enemyType: "spitter" }, position: { x: 1, z: 1 } }], buildings: { items: [{ id: "live-grid", type: "power", status: "damaged", position: { x: 4, z: 4 } }] }, player: { group: { userData: { entityId: "player-live" }, position: { x: 7, z: 7 } } }, bossManager: { active: null } };
const live = new SentinelGobanShadowIntegration({ game });
const before = structuredClone(game), evidence = live.runShadow({ incumbentActions: { "enemy-live": "incumbent_spitter_pursuit" } });
assert.equal(evidence.authenticSession, false, "fixture evidence must not masquerade as authentic-session parity");
assert.equal(evidence.unauthorizedMutationCount, 0);
assert.deepEqual(game, before);
assert.equal(live.captureEvidence().length, 1);
const coverage = live.certifyCoverage({ inheritedEvidenceCount: 6 });
assert.equal(coverage.authenticEvidenceCount, 6);
assert.equal(coverage.counterfactualOutcomeBinding, false);
assert.equal(coverage.baselineComparisonComplete, false);
assert.equal(coverage.liveAuthorityRecommendation, "REJECT");
assert.equal(coverage.capabilities.counterfactualEvaluator.available, false);
assert.equal(coverage.capabilities.dispatchSurfaceAbsent, true);
console.log("Sentinel Goban R0 shadow adapter tests passed.");
