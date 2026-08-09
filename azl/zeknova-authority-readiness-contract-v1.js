/* Stage 1A-Z.12 Authority Readiness Contract v1 */
(function(root,factory){
  var api=factory(root.ZekNovaIdentityContract,root.ZekNovaLiveShadowContract);
  root.ZekNovaAuthorityReadinessContract=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Identity,LiveShadow){'use strict';
if(!Identity||!LiveShadow)throw new Error('Stage 1A-Z.12 dependencies missing.');
var CONTRACT_ID='zeknova-authority-readiness-contract-v1';
var AUTHORITY='none-assess-and-deny-by-default';
var REPORT_PREFIX='zkar-report:v1:';
var LEVELS=Object.freeze({R0:'R0_OBSERVATION_ONLY',R1:'R1_PRODUCTION_SHADOW',R2:'R2_RECOMMENDATION_ONLY',R3:'R3_LIMITED_REVERSIBLE_AUTHORITY',R4:'R4_FULL_SENTINEL_AUTHORITY'});
function c(v){return Identity.canonicalize(v)}
function b(v){return v===true}
function defaultEvidence(){return c({
  schemaVersion:1,
  evaluatedStage:'Stage 1A-Z.12',
  upstream:{
    stage1az8:{reportId:'zkbic-report:v1:733adfee5abca0b0',baselineGatesPassed:true,actualIncumbentAdapterCertified:false,actualIncumbentComparisonCompleted:false},
    stage1az9:{reportId:'zkesc-report:v1:7ba6e737c00777c5',expandedScenarioGatesPassed:false,objectiveSuccess:0.6942,settlementSurvival:0.8795},
    stage1az10:{reportId:'zkee-report:v1:826f2086c7e6f3c0',expertEvaluationGatesPassed:true,expertFusionApproved:false,routerLearningApproved:false},
    stage1az11:{reportId:'zkls-report:v1:a28c0a144e29d25e',implementationGatesPassed:true,liveShadowEvidenceCollected:false,productionShadowDeploymentCertified:false}
  },
  operational:{
    macReproductionPassed:false,
    minimumLiveShadowSessionsMet:false,
    minimumLiveShadowDecisionsMet:false,
    rollbackDrillPassed:false,
    killSwitchVerified:false,
    commandBoundaryVerified:false,
    driftMonitoringVerified:false,
    incidentResponseRunbookApproved:false,
    humanApprovalRecorded:false
  }
});}
function merge(base,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))return patch===undefined?base:patch;
  var out={},k;for(k in base)out[k]=base[k];for(k in patch){out[k]=(patch[k]&&typeof patch[k]==='object'&&!Array.isArray(patch[k]))?merge(base[k]||{},patch[k]):patch[k];}return out;
}
function evaluate(evidencePatch){
  var e=c(merge(defaultEvidence(),evidencePatch||{})),u=e.upstream,o=e.operational;
  var gates=c({
    priorImplementationGate:b(u.stage1az11.implementationGatesPassed),
    crossPlatformReproductionGate:b(o.macReproductionPassed),
    actualIncumbentCertificationGate:b(u.stage1az8.actualIncumbentAdapterCertified)&&b(u.stage1az8.actualIncumbentComparisonCompleted),
    expandedScenarioPerformanceGate:b(u.stage1az9.expandedScenarioGatesPassed),
    expertEvidenceGate:b(u.stage1az10.expertEvaluationGatesPassed),
    productionShadowEvidenceGate:b(u.stage1az11.liveShadowEvidenceCollected)&&b(u.stage1az11.productionShadowDeploymentCertified)&&b(o.minimumLiveShadowSessionsMet)&&b(o.minimumLiveShadowDecisionsMet),
    reversibleControlGate:b(o.rollbackDrillPassed)&&b(o.killSwitchVerified)&&b(o.commandBoundaryVerified),
    operationsGate:b(o.driftMonitoringVerified)&&b(o.incidentResponseRunbookApproved),
    humanApprovalGate:b(o.humanApprovalRecorded)
  });
  var shadowReady=gates.priorImplementationGate&&gates.crossPlatformReproductionGate&&gates.actualIncumbentCertificationGate&&gates.productionShadowEvidenceGate;
  var recommendationReady=shadowReady&&gates.expandedScenarioPerformanceGate&&gates.expertEvidenceGate&&gates.operationsGate;
  var limitedAuthorityReady=recommendationReady&&gates.reversibleControlGate&&gates.humanApprovalGate;
  var fullAuthorityReady=limitedAuthorityReady&&b(u.stage1az10.expertFusionApproved)&&b(u.stage1az10.routerLearningApproved);
  var level=fullAuthorityReady?LEVELS.R4:limitedAuthorityReady?LEVELS.R3:recommendationReady?LEVELS.R2:shadowReady?LEVELS.R1:LEVELS.R0;
  var blockers=[];Object.keys(gates).forEach(function(k){if(!gates[k])blockers.push(k);});
  if(!b(u.stage1az10.expertFusionApproved))blockers.push('expertFusionApprovalGate');
  if(!b(u.stage1az10.routerLearningApproved))blockers.push('routerLearningApprovalGate');
  blockers=Array.from(new Set(blockers)).sort();
  var body=c({schemaVersion:1,contractId:CONTRACT_ID,authority:AUTHORITY,sourceShadowContractId:LiveShadow.CONTRACT_ID,readinessLevel:level,authorityDecision:fullAuthorityReady?'ELIGIBLE_FOR_SEPARATE_HUMAN_AUTHORIZATION':'DENIED',currentExecutionPolicy:'incumbent-only',primeExecutionPermitted:false,commandInterfaceExposed:false,worldMutationPermitted:false,gates:gates,blockers:blockers,evidence:e,productionReadinessApproved:false,strategicCompetenceCertified:false,limitedAuthorityApproved:false,fullAuthorityApproved:false});
  return c(Object.assign({},body,{reportId:REPORT_PREFIX+Identity.hash64x2(body)}));
}
function authorityToken(){throw new Error('Stage 1A-Z.12 does not issue authority tokens.');}
return Object.freeze({CONTRACT_ID:CONTRACT_ID,AUTHORITY:AUTHORITY,LEVELS:LEVELS,defaultEvidence:defaultEvidence,evaluate:evaluate,authorityToken:authorityToken});
});
