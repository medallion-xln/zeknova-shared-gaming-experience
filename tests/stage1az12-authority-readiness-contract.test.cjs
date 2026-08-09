#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const R1=path.resolve(__dirname,'..'),R2=path.resolve(__dirname,'../..');
const base=fs.existsSync(path.join(R1,'azl'))?path.join(R1,'azl'):path.join(R2,'public_html/azl');
const identityPath=path.join(base,'zeknova-identity-contract-v1.js');
if(fs.existsSync(identityPath))vm.runInThisContext(fs.readFileSync(identityPath,'utf8'),{filename:'identity'});
else { const sort=v=>Array.isArray(v)?v.map(sort):(v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v); globalThis.ZekNovaIdentityContract={canonicalize:v=>sort(JSON.parse(JSON.stringify(v))),hash64x2:v=>require('node:crypto').createHash('sha256').update(JSON.stringify(sort(v))).digest('hex').slice(0,16)}; }
globalThis.ZekNovaLiveShadowContract={CONTRACT_ID:'zeknova-live-shadow-contract-v1'};
vm.runInThisContext(fs.readFileSync(path.join(base,'zeknova-authority-readiness-contract-v1.js'),'utf8'),{filename:'stage1az12'});
const C=globalThis.ZekNovaAuthorityReadinessContract;let n=0;function t(s,f){f();n++;console.log('  PASS '+s)}
t('identity',()=>assert.equal(C.CONTRACT_ID,'zeknova-authority-readiness-contract-v1'));
t('authority denied by default',()=>assert.equal(C.AUTHORITY,'none-assess-and-deny-by-default'));
const a=C.evaluate(),b=C.evaluate();
t('deterministic',()=>assert.deepEqual(a,b));
t('current level R0',()=>assert.equal(a.readinessLevel,C.LEVELS.R0));
t('decision denied',()=>assert.equal(a.authorityDecision,'DENIED'));
t('incumbent remains executor',()=>assert.equal(a.currentExecutionPolicy,'incumbent-only'));
t('Prime cannot execute',()=>assert.equal(a.primeExecutionPermitted,false));
t('no command interface',()=>assert.equal(a.commandInterfaceExposed,false));
t('no world mutation',()=>assert.equal(a.worldMutationPermitted,false));
t('known blockers retained',()=>assert.ok(a.blockers.includes('expandedScenarioPerformanceGate')&&a.blockers.includes('productionShadowEvidenceGate')&&a.blockers.includes('actualIncumbentCertificationGate')));
t('no authority issuance',()=>assert.throws(()=>C.authorityToken(),/does not issue authority tokens/));
const complete=C.evaluate({upstream:{stage1az8:{actualIncumbentAdapterCertified:true,actualIncumbentComparisonCompleted:true},stage1az9:{expandedScenarioGatesPassed:true},stage1az10:{expertFusionApproved:true,routerLearningApproved:true},stage1az11:{liveShadowEvidenceCollected:true,productionShadowDeploymentCertified:true}},operational:{macReproductionPassed:true,minimumLiveShadowSessionsMet:true,minimumLiveShadowDecisionsMet:true,rollbackDrillPassed:true,killSwitchVerified:true,commandBoundaryVerified:true,driftMonitoringVerified:true,incidentResponseRunbookApproved:true,humanApprovalRecorded:true}});
t('complete evidence only marks eligibility',()=>assert.equal(complete.authorityDecision,'ELIGIBLE_FOR_SEPARATE_HUMAN_AUTHORIZATION'));
t('even complete evidence does not self-approve',()=>assert.equal(complete.fullAuthorityApproved,false));
console.log(`STAGE 1A-Z.12 AUTHORITY READINESS TESTS PASS (${n}/${n})`);
