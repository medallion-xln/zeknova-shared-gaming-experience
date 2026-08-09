#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),sha=v=>crypto.createHash('sha256').update(v).digest('hex'),fileHash=rel=>sha(fs.readFileSync(path.join(ROOT,rel)));
for(const f of ['zeknova-identity-contract-v1.js','zeknova-perception-event-contract-v1.js','zeknova-knowledge-ledger-contract-v1.js','zeknova-faction-observation-contract-v1.js','zeknova-forest-defensive-action-contract-v1.js','zeknova-forest-defensive-command-contract-v2.js','zeknova-live-parity-closure-contract-v1.js','zeknova-forest-objective-scenario-contract-v1.js','zeknova-sentinel-prime-policy-evaluation-contract-v1.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT,'azl',f),'utf8'),{filename:f});
const I=globalThis.ZekNovaIdentityContract,C=globalThis.ZekNovaSentinelPrimePolicyEvaluationContract,report=C.evaluateAll(16),registry=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/sentinel-prime-policy-evaluation-registry.json'),'utf8'));
const primary=report.policyResults.filter(r=>C.PRIMARY_POLICY_IDS.includes(r.policyId)).map(r=>({policyId:r.policyId,objectiveSuccessRate:r.objectiveSuccessRate,settlementSurvivalRate:r.settlementSurvivalRate,illegalProposalRate:r.illegalProposalRate,scenarioResults:r.scenarioResults.map(s=>({scenarioId:s.scenarioId,objectiveSuccessRate:s.objectiveSuccessRate,settlementSurvivalRate:s.settlementSurvivalRate}))}));
const out=I.canonicalize({
 artifactId:'zeknova-stage1az1-prime-policy-evaluation-v1',phase:'Stage 1A-Z.1',
 contract:{id:C.CONTRACT_ID,registryId:C.REGISTRY_ID,evaluationId:C.EVALUATION_ID,mode:C.MODE,authority:C.AUTHORITY,policyCount:C.POLICY_COUNT,primeSimulations:C.PRIME_SIMULATIONS},
 inherited:{stage1azSentinelDigest:'16f0c5084636555d62fbff43fb08c15a299487ddaef308b4cd0673bfbb3d6c4d',stage1azZeknovaDigest:'4d8738e33385fc216f76caf029c135b759227af3863eae07eddfb6447dc15d98',stage1azStatus:'frozen'},
 evaluation:{reportId:report.reportId,seedCount:report.seedCount,totalRunCount:report.totalRunCount,primaryPolicies:primary,primePairwise:report.primePairwise,primeGates:report.primeGates,strategicCompetenceCertified:report.strategicCompetenceCertified,primeOutperformsActualIncumbentClaim:report.primeOutperformsActualIncumbentClaim,incumbentComparisonStatus:report.incumbentComparisonStatus},
 registry:{sha256:fileHash('docs/governance/sentinel-prime-policy-evaluation-registry.json'),status:registry.status,canonicalReportId:registry.canonicalEvaluation.reportId},
 invariants:{stage1azFrozen:true,eighteenPolicies:true,thirteenSpamControls:true,uniformPriorPuct:true,noAuthoredWitnessPlanReads:true,primeLegal:true,primeDevelopmentGatesPassed:false,noLiveCommandExecution:true,sentinelAuthorityFalse:true,productionAuthorityFalse:true,strategicCompetenceFalse:true,actualIncumbentOutperformanceClaimFalse:true,fullGameDynamicsClaimFalse:true},
 artifacts:{
  contract:{path:'azl/zeknova-sentinel-prime-policy-evaluation-contract-v1.js',sha256:fileHash('azl/zeknova-sentinel-prime-policy-evaluation-contract-v1.js')},
  adapter:{path:'azl/zeknova-sentinel-prime-policy-evaluation-adapter-v1.js',sha256:fileHash('azl/zeknova-sentinel-prime-policy-evaluation-adapter-v1.js')},
  wrapper:{path:'src/world/SentinelPrimePolicyEvaluation.js',sha256:fileHash('src/world/SentinelPrimePolicyEvaluation.js')},
  integration:{path:'src/game/SentinelPrimePolicyEvaluationIntegration.js',sha256:fileHash('src/game/SentinelPrimePolicyEvaluationIntegration.js')},
  registry:{path:'docs/governance/sentinel-prime-policy-evaluation-registry.json',sha256:fileHash('docs/governance/sentinel-prime-policy-evaluation-registry.json')},
  contractTest:{path:'tests/stage1az1-sentinel-prime-policy-evaluation-contract.test.cjs',sha256:fileHash('tests/stage1az1-sentinel-prime-policy-evaluation-contract.test.cjs')},
  integrationTest:{path:'tests/stage1az1-sentinel-prime-policy-evaluation-integration.test.cjs',sha256:fileHash('tests/stage1az1-sentinel-prime-policy-evaluation-integration.test.cjs')},
  main:{path:'src/main.js',sha256:fileHash('src/main.js')},checkSource:{path:'scripts/check-source.mjs',sha256:fileHash('scripts/check-source.mjs')},package:{path:'package.json',sha256:fileHash('package.json')}
 }
});
const canonical=I.canonicalStringify(out),digest=sha(canonical);console.log(JSON.stringify(out,null,2));console.log('ZekNova Stage 1A-Z.1 digest: '+digest);
