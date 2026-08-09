#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
for(const f of ['zeknova-identity-contract-v1.js','zeknova-perception-event-contract-v1.js','zeknova-knowledge-ledger-contract-v1.js','zeknova-faction-observation-contract-v1.js','zeknova-forest-defensive-action-contract-v1.js','zeknova-forest-defensive-command-contract-v2.js','zeknova-live-parity-closure-contract-v1.js','zeknova-forest-objective-scenario-contract-v1.js','zeknova-sentinel-prime-policy-evaluation-contract-v1.js','zeknova-prime-search-observability-contract-v1.js','zeknova-prime-root-exploration-correction-contract-v1.js','zeknova-prime-value-objective-calibration-contract-v1.js','zeknova-prime-horizon-delayed-consequences-contract-v1.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,'azl',f),'utf8'),{filename:f});
const C=globalThis.ZekNovaPrimeHorizonDelayedConsequencesContract,S=globalThis.ZekNovaForestObjectiveScenarioContract;let n=0;
function t(name,fn){fn();n++;console.log('  PASS '+name)}
t('contract identity',()=>assert.equal(C.CONTRACT_ID,'zeknova-prime-horizon-delayed-consequences-contract-v1'));
t('authority none',()=>assert.equal(C.AUTHORITY,'none-no-live-command-execution'));
t('five isolated variants',()=>assert.equal(C.VARIANT_COUNT,5));
t('candidate is selective horizon',()=>assert.match(C.CANDIDATE_POLICY_ID,/selective-horizon/));
for(const sc of S.SCENARIOS){
 const seed=29011+sc.id.length*67,state=S.createScenarioState(sc.id,seed);
 const frozen=C.searchDecision(state,sc,'prime-z4-terminal-calibrated-frozen-reproduction');
 const candidate=C.searchDecision(state,sc,C.CANDIDATE_POLICY_ID);
 t(sc.id+' frozen deterministic',()=>assert.deepEqual(frozen,C.searchDecision(state,sc,'prime-z4-terminal-calibrated-frozen-reproduction')));
 t(sc.id+' candidate deterministic',()=>assert.deepEqual(candidate,C.searchDecision(state,sc,C.CANDIDATE_POLICY_ID)));
 t(sc.id+' root coverage preserved',()=>assert.equal(candidate.rootCoverageCount,candidate.legalRootActionCount));
 t(sc.id+' budget unchanged',()=>assert.equal(candidate.simulations,96));
 t(sc.id+' candidate max depth bounded',()=>assert.equal(candidate.maxDepth,10));
}
const r=C.evaluateAll(1,1);
t('canonical report id',()=>assert.match(r.reportId,/^zkphdc-report:v1:/));
t('candidate selected',()=>assert.equal(r.candidatePolicyId,C.CANDIDATE_POLICY_ID));
t('small report deterministic',()=>assert.deepEqual(r,C.evaluateAll(1,1)));
t('root exploration unchanged',()=>assert.equal(r.diagnosis.rootExplorationChanged,false));
t('value calibration unchanged',()=>assert.equal(r.diagnosis.valueCalibrationChanged,false));
t('budget unchanged',()=>assert.equal(r.diagnosis.simulationBudgetChanged,false));
t('dynamics unchanged',()=>assert.equal(r.diagnosis.scenarioDynamicsChanged,false));
t('no witness plans',()=>assert.equal(r.diagnosis.candidateUsesAuthoredWitnessPlans,false));
t('all horizon gates pass',()=>assert.equal(r.horizonDelayedConsequenceGates.allHorizonDelayedConsequenceGatesPassed,true));
t('no executor',()=>assert.equal(typeof C.execute,'undefined'));
console.log(`STAGE 1A-Z.5 PRIME HORIZON AND DELAYED CONSEQUENCES TESTS PASS (${n}/${n})`);
