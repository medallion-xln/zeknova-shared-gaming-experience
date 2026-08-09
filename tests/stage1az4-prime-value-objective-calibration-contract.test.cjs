#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
for(const f of ['zeknova-identity-contract-v1.js','zeknova-perception-event-contract-v1.js','zeknova-knowledge-ledger-contract-v1.js','zeknova-faction-observation-contract-v1.js','zeknova-forest-defensive-action-contract-v1.js','zeknova-forest-defensive-command-contract-v2.js','zeknova-live-parity-closure-contract-v1.js','zeknova-forest-objective-scenario-contract-v1.js','zeknova-sentinel-prime-policy-evaluation-contract-v1.js','zeknova-prime-search-observability-contract-v1.js','zeknova-prime-root-exploration-correction-contract-v1.js','zeknova-prime-value-objective-calibration-contract-v1.js'])vm.runInThisContext(fs.readFileSync(path.join(ROOT,'azl',f),'utf8'),{filename:f});
const C=globalThis.ZekNovaPrimeValueObjectiveCalibrationContract,S=globalThis.ZekNovaForestObjectiveScenarioContract;let n=0;
function t(name,fn){fn();n++;console.log('  PASS '+name)}
t('contract identity',()=>assert.equal(C.CONTRACT_ID,'zeknova-prime-value-objective-calibration-contract-v1'));
t('root coverage dependency',()=>assert.equal(C.ROOT_EXPLORATION_CONTRACT_ID,'zeknova-prime-root-exploration-correction-contract-v1'));
t('authority none',()=>assert.equal(C.AUTHORITY,'none-no-live-command-execution'));
t('five isolated variants',()=>assert.equal(C.VARIANT_COUNT,5));
for(const sc of S.SCENARIOS){
 const seed=28001+sc.id.length*61,state=S.createScenarioState(sc.id,seed);
 const frozen=C.searchDecision(state,sc,'prime-z3-root-coverage-frozen-reproduction');
 const candidate=C.searchDecision(state,sc,C.CANDIDATE_POLICY_ID);
 t(sc.id+' frozen deterministic',()=>assert.deepEqual(frozen,C.searchDecision(state,sc,'prime-z3-root-coverage-frozen-reproduction')));
 t(sc.id+' candidate deterministic',()=>assert.deepEqual(candidate,C.searchDecision(state,sc,C.CANDIDATE_POLICY_ID)));
 t(sc.id+' candidate covers all roots',()=>assert.equal(candidate.rootCoverageCount,candidate.legalRootActionCount));
 t(sc.id+' candidate budget unchanged',()=>assert.equal(candidate.simulations,96));
}
const r=C.evaluateAll(1,1);
t('canonical report id',()=>assert.match(r.reportId,/^zkpvoc-report:v1:/));
t('candidate selected',()=>assert.equal(r.candidatePolicyId,C.CANDIDATE_POLICY_ID));
t('small report deterministic',()=>assert.deepEqual(r,C.evaluateAll(1,1)));
t('root exploration unchanged',()=>assert.equal(r.diagnosis.rootExplorationChanged,false));
t('horizon unchanged',()=>assert.equal(r.diagnosis.horizonChanged,false));
t('budget unchanged',()=>assert.equal(r.diagnosis.simulationBudgetChanged,false));
t('rollout unchanged',()=>assert.equal(r.diagnosis.rolloutChanged,false));
t('all calibration gates pass',()=>assert.equal(r.valueObjectiveCalibrationGates.allValueObjectiveCalibrationGatesPassed,true));
t('no executor',()=>assert.equal(typeof C.execute,'undefined'));
console.log(`STAGE 1A-Z.4 PRIME VALUE AND OBJECTIVE CALIBRATION TESTS PASS (${n}/${n})`);
