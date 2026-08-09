'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
for (const file of [
  'zeknova-identity-contract-v1.js',
  'zeknova-perception-event-contract-v1.js',
  'zeknova-knowledge-ledger-contract-v1.js',
  'zeknova-faction-observation-contract-v1.js',
  'zeknova-forest-defensive-action-contract-v1.js',
  'zeknova-forest-defensive-command-contract-v2.js',
  'zeknova-live-parity-closure-contract-v1.js',
  'zeknova-forest-objective-scenario-contract-v1.js',
]) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'azl', file), 'utf8'), { filename: file });

const C = globalThis.ZekNovaForestObjectiveScenarioContract;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  PASS ' + name); }
function throws(name, fn, pattern) { test(name, () => assert.throws(fn, pattern)); }

const successRuns = {};

test('contract identity', () => assert.equal(C.CONTRACT_ID, 'zeknova-forest-objective-scenario-contract-v1'));
test('registry identity', () => assert.equal(C.REGISTRY_ID, 'zeknova-forest-objective-scenarios-v1-development'));
test('objective profile identity', () => assert.equal(C.OBJECTIVE_PROFILE_ID, 'zeknova-forest-defensive-objective-v1'));
test('certification identity', () => assert.equal(C.CERTIFICATION_ID, 'zeknova-forest-defensive-scenario-certification-v1'));
test('mode evaluation only', () => assert.equal(C.MODE, 'evaluation-only-no-live-command-execution'));
test('authority none', () => assert.equal(C.AUTHORITY, 'none-no-live-command-execution'));
test('seven scenarios declared', () => assert.equal(C.SCENARIO_COUNT, 7));
test('nine objective priorities', () => assert.equal(C.OBJECTIVE_PROFILE.priorities.length, 9));
test('objective comparison lexicographic', () => assert.equal(C.OBJECTIVE_PROFILE.comparison, 'lexicographic-no-weighted-tradeoff'));
test('settlement survival first', () => assert.equal(C.OBJECTIVE_PROFILE.priorities[0].key, 'settlement_survival'));
test('deescalation last', () => assert.equal(C.OBJECTIVE_PROFILE.priorities[8].key, 'deescalation'));
test('objective ranks canonical', () => assert.deepEqual(C.OBJECTIVE_PROFILE.priorities.map(p => p.rank), [0,1,2,3,4,5,6,7,8]));
test('scenario ids unique', () => assert.equal(new Set(C.SCENARIOS.map(s => s.id)).size, 7));
test('all horizons positive', () => assert.ok(C.SCENARIOS.every(s => s.horizonQuanta > 0)));
test('all success plans declared', () => assert.ok(C.SCENARIOS.every(s => s.successPlan.length > 0)));
test('all failure plans declared', () => assert.ok(C.SCENARIOS.every(s => s.failurePlan.length > 0)));
test('all critical actions declared', () => assert.ok(C.SCENARIOS.every(s => s.criticalActions.length > 0)));
test('all required actions exist', () => assert.ok(C.SCENARIOS.every(s => s.requiredActions.every(k => globalThis.ZekNovaForestDefensiveActionContract.ACTIONS.some(a => a.key === k)))));

for (const scenario of C.SCENARIOS) {
  test(scenario.id + ' representable', () => assert.equal(C.representability(scenario.id).representable, true));
  test(scenario.id + ' no missing mechanics', () => assert.deepEqual(C.representability(scenario.id).missingMechanics, []));
}

const stateA = C.createScenarioState('damaged-core', 18427);
const stateB = C.createScenarioState('damaged-core', 18427);
test('state deterministic bytes', () => assert.equal(globalThis.ZekNovaIdentityContract.canonicalStringify(stateA), globalThis.ZekNovaIdentityContract.canonicalStringify(stateB)));
test('state deterministic id', () => assert.equal(stateA.stateId, stateB.stateId));
test('state validates', () => assert.equal(C.validateState(stateA).stateId, stateA.stateId));
test('repair legal in damaged core', () => assert.equal(C.legalReason(stateA, 'repair_known_structure'), null));
test('secure resource lacks target in damaged core', () => assert.equal(C.legalReason(stateA, 'secure_known_resource'), 'no_eligible_target'));
test('hold always legal in live scenario', () => assert.equal(C.legalReason(stateA, 'hold_settlement_perimeter'), null));
const repaired = C.stepScenario(stateA, 'repair_known_structure');
test('repair completes', () => assert.equal(repaired.completed, true));
test('repair consumes three quanta', () => assert.equal(repaired.endQuantum, 3));
test('repair clears damage flag', () => assert.equal(repaired.state.flags.structureDamaged, false));
test('repair restores critical health', () => assert.ok(repaired.state.criticalStructureHealth >= 75));
test('repair materials exact once', () => assert.equal(repaired.state.capacities.materials, 8));
test('repair cooldown exact', () => assert.equal(repaired.state.cooldownUntil[6], 6));

const patrolState = C.createScenarioState('exposed-patrol', 18427);
test('withdraw legal for exposed patrol', () => assert.equal(C.legalReason(patrolState, 'withdraw_exposed_patrol'), null));
const withdrawn = C.stepScenario(patrolState, 'withdraw_exposed_patrol');
test('withdraw clears exposure', () => assert.equal(withdrawn.state.flags.patrolExposed, false));
test('withdraw preserves patrol', () => assert.ok(withdrawn.state.patrolIntegrity >= 35));
test('withdraw duration one', () => assert.equal(withdrawn.endQuantum, 1));

for (const scenario of C.SCENARIOS) {
  const good = C.runScenario(scenario.id, scenario.successPlan, 19001);
  const bad = C.runScenario(scenario.id, scenario.failurePlan, 19001);
  successRuns[scenario.id] = good;
  test(scenario.id + ' success witness completes', () => assert.equal(good.objectiveComplete, true));
  test(scenario.id + ' failure witness fails', () => assert.equal(bad.objectiveComplete, false));
  test(scenario.id + ' success vector beats failure', () => assert.equal(C.compareObjectiveVectors(good.finalObjectiveVector, bad.finalObjectiveVector), 1));
  test(scenario.id + ' run deterministic', () => assert.equal(good.runId, C.runScenario(scenario.id, scenario.successPlan, 19001).runId));
}

test('multi-crisis success preserves core', () => assert.ok(successRuns['multi-crisis-priority'].finalState.criticalStructureHealth >= 70));
test('multi-crisis may sacrifice resource', () => assert.equal(successRuns['multi-crisis-priority'].finalState.flags.resourceSecured, false));
test('deescalation success lowers tension', () => assert.ok(successRuns['deescalation-window'].finalState.metrics.tension <= 78));
test('deescalation success raises trust', () => assert.ok(successRuns['deescalation-window'].finalState.metrics.trust >= 32));
test('resource success secures resource', () => assert.equal(successRuns['resource-corridor'].finalState.flags.resourceSecured, true));
test('cascade success restores route', () => assert.equal(successRuns['route-infrastructure-cascade'].finalState.flags.routeDamaged, false));
test('cascade success restores infrastructure', () => assert.equal(successRuns['route-infrastructure-cascade'].finalState.flags.infrastructureDegraded, false));

const cert = C.certifyAll(16);
test('certification report canonical', () => assert.equal(C.validateCertification(cert).reportId, cert.reportId));
test('all scenarios certified', () => assert.equal(cert.allScenariosCertified, true));
test('certification scenario count', () => assert.equal(cert.scenarioCount, 7));
test('certification seed count', () => assert.equal(cert.seedCount, 16));
test('every success witness rate one', () => assert.ok(cert.results.every(r => r.successWitnessRate === 1)));
test('every failure witness rate one', () => assert.ok(cert.results.every(r => r.failureWitnessRate === 1)));
test('every ablation failure rate one', () => assert.ok(cert.results.every(r => r.ablatedFailureRate === 1)));
test('every objective vector win rate one', () => assert.ok(cert.results.every(r => r.objectiveVectorWinRate === 1)));
test('every scenario deterministic', () => assert.ok(cert.results.every(r => r.deterministic)));
test('strategic competence remains false', () => assert.equal(cert.strategicCompetenceClaim, false));
test('production authority remains false', () => assert.equal(cert.productionAuthorityClaim, false));
test('certification authority none', () => assert.equal(cert.authority, 'none-no-live-command-execution'));
test('repeated certification deterministic', () => assert.equal(cert.reportId, C.certifyAll(16).reportId));

throws('unknown scenario rejected', () => C.createScenarioState('missing', 1), /Unknown scenarioId/);
throws('zero seed rejected', () => C.createScenarioState('damaged-core', 0), /seed/);
throws('unknown action rejected', () => C.legalReason(stateA, 'attack_settlement'), /Unknown Forest action/);
throws('illegal target action rejected', () => C.stepScenario(stateA, 'secure_known_resource'), /Illegal scenario action/);
throws('tampered state rejected', () => C.validateState({ ...stateA, criticalStructureHealth: 99 }), /stateId mismatch/);
throws('invalid objective vector rejected', () => C.compareObjectiveVectors([1], [1]), /nine values/);
throws('empty plan rejected', () => C.runScenario('damaged-core', [], 1), /plan/);
throws('too many seeds rejected', () => C.certifyAll(65), /seedCount/);
throws('tampered certification rejected', () => C.validateCertification({ ...cert, allScenariosCertified:false }), /does not match/);

test('contract exposes no execute method', () => assert.equal(typeof C.execute, 'undefined'));
test('contract exposes no dispatch method', () => assert.equal(typeof C.dispatch, 'undefined'));
test('contract exposes no apply method', () => assert.equal(typeof C.apply, 'undefined'));
test('contract exposes no Prime executor', () => assert.equal(typeof C.executePrimeRecommendation, 'undefined'));
test('certification contains no wall clock', () => assert.equal(/timestamp|generatedAt|Date\(/.test(JSON.stringify(cert)), false));

console.log(`STAGE 1A-Z FOREST OBJECTIVE SCENARIO CONTRACT TESTS PASS (${passed}/${passed})`);
